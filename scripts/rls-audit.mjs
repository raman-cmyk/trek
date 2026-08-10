/**
 * RLS audit (M9 security pass, docs/05 launch gate).
 *
 * Connects to the local Supabase as an ANON user (no session) and asserts the
 * default-deny contract from CLAUDE.md hard rule #2:
 *   - Sensitive base tables leak NOTHING to anon (0 rows, or an RLS error).
 *   - Public views expose the marketplace (rows returned).
 *   - Anon cannot INSERT into user-owned tables.
 *   - Public review view exposes only *published* reviews.
 *
 * Run against a running local stack:  node scripts/rls-audit.mjs
 * Exits non-zero if any assertion fails, so it can gate a release.
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const ANON =
  process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const anon = createClient(URL, ANON, { auth: { persistSession: false } });

let failures = 0;
const ok = (msg) => console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
const bad = (msg) => {
  failures++;
  console.log(`  \x1b[31m✗ ${msg}\x1b[0m`);
};

// Anon must get NOTHING from these base tables (deny = error, or 0 rows).
const DENY_TABLES = [
  "users",
  "bookings",
  "enquiries",
  "payments",
  "payouts",
  "booking_documents",
  "document_access_log",
  "messages",
  "reviews",
  "checkins",
  "incidents",
  "guide_verifications",
  "guide_strikes",
  "permit_applications",
  "departures",
  "departure_members",
];

// Anon SHOULD read these public views (the marketplace).
const ALLOW_VIEWS = ["public_guides", "public_offerings", "public_reviews"];

async function auditDenyReads() {
  console.log("\n[1] Base tables must not leak to anon");
  for (const t of DENY_TABLES) {
    const { data, error } = await anon.from(t).select("*").limit(5);
    if (error) ok(`${t}: blocked (${error.code || "rls"})`);
    else if (!data || data.length === 0) ok(`${t}: 0 rows (default-deny)`);
    else bad(`${t}: LEAKED ${data.length} row(s) to anon`);
  }
}

async function auditAllowViews() {
  console.log("\n[2] Public views must serve the marketplace to anon");
  for (const v of ALLOW_VIEWS) {
    const { data, error } = await anon.from(v).select("*").limit(5);
    if (error) bad(`${v}: unexpected error ${error.message}`);
    else if (data && data.length > 0) ok(`${v}: ${data.length} row(s) visible`);
    else bad(`${v}: returned 0 rows (should expose seed data)`);
  }
}

async function auditNoPhoneLeak() {
  console.log("\n[3] Public guide view must not expose private columns");
  const { data } = await anon.from("public_guides").select("*").limit(1);
  const row = data?.[0] ?? {};
  const leaked = ["phone", "payout_method", "payout_details", "license_no", "email"].filter(
    (c) => c in row,
  );
  if (leaked.length === 0) ok("public_guides exposes no phone/payout/licence/email");
  else bad(`public_guides LEAKS private columns: ${leaked.join(", ")}`);
}

async function auditGuidePhotosVerifiedOnly() {
  console.log("\n[4a] guide_photos public read is verified-guides-only");
  // Anon may read photos (profile carousel) but only for verified guides.
  const { data: photos, error } = await anon.from("guide_photos").select("guide_id").limit(50);
  if (error) return bad(`guide_photos: unexpected error ${error.message}`);
  if (!photos || photos.length === 0) return ok("guide_photos: none visible (acceptable)");
  const ids = [...new Set(photos.map((p) => p.guide_id))];
  // guide_photos.guide_id == guides.user_id == public_guides.user_id.
  const { data: verified } = await anon
    .from("public_guides")
    .select("user_id")
    .in("user_id", ids);
  const verifiedIds = new Set((verified ?? []).map((g) => g.user_id));
  const unverified = ids.filter((id) => !verifiedIds.has(id));
  if (unverified.length === 0) ok(`guide_photos: all ${photos.length} rows belong to verified guides`);
  else bad(`guide_photos: ${unverified.length} unverified guide(s) exposed photos`);
}

async function auditPublishedOnly() {
  console.log("\n[4] Public reviews must be published-only");
  const { data } = await anon.from("public_reviews").select("*").limit(50);
  const unpublished = (data ?? []).filter((r) => !r.published_at && "published_at" in r);
  if (!data) bad("public_reviews unreadable");
  else if (unpublished.length === 0) ok(`public_reviews: all ${data.length} rows published`);
  else bad(`public_reviews: ${unpublished.length} UNPUBLISHED rows exposed`);
}

async function auditDenyWrites() {
  console.log("\n[5] Anon must not INSERT into user-owned tables");
  const attempts = [
    ["enquiries", { offering_id: "00000000-0000-0000-0000-000000000000", party_size: 1 }],
    ["bookings", { status: "pending_deposit" }],
    ["messages", { body: "hi" }],
    ["reviews", { overall: 5, direction: "trekker_to_guide" }],
  ];
  for (const [t, row] of attempts) {
    const { error } = await anon.from(t).insert(row);
    if (error) ok(`${t}: insert blocked (${error.code || "rls"})`);
    else bad(`${t}: anon INSERT SUCCEEDED — RLS hole`);
  }
}

console.log("RLS audit — anon default-deny contract");
await auditDenyReads();
await auditAllowViews();
await auditNoPhoneLeak();
await auditGuidePhotosVerifiedOnly();
await auditPublishedOnly();
await auditDenyWrites();

console.log(
  failures === 0
    ? "\n\x1b[32mPASS — anon is fully fenced.\x1b[0m"
    : `\n\x1b[31mFAIL — ${failures} assertion(s) failed.\x1b[0m`,
);
process.exit(failures === 0 ? 0 : 1);
