import { Form, Link, data, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/ops.people.$id";
import { Badge, EmptyRow, Panel } from "~/components/ops/ui";
import { Button } from "~/components/Button";
import { cn } from "~/lib/cn";
import { fmtDate, statusLabel } from "~/lib/format";
import { formatNpr, formatUsd } from "~/lib/pricing";
import {
  GUIDE_DOC_KINDS,
  GUIDE_DOC_LABELS,
  type GuideDocKind,
} from "~/lib/guide-documents";
import {
  deleteGuideDocument,
  uploadGuideDocument,
  verifyDocument,
} from "~/lib/documents.server";
import {
  CHECK_LABELS,
  CHECK_STATUSES,
  CHECK_STATUS_LABELS,
  CHECK_TYPES,
  checkLabel,
  isCleared,
  isSettled,
  type CheckStatus,
} from "~/lib/guide-checks";
import { PROFICIENCY_LABELS, type Proficiency } from "~/lib/guide-languages";
import { MAX_TIMES_WALKED, parseTimesWalked } from "~/lib/guide-routes";
import { getEnv, requireOps } from "~/lib/supabase.server";

/**
 * One person, one page.
 *
 * The office used to answer "what is going on with Pemba?" by opening the
 * verification queue, then the pipeline, then payouts, then moderation, and
 * holding the four in their head. Everything that is true about a person now
 * lives here: who they are, what we have verified, the papers we hold, every
 * trip, every payment, and every mark against them — with the edit controls
 * beside the thing being edited rather than on some other screen.
 */


const LIVE = ["deposit_paid", "docs_pending", "confirmed", "active"];

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  const id = params.id!;

  const { data: person } = await admin
    .from("users")
    .select(
      "id, role, full_name, email, phone, country_code, avatar_url, emergency_contact_name, emergency_contact_phone, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!person) throw new Response("No such person", { status: 404 });

  const isGuide = person.role === "guide";

  // Trips either side of the relationship, and everything that hangs off them.
  const { data: bookings } = await admin
    .from("bookings")
    .select(
      "id, status, start_date, end_date, party_size, total_usd_cents, guide_payout_npr_paisa, deposit_paid_at, balance_paid_at, created_at, trekker_id, guide_id, offering:offerings(title, slug), trekker:users!bookings_trekker_id_fkey(full_name)",
    )
    .eq(isGuide ? "guide_id" : "trekker_id", id)
    .order("start_date", { ascending: false })
    .limit(100);

  const bookingIds = (bookings ?? []).map((b: any) => b.id);

  const [
    guideRes,
    langRes,
    checksRes,
    docsRes,
    offeringsRes,
    payoutsRes,
    strikesRes,
    reviewsRes,
    enquiriesRes,
    journalsRes,
    availRes,
    bookingDocsRes,
    paymentsRes,
    incidentsRes,
    routeExpRes,
  ] = await Promise.all([
    isGuide
      ? admin
          .from("guides")
          .select(
            "user_id, slug, status, tier, licence_no, licence_expiry, home_district, years_experience, day_rate_usd_cents, bio, hook_line, voice_intro_url, payout_method, payout_account, payout_account_name, response_rate, median_response_mins, treks_completed_platform, created_at",
          )
          .eq("user_id", id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    isGuide
      ? admin.from("guide_languages").select("language, proficiency").eq("guide_id", id)
      : Promise.resolve({ data: [] }),
    isGuide
      ? admin
          .from("guide_verifications")
          .select("id, check_type, status, notes, verified_at, expires_at")
          .eq("guide_id", id)
      : Promise.resolve({ data: [] }),
    isGuide
      ? admin
          .from("guide_documents")
          // storage_path is deliberately not selected — nothing that could
          // become a URL reaches the browser. Files open via /ops/doc/…
          .select(
            "id, kind, label, mime_type, size_bytes, original_name, issued_on, expires_on, uploaded_at, delete_after, verification_id",
          )
          .eq("guide_id", id)
          .order("uploaded_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    isGuide
      ? admin
          .from("offerings")
          .select("id, title, slug, kind, status, days, price_usd_cents")
          .eq("guide_id", id)
          .order("status")
      : Promise.resolve({ data: [] }),
    isGuide
      ? admin
          .from("payouts")
          .select("id, amount_npr_paisa, status, method, paid_at, batch_ref, booking_id")
          .eq("guide_id", id)
          .order("status")
      : Promise.resolve({ data: [] }),
    isGuide
      ? admin
          .from("guide_strikes")
          .select("id, reason, created_at, booking_id")
          .eq("guide_id", id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    admin
      .from("reviews")
      .select("id, overall, body, direction, published_at, created_at, booking_id")
      .eq(isGuide ? "subject_id" : "author_id", id)
      .order("created_at", { ascending: false })
      .limit(30),
    admin
      .from("enquiries")
      .select(
        "id, status, start_date, party_size, created_at, expires_at, offering:offerings(title), trekker:users(full_name)",
      )
      .eq(isGuide ? "guide_id" : "trekker_id", id)
      .order("created_at", { ascending: false })
      .limit(30),
    isGuide
      ? admin
          .from("journals")
          .select("id, slug, title, start_date, status")
          .eq("guide_id", id)
          .order("start_date", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
    isGuide
      ? admin
          .from("availability")
          .select("status")
          .eq("guide_id", id)
          .gte("day", new Date().toISOString().slice(0, 10))
      : Promise.resolve({ data: [] }),
    // The papers a trekker gave us: passports and insurance, per booking.
    !isGuide && bookingIds.length
      ? admin
          .from("booking_documents")
          .select(
            "id, booking_id, person_name, type, verified_at, delete_after, created_at",
          )
          .in("booking_id", bookingIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    bookingIds.length
      ? admin
          .from("payments")
          .select("id, booking_id, type, amount_usd_cents, status, created_at")
          .in("booking_id", bookingIds)
          .order("created_at", { ascending: false })
          .limit(60)
      : Promise.resolve({ data: [] }),
    bookingIds.length
      ? admin
          .from("incidents")
          .select("id, booking_id, severity, summary, status, opened_at")
          .in("booking_id", bookingIds)
          .order("opened_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    // What they say they have walked. A claim until the office ticks it.
    isGuide
      ? admin
          .from("guide_route_experience")
          .select("route_id, times_walked, verified_at, route:routes(name, region, slug)")
          .eq("guide_id", id)
          .order("times_walked", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const guide: any = (guideRes as any).data ?? null;
  const docs: any[] = (docsRes as any).data ?? [];
  const bookingDocs: any[] = (bookingDocsRes as any).data ?? [];

  // Who has opened this person's papers, and when. Asked for by document id,
  // so the query cannot accidentally show somebody else's history.
  let accessLog: any[] = [];
  const guideDocIds = docs.map((x) => x.id);
  const trekDocIds = bookingDocs.map((x) => x.id);
  if (guideDocIds.length || trekDocIds.length) {
    const clauses: string[] = [];
    if (guideDocIds.length) clauses.push(`guide_document_id.in.(${guideDocIds.join(",")})`);
    if (trekDocIds.length) clauses.push(`document_id.in.(${trekDocIds.join(",")})`);
    const { data: log } = await admin
      .from("document_access_log")
      .select("id, accessed_at, purpose, viewer:users(full_name)")
      .or(clauses.join(","))
      .order("accessed_at", { ascending: false })
      .limit(40);
    accessLog = log ?? [];
  }

  const avail = (availRes as any).data ?? [];

  return data(
    {
      person,
      isGuide,
      guide,
      languages: (langRes as any).data ?? [],
      checks: [...((checksRes as any).data ?? [])].sort((a: any, b: any) =>
        a.check_type.localeCompare(b.check_type),
      ),
      docs,
      bookingDocs,
      offerings: (offeringsRes as any).data ?? [],
      payouts: (payoutsRes as any).data ?? [],
      strikes: (strikesRes as any).data ?? [],
      reviews: (reviewsRes as any).data ?? [],
      enquiries: (enquiriesRes as any).data ?? [],
      journals: (journalsRes as any).data ?? [],
      bookings: bookings ?? [],
      payments: (paymentsRes as any).data ?? [],
      incidents: (incidentsRes as any).data ?? [],
      routeExperience: (routeExpRes as any).data ?? [],
      accessLog,
      availability: {
        open: avail.filter((a: any) => a.status === "open").length,
        booked: avail.filter((a: any) => a.status === "booked").length,
        blocked: avail.filter((a: any) => a.status === "blocked").length,
      },
    },
    { headers },
  );
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireOps(request, env);
  const id = params.id!;
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const str = (k: string) => String(form.get(k) ?? "").trim();
  const nul = (k: string) => str(k) || null;

  if (intent === "profile") {
    const fullName = str("full_name");
    if (fullName.length < 2) {
      return data({ error: "A name is needed." }, { status: 400, headers });
    }
    await admin
      .from("users")
      .update({
        full_name: fullName,
        email: nul("email"),
        phone: nul("phone"),
        country_code: nul("country_code"),
        avatar_url: nul("avatar_url"),
        emergency_contact_name: nul("emergency_contact_name"),
        emergency_contact_phone: nul("emergency_contact_phone"),
      })
      .eq("id", id);
    // Keep the sign-in credential in step with the profile, or a corrected
    // email fixes the mailing list and locks them out of the app.
    const email = nul("email");
    if (email) await admin.auth.admin.updateUserById(id, { email });
    return data({ ok: "Profile saved." }, { headers });
  }

  if (intent === "guide") {
    const numOrNull = (k: string) => {
      const v = Number(form.get(k));
      return Number.isFinite(v) && str(k) !== "" ? v : null;
    };
    const rate = Number(form.get("day_rate_usd"));
    await admin
      .from("guides")
      .update({
        status: str("status"),
        tier: Math.max(0, Math.min(3, Number(form.get("tier")) || 0)),
        licence_no: nul("licence_no"),
        licence_expiry: nul("licence_expiry"),
        home_district: nul("home_district"),
        years_experience: numOrNull("years_experience"),
        day_rate_usd_cents: Number.isFinite(rate) && str("day_rate_usd") !== ""
          ? Math.max(0, Math.round(rate * 100))
          : null,
        hook_line: nul("hook_line"),
        bio: nul("bio"),
        payout_method: nul("payout_method"),
        payout_account: nul("payout_account"),
        payout_account_name: nul("payout_account_name"),
      })
      .eq("user_id", id);
    return data({ ok: "Guide record saved." }, { headers });
  }

  if (intent === "check") {
    const status = str("status");
    if (!(CHECK_STATUSES as readonly string[]).includes(status)) {
      return data({ error: "That isn't a check outcome." }, { status: 400, headers });
    }
    await admin
      .from("guide_verifications")
      .update({
        status,
        notes: nul("notes"),
        verified_by: user.id,
        verified_at: new Date().toISOString(),
      })
      .eq("id", str("verification_id"))
      .eq("guide_id", id);
    return data({ ok: "Check updated." }, { headers });
  }

  if (intent === "add_check") {
    const checkType = str("check_type");
    if (!(CHECK_TYPES as readonly string[]).includes(checkType)) {
      return data({ error: "Pick a check to add." }, { status: 400, headers });
    }
    await admin
      .from("guide_verifications")
      .insert({ guide_id: id, check_type: checkType, status: "pending" });
    return data({ ok: "Check added." }, { headers });
  }

  if (intent === "doc_upload") {
    const file = form.get("file");
    if (!(file instanceof File)) {
      return data({ error: "Choose a file." }, { status: 400, headers });
    }
    const kind = str("kind") as GuideDocKind;
    if (!GUIDE_DOC_KINDS.includes(kind)) {
      return data({ error: "Say what the document is." }, { status: 400, headers });
    }
    const res = await uploadGuideDocument(admin, {
      guideId: id,
      kind,
      file,
      label: nul("label"),
      verificationId: nul("verification_id"),
      issuedOn: nul("issued_on"),
      expiresOn: nul("expires_on"),
      uploadedBy: user.id,
    });
    if (!res.ok) return data({ error: res.error! }, { status: 400, headers });
    return data({ ok: "Document filed." }, { headers });
  }

  if (intent === "doc_delete") {
    // Scoped to this guide so a stray id from another profile cannot delete
    // somebody else's paper.
    const docId = str("document_id");
    const { data: owned } = await admin
      .from("guide_documents")
      .select("id")
      .eq("id", docId)
      .eq("guide_id", id)
      .maybeSingle();
    if (!owned) return data({ error: "That document isn't theirs." }, { status: 400, headers });
    await deleteGuideDocument(admin, docId);
    return data({ ok: "Document deleted." }, { headers });
  }

  if (intent === "verify_booking_doc") {
    await verifyDocument(admin, str("document_id"), user.id);
    return data({ ok: "Document verified." }, { headers });
  }

  // The decision. It lived on /ops/verifications/:id, which is now a redirect
  // here — two screens judging the same guide had already drifted apart, and
  // only one of them could see the documents the judgement rests on.
  if (intent === "approve") {
    const { data: g } = await admin
      .from("guides")
      .select("tier")
      .eq("user_id", id)
      .maybeSingle();
    // Verified means at least T1. Approving a tier-0 guide and leaving them
    // tier 0 puts them live with no badge at all.
    const tier = (g?.tier ?? 0) < 1 ? 1 : g!.tier;
    await admin.from("guides").update({ status: "verified", tier }).eq("user_id", id);
    const { notifyGuideVerification } = await import("~/lib/notifications.server");
    await notifyGuideVerification(env, admin, id, true);
    return data({ ok: "Approved. They are live and have been told." }, { headers });
  }

  if (intent === "reject") {
    await admin.from("guides").update({ status: "removed" }).eq("user_id", id);
    const { notifyGuideVerification } = await import("~/lib/notifications.server");
    await notifyGuideVerification(env, admin, id, false);
    return data({ ok: "Rejected, and they have been told." }, { headers });
  }

  if (intent === "start_review") {
    await admin.from("guides").update({ status: "in_review" }).eq("user_id", id);
    return data({ ok: "Marked in review." }, { headers });
  }

  if (intent === "tier") {
    const tier = Math.max(0, Math.min(3, Number(form.get("tier")) || 0));
    await admin.from("guides").update({ tier }).eq("user_id", id);
    return data({ ok: `Tier set to ${tier}.` }, { headers });
  }

  // Ops confirming a guide's claim about a route. The count shows publicly
  // either way; this is what marks it as checked rather than claimed.
  if (intent === "verify_route") {
    const routeId = str("route_id");
    if (form.get("undo")) {
      await admin
        .from("guide_route_experience")
        .update({ verified_by: null, verified_at: null })
        .eq("guide_id", id)
        .eq("route_id", routeId);
      return data({ ok: "Unconfirmed." }, { headers });
    }
    // Confirming can also correct. If the reference call says twelve and the
    // guide claimed forty, the office needs to be able to write twelve — the
    // alternative is confirming a number we know is wrong or leaving it
    // unconfirmed forever.
    const times = parseTimesWalked(form.get("times_walked"));
    await admin
      .from("guide_route_experience")
      .update({
        ...(times === null ? {} : { times_walked: times }),
        verified_by: user.id,
        verified_at: new Date().toISOString(),
      })
      .eq("guide_id", id)
      .eq("route_id", routeId);
    return data({ ok: "Route confirmed." }, { headers });
  }

  if (intent === "strike") {
    const reason = str("reason");
    if (reason.length < 4) {
      return data({ error: "Say what the strike is for." }, { status: 400, headers });
    }
    await admin
      .from("guide_strikes")
      .insert({ guide_id: id, reason, issued_by: user.id, booking_id: nul("booking_id") });
    return data({ ok: "Strike recorded." }, { headers });
  }

  if (intent === "strike_remove") {
    await admin.from("guide_strikes").delete().eq("id", str("strike_id")).eq("guide_id", id);
    return data({ ok: "Strike removed." }, { headers });
  }

  if (intent === "password") {
    const pw = String(form.get("password") ?? "");
    if (pw.length < 8) {
      return data({ error: "At least 8 characters." }, { status: 400, headers });
    }
    const { error } = await admin.auth.admin.updateUserById(id, { password: pw });
    if (error) return data({ error: "Couldn't set the password." }, { status: 400, headers });
    return data({ ok: "Password set. Tell them once." }, { headers });
  }

  return data({ error: "Nothing to do." }, { status: 400, headers });
}

export default function OpsPerson({ loaderData, actionData }: Route.ComponentProps) {
  const d = loaderData as any;
  const said = actionData as { ok?: string; error?: string } | undefined;
  const p = d.person;
  const g = d.guide;
  const nav = useNavigation();
  const busy = nav.state === "submitting";
  // The open tab lives in the URL, not in state: a form POST reloads the page,
  // and filing a document should not throw the office back to Overview. It
  // also means a tab can be pasted to whoever is on shift.
  const [params, setParams] = useSearchParams();
  const tab = params.get("t") ?? "overview";

  const today = new Date().toISOString().slice(0, 10);
  const live = d.bookings.filter((b: any) => LIVE.includes(b.status));
  const upcoming = d.bookings.filter(
    (b: any) =>
      !LIVE.includes(b.status) &&
      !b.status.startsWith("cancelled") &&
      b.start_date >= today,
  );
  const openEnq = d.enquiries.filter((e: any) => e.status === "open" || e.status === "quoted");
  const openIncidents = d.incidents.filter((i: any) => i.status !== "closed");
  const payable = d.payouts.filter((x: any) => x.status === "payable");
  const unverifiedDocs = d.bookingDocs.filter((x: any) => !x.verified_at);
  // A check marked "not needed" is dealt with. Counting it as outstanding
  // would leave a fully-checked guide permanently short of the line.
  const passedCount = d.checks.filter((c: any) => isCleared(c.status)).length;
  const allPassed = d.checks.length > 0 && passedCount === d.checks.length;
  const outstanding = d.checks.filter((c: any) => !isSettled(c.status)).length;
  const expiringDocs = d.docs.filter(
    (x: any) => x.expires_on && new Date(x.expires_on) < new Date(Date.now() + 60 * 864e5),
  );

  const TABS = [
    { key: "overview", label: "Overview" },
    { key: "verification", label: d.isGuide ? "Verification & papers" : "Documents" },
    { key: "trips", label: "Trips & activity" },
    { key: "money", label: "Money" },
    { key: "edit", label: "Edit profile" },
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-ink-soft">
        <Link to={`/ops/people?tab=${d.isGuide ? "guides" : p.role === "ops" ? "office" : "trekkers"}`} className="hover:underline">
          People
        </Link>
        <span>/</span>
        <span className="text-ink">{p.full_name}</span>
      </div>

      {said?.ok && (
        <div className="rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          {said.ok}
        </div>
      )}
      {said?.error && (
        <div className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-800">{said.error}</div>
      )}

      {/* ---- who they are, always visible ---- */}
      <Panel>
        <div className="flex flex-wrap items-start gap-4">
          {p.avatar_url ? (
            <img src={p.avatar_url} alt="" className="h-16 w-16 rounded-full object-cover" />
          ) : (
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-stone-200 text-xl font-semibold text-stone-600">
              {p.full_name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl">{p.full_name}</h1>
              <Badge tone={p.role === "guide" ? "teal" : p.role === "ops" ? "blue" : "neutral"}>
                {p.role}
              </Badge>
              {g && (
                <Badge
                  tone={
                    g.status === "verified"
                      ? "green"
                      : g.status === "suspended" || g.status === "removed"
                        ? "red"
                        : "amber"
                  }
                >
                  {g.status.replace("_", " ")}
                </Badge>
              )}
              {g && g.tier > 0 && <Badge tone="blue">Tier {g.tier}</Badge>}
            </div>
            <p className="mt-1 text-sm text-ink-soft">
              {[p.email, p.phone, p.country_code].filter(Boolean).join(" · ") || "No contact details"}
            </p>
            <p className="text-xs text-ink-soft">
              Joined {fmtDate(p.created_at)}
              {g?.home_district ? ` · ${g.home_district}` : ""}
              {d.languages.length
                ? ` · speaks ${d.languages.map((l: any) => l.language).join(", ")}`
                : ""}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 text-sm">
            {g && (
              <Link to={`/guides/${g.slug}`} className="text-primary hover:underline">
                Public profile →
              </Link>
            )}
            {g && (
              <Link to="/ops/verifications" className="text-primary hover:underline">
                Verification queue →
              </Link>
            )}
          </div>
        </div>
      </Panel>

      {/* ---- what needs doing, before anything else ---- */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <Stat label="Live trips" value={live.length} tone={live.length ? "primary" : undefined} />
        <Stat label="Open enquiries" value={openEnq.length} tone={openEnq.length ? "amber" : undefined} />
        <Stat label="Trips total" value={d.bookings.length} />
        {d.isGuide ? (
          <>
            <Stat label="Payable" value={payable.length} tone={payable.length ? "amber" : undefined} />
            <Stat label="Strikes" value={d.strikes.length} tone={d.strikes.length ? "red" : undefined} />
            <Stat
              label="Papers expiring"
              value={expiringDocs.length}
              tone={expiringDocs.length ? "red" : undefined}
            />
          </>
        ) : (
          <>
            <Stat
              label="Docs to verify"
              value={unverifiedDocs.length}
              tone={unverifiedDocs.length ? "amber" : undefined}
            />
            <Stat label="Reviews written" value={d.reviews.length} />
            <Stat
              label="Incidents"
              value={openIncidents.length}
              tone={openIncidents.length ? "red" : undefined}
            />
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setParams({ t: t.key }, { preventScrollReset: true })}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm",
              tab === t.key
                ? "border-primary font-medium text-primary"
                : "border-transparent text-ink-soft hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {/* What is happening this minute, before anything historical. A
                trekker's page was otherwise a list of old reviews. */}
            <Panel title="Happening now">
              {live.length === 0 && upcoming.length === 0 ? (
                <EmptyRow>
                  Nothing on. {d.bookings.length > 0 ? "All their trips are behind them." : "No trips yet."}
                </EmptyRow>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {[...live, ...upcoming].slice(0, 6).map((b: any) => (
                    <li key={b.id} className="flex flex-wrap items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{b.offering?.title ?? "—"}</p>
                        <p className="text-xs text-ink-soft">
                          {fmtDate(b.start_date)} – {fmtDate(b.end_date)} · {b.party_size}{" "}
                          {b.party_size === 1 ? "person" : "people"}
                          {d.isGuide && b.trekker?.full_name ? ` · ${b.trekker.full_name}` : ""}
                        </p>
                      </div>
                      <Badge tone={LIVE.includes(b.status) ? "teal" : "neutral"}>
                        {statusLabel(b.status)}
                      </Badge>
                      <Link
                        to={`/ops/bookings/${b.id}`}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Open
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {openEnq.length > 0 && (
                <p className="mt-3 text-xs text-ink-soft">
                  {openEnq.length} enquiry{openEnq.length === 1 ? "" : " enquiries"} still
                  waiting on an answer — see Trips &amp; activity.
                </p>
              )}
            </Panel>

            {d.isGuide && (
              <Panel title="Listings">
                {d.offerings.length === 0 ? (
                  <EmptyRow>No experiences yet.</EmptyRow>
                ) : (
                  <ul className="divide-y divide-border text-sm">
                    {d.offerings.map((o: any) => (
                      <li key={o.id} className="flex items-center justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <Link
                            to={`/ops/experiences/${o.id}`}
                            className="font-medium hover:underline"
                          >
                            {o.title}
                          </Link>
                          <p className="text-xs text-ink-soft">
                            {o.kind.replace("_", " ")} · {o.days}{" "}
                            {o.days === 1 ? "day" : "days"}
                            {o.price_usd_cents ? ` · ${formatUsd(o.price_usd_cents)} pp` : ""}
                          </p>
                        </div>
                        <Badge tone={o.status === "live" ? "green" : "neutral"}>{o.status}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            )}

            <Panel title="Reviews">
              {d.reviews.length === 0 ? (
                <EmptyRow>No reviews yet.</EmptyRow>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {d.reviews.map((r: any) => (
                    <li key={r.id} className="py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{"★".repeat(r.overall)}</span>
                        <span className="text-xs text-ink-soft">{fmtDate(r.created_at)}</span>
                        {!r.published_at && <Badge tone="amber">held</Badge>}
                      </div>
                      {r.body && <p className="mt-1 text-ink-soft">{r.body}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            {d.isGuide && (
              <Panel title="Journals">
                {d.journals.length === 0 ? (
                  <EmptyRow>No journals published.</EmptyRow>
                ) : (
                  <ul className="divide-y divide-border text-sm">
                    {d.journals.map((j: any) => (
                      <li key={j.id} className="flex items-center justify-between py-2">
                        <Link to={`/ops/journals/${j.id}`} className="hover:underline">
                          {j.title}
                        </Link>
                        <span className="text-xs text-ink-soft">
                          {fmtDate(j.start_date)} · {j.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            )}
          </div>

          <div className="space-y-4">
            {d.isGuide && g && (
              <Panel title="At a glance">
                <dl className="space-y-1 text-sm">
                  <Row label="Day rate" value={g.day_rate_usd_cents ? formatUsd(g.day_rate_usd_cents) : "—"} />
                  <Row label="Experience" value={g.years_experience ? `${g.years_experience} yrs` : "—"} />
                  <Row label="Licence" value={g.licence_no} />
                  <Row label="Licence expiry" value={g.licence_expiry ? fmtDate(g.licence_expiry) : "—"} />
                  <Row label="Treks on Trek" value={String(g.treks_completed_platform ?? 0)} />
                  <Row
                    label="Replies in"
                    value={g.median_response_mins ? `${g.median_response_mins} min` : "—"}
                  />
                  <Row
                    label="Calendar"
                    value={`${d.availability.open} open · ${d.availability.booked} booked · ${d.availability.blocked} blocked`}
                  />
                  <Row label="Voice intro" value={g.voice_intro_url ? "recorded" : "—"} />
                </dl>
                {g.hook_line && <p className="mt-3 text-sm italic text-ink-soft">“{g.hook_line}”</p>}
              </Panel>
            )}

            {!d.isGuide && (
              <Panel title="In an emergency">
                <dl className="space-y-1 text-sm">
                  <Row label="Contact" value={p.emergency_contact_name} />
                  <Row label="Phone" value={p.emergency_contact_phone} />
                </dl>
                {!p.emergency_contact_name && (
                  <p className="mt-2 text-xs text-ink-soft">
                    Nothing on file. Ask for it before their first trek starts.
                  </p>
                )}
              </Panel>
            )}

            {openIncidents.length > 0 && (
              <Panel title="Open incidents">
                <ul className="space-y-2 text-sm">
                  {openIncidents.map((i: any) => (
                    <li key={i.id}>
                      <Badge tone="red">{i.severity}</Badge>{" "}
                      <span className="text-ink-soft">{i.summary}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}

            {d.isGuide && (
              <Panel title="Strikes">
                {d.strikes.length === 0 ? (
                  <p className="text-sm text-ink-soft">None. Clean record.</p>
                ) : (
                  <ul className="mb-3 space-y-2 text-sm">
                    {d.strikes.map((s: any) => (
                      <li key={s.id} className="flex items-start justify-between gap-2">
                        <span>
                          {s.reason}
                          <span className="block text-xs text-ink-soft">
                            {fmtDate(s.created_at)}
                          </span>
                        </span>
                        <Form method="post">
                          <input type="hidden" name="intent" value="strike_remove" />
                          <input type="hidden" name="strike_id" value={s.id} />
                          <button className="text-xs text-ink-soft hover:underline">remove</button>
                        </Form>
                      </li>
                    ))}
                  </ul>
                )}
                <Form method="post" className="space-y-2">
                  <input type="hidden" name="intent" value="strike" />
                  <input
                    name="reason"
                    placeholder="What happened"
                    className="w-full rounded border border-border bg-surface px-2.5 py-1.5 text-sm"
                  />
                  <Button size="sm" variant="secondary" type="submit">
                    Record strike
                  </Button>
                </Form>
              </Panel>
            )}
          </div>
        </div>
      )}

      {tab === "verification" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {d.isGuide ? (
              <>
                <GuideDocuments docs={d.docs} checks={d.checks} busy={busy} />

                <Panel title="What they say they have walked">
                  {d.routeExperience.length === 0 ? (
                    <EmptyRow>They claimed no routes on their application.</EmptyRow>
                  ) : (
                    <ul className="divide-y divide-border text-sm">
                      {d.routeExperience.map((r: any) => (
                        <li
                          key={r.route_id}
                          className="flex flex-wrap items-center gap-3 py-2.5"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">{r.route?.name ?? "—"}</p>
                            <p className="text-xs text-ink-soft">
                              {r.route?.region ?? ""}
                            </p>
                          </div>
                          {r.verified_at ? (
                            <Badge tone="green">confirmed</Badge>
                          ) : (
                            <Badge tone="neutral">their claim</Badge>
                          )}
                          <Form method="post" className="flex items-center gap-2">
                            <input type="hidden" name="intent" value="verify_route" />
                            <input type="hidden" name="route_id" value={r.route_id} />
                            <input
                              name="times_walked"
                              type="number"
                              min={1}
                              max={MAX_TIMES_WALKED}
                              defaultValue={r.times_walked}
                              aria-label="Times walked"
                              className="w-20 rounded border border-border bg-surface px-2 py-1 text-sm"
                            />
                            <button className="text-xs font-medium text-primary hover:underline">
                              {r.verified_at ? "Re-confirm" : "Confirm"}
                            </button>
                          </Form>
                          {r.verified_at && (
                            <Form method="post">
                              <input type="hidden" name="intent" value="verify_route" />
                              <input type="hidden" name="route_id" value={r.route_id} />
                              <input type="hidden" name="undo" value="1" />
                              <button className="text-xs text-ink-soft hover:underline">
                                Unconfirm
                              </button>
                            </Form>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-3 text-xs text-ink-soft">
                    The count shows on their public profile either way.
                    Confirming puts a mark next to it — and if the number is
                    wrong, correct it here and confirm the real one.
                  </p>
                </Panel>

                <Panel title="Languages">
                  {d.languages.length === 0 ? (
                    <EmptyRow>None listed.</EmptyRow>
                  ) : (
                    <ul className="divide-y divide-border text-sm">
                      {d.languages.map((l: any) => (
                        <li
                          key={l.language}
                          className="flex items-center justify-between py-2"
                        >
                          <span className="font-medium">{l.language}</span>
                          <span className="text-ink-soft">
                            {PROFICIENCY_LABELS[l.proficiency as Proficiency] ??
                              l.proficiency}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              </>
            ) : (
              <Panel title="Documents they gave us">
                {d.bookingDocs.length === 0 ? (
                  <EmptyRow>
                    Nothing on file. Passports and insurance are collected once a
                    trip is booked.
                  </EmptyRow>
                ) : (
                  <ul className="divide-y divide-border text-sm">
                    {d.bookingDocs.map((doc: any) => (
                      <li key={doc.id} className="flex flex-wrap items-center gap-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">
                            {doc.person_name}
                            <span className="ml-2 font-normal text-ink-soft">{doc.type}</span>
                          </p>
                          <p className="text-xs text-ink-soft">
                            Added {fmtDate(doc.created_at)}
                            {doc.delete_after ? ` · deleted after ${fmtDate(doc.delete_after)}` : ""}
                          </p>
                        </div>
                        {doc.verified_at ? (
                          <Badge tone="green">verified</Badge>
                        ) : (
                          <Form method="post">
                            <input type="hidden" name="intent" value="verify_booking_doc" />
                            <input type="hidden" name="document_id" value={doc.id} />
                            <button className="rounded border border-border px-2 py-1 text-xs hover:bg-emerald-50">
                              Mark verified
                            </button>
                          </Form>
                        )}
                        <a
                          href={`/ops/doc/booking/${doc.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          Open
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-xs text-ink-soft">
                  Files live in a private bucket. Opening one mints a link that
                  dies in ten minutes and writes a line to the access log below.
                  They are deleted 90 days after the trek ends.
                </p>
              </Panel>
            )}
          </div>

          <div className="space-y-4">
            {d.isGuide && g && (
              <Panel title="Decision">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink-soft">Now</span>
                    <Badge
                      tone={
                        g.status === "verified"
                          ? "green"
                          : g.status === "suspended" || g.status === "removed"
                            ? "red"
                            : "amber"
                      }
                    >
                      {g.status.replace("_", " ")}
                    </Badge>
                  </div>
                  {!allPassed && g.status !== "verified" && (
                    <p className="text-xs text-ink-soft">
                      {passedCount} of {d.checks.length} checks clear
                      {outstanding > 0 ? `, ${outstanding} not looked at yet` : ""}.
                      Approving overrides the rest.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {g.status === "applied" && (
                      <Form method="post">
                        <input type="hidden" name="intent" value="start_review" />
                        <Button size="sm" variant="secondary" type="submit">
                          Start review
                        </Button>
                      </Form>
                    )}
                    <Form method="post">
                      <input type="hidden" name="intent" value="approve" />
                      <Button size="sm" type="submit" loading={busy}>
                        Approve → verified
                      </Button>
                    </Form>
                    <Form method="post">
                      <input type="hidden" name="intent" value="reject" />
                      <Button size="sm" variant="danger" type="submit">
                        Reject
                      </Button>
                    </Form>
                  </div>
                  <p className="text-xs text-ink-soft">
                    Either one texts them. Changing the status under Edit
                    profile does not — use these buttons for a real decision.
                  </p>
                  <Form method="post" className="flex items-center gap-2 border-t border-border pt-3">
                    <input type="hidden" name="intent" value="tier" />
                    <select
                      name="tier"
                      defaultValue={g.tier}
                      className="rounded border border-border bg-surface px-2 py-1 text-sm"
                    >
                      <option value={0}>0 — none</option>
                      <option value={1}>1 — Verified</option>
                      <option value={2}>2 — Trusted</option>
                      <option value={3}>3 — Elite</option>
                    </select>
                    <Button size="sm" variant="secondary" type="submit">
                      Set tier
                    </Button>
                  </Form>
                </div>
              </Panel>
            )}

            {d.isGuide && (
              <Panel title="Verification checklist">
                <ul className="divide-y divide-border">
                  {d.checks.map((c: any) => (
                    <li key={c.id} className="py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">
                          {checkLabel(c.check_type)}
                        </p>
                        <Badge
                          tone={
                            c.status === "passed"
                              ? "green"
                              : c.status === "failed"
                                ? "red"
                                : c.status === "expired"
                                  ? "amber"
                                  : "neutral"
                          }
                        >
                          {CHECK_STATUS_LABELS[c.status as CheckStatus] ?? c.status}
                        </Badge>
                      </div>
                      {c.notes && <p className="text-xs text-ink-soft">{c.notes}</p>}
                      <Form method="post" className="mt-1.5 flex gap-1">
                        <input type="hidden" name="intent" value="check" />
                        <input type="hidden" name="verification_id" value={c.id} />
                        <input
                          name="notes"
                          defaultValue={c.notes ?? ""}
                          placeholder="Note"
                          className="min-w-0 flex-1 rounded border border-border bg-surface px-2 py-1 text-xs"
                        />
                        <button
                          name="status"
                          value="passed"
                          className="rounded border border-border px-2 py-1 text-xs hover:bg-emerald-50"
                        >
                          Pass
                        </button>
                        <button
                          name="status"
                          value="failed"
                          className="rounded border border-border px-2 py-1 text-xs hover:bg-red-50"
                        >
                          Fail
                        </button>
                        {/* Not every check applies to every guide. Without
                            this, one that simply does not apply sits pending
                            forever and a fully-checked guide never looks it. */}
                        <button
                          name="status"
                          value="not_required"
                          className="rounded border border-border px-2 py-1 text-xs text-ink-soft hover:bg-black/5"
                        >
                          Not needed
                        </button>
                      </Form>
                    </li>
                  ))}
                  {d.checks.length === 0 && (
                    <li className="py-3 text-sm text-ink-soft">No checks yet.</li>
                  )}
                </ul>
                <Form method="post" className="mt-3 flex gap-2">
                  <input type="hidden" name="intent" value="add_check" />
                  <select
                    name="check_type"
                    className="min-w-0 flex-1 rounded border border-border bg-surface px-2 py-1.5 text-sm"
                  >
                    {CHECK_TYPES.map((k) => (
                      <option key={k} value={k}>
                        {CHECK_LABELS[k]}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" variant="secondary" type="submit">
                    Add
                  </Button>
                </Form>
              </Panel>
            )}

            <Panel title="Who opened their papers">
              {d.accessLog.length === 0 ? (
                <p className="text-sm text-ink-soft">Nobody has, yet.</p>
              ) : (
                <ul className="space-y-1 text-xs text-ink-soft">
                  {d.accessLog.map((a: any) => (
                    <li key={a.id}>
                      {a.viewer?.full_name ?? "Someone"} — {fmtDate(a.accessed_at)}
                      {a.purpose ? ` · ${a.purpose.replace("_", " ")}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      )}

      {tab === "trips" && (
        <div className="space-y-4">
          <Panel title="Trips">
            {d.bookings.length === 0 ? (
              <EmptyRow>No bookings yet.</EmptyRow>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-ink-soft">
                  <tr className="border-b border-border">
                    <th className="pb-2 font-medium">Trip</th>
                    <th className="pb-2 font-medium">{d.isGuide ? "Trekker" : "Dates"}</th>
                    <th className="pb-2 font-medium">Party</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Value</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {d.bookings.map((b: any) => (
                    <tr key={b.id} className="border-b border-border/60">
                      <td className="py-2">
                        <span className="font-medium">{b.offering?.title ?? "—"}</span>
                        <span className="block text-xs text-ink-soft">
                          {fmtDate(b.start_date)}
                        </span>
                      </td>
                      <td className="py-2 text-ink-soft">
                        {d.isGuide ? (b.trekker?.full_name ?? "—") : fmtDate(b.end_date)}
                      </td>
                      <td className="py-2 text-ink-soft">{b.party_size}</td>
                      <td className="py-2">
                        <Badge tone={LIVE.includes(b.status) ? "teal" : b.status.startsWith("cancelled") ? "red" : "neutral"}>
                          {statusLabel(b.status)}
                        </Badge>
                      </td>
                      <td className="py-2 text-ink-soft">{formatUsd(b.total_usd_cents)}</td>
                      <td className="py-2 text-right">
                        <Link
                          to={`/ops/bookings/${b.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          Open →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          <Panel title="Enquiries">
            {d.enquiries.length === 0 ? (
              <EmptyRow>No enquiries.</EmptyRow>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {d.enquiries.map((e: any) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                    <div>
                      <p className="font-medium">{e.offering?.title ?? "—"}</p>
                      <p className="text-xs text-ink-soft">
                        {fmtDate(e.start_date)} · {e.party_size}{" "}
                        {e.party_size === 1 ? "person" : "people"}
                        {d.isGuide && e.trekker?.full_name ? ` · ${e.trekker.full_name}` : ""}
                      </p>
                    </div>
                    <Badge
                      tone={
                        e.status === "converted"
                          ? "green"
                          : e.status === "open" || e.status === "quoted"
                            ? "amber"
                            : "neutral"
                      }
                    >
                      {e.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {d.incidents.length > 0 && (
            <Panel title="Incidents on their trips">
              <ul className="divide-y divide-border text-sm">
                {d.incidents.map((i: any) => (
                  <li key={i.id} className="flex items-center justify-between py-2">
                    <span>
                      <Badge tone={i.status === "closed" ? "neutral" : "red"}>{i.severity}</Badge>{" "}
                      {i.summary}
                    </span>
                    <span className="text-xs text-ink-soft">{fmtDate(i.opened_at)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      )}

      {tab === "money" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {d.isGuide && (
            <>
              <Panel title="Payouts">
                {d.payouts.length === 0 ? (
                  <EmptyRow>Nothing owed or paid yet.</EmptyRow>
                ) : (
                  <ul className="divide-y divide-border text-sm">
                    {d.payouts.map((x: any) => (
                      <li key={x.id} className="flex items-center justify-between py-2">
                        <span>
                          {formatNpr(x.amount_npr_paisa)}
                          <span className="block text-xs text-ink-soft">
                            {x.method}
                            {x.batch_ref ? ` · ${x.batch_ref}` : ""}
                            {x.paid_at ? ` · ${fmtDate(x.paid_at)}` : ""}
                          </span>
                        </span>
                        <Badge tone={x.status === "paid" ? "green" : "amber"}>{x.status}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title="Where their money goes">
                <dl className="space-y-1 text-sm">
                  <Row label="Method" value={g?.payout_method} />
                  <Row label="Account" value={g?.payout_account} />
                  <Row label="Account name" value={g?.payout_account_name} />
                </dl>
                <p className="mt-2 text-xs text-ink-soft">
                  Change these under Edit profile. A wrong number here is a
                  payment that lands with a stranger.
                </p>
              </Panel>
            </>
          )}
          <Panel title="Payments">
            {d.payments.length === 0 ? (
              <EmptyRow>No payments recorded.</EmptyRow>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {d.payments.map((x: any) => (
                  <li key={x.id} className="flex items-center justify-between py-2">
                    <span>
                      {formatUsd(x.amount_usd_cents)}
                      <span className="block text-xs text-ink-soft">
                        {x.type} · {fmtDate(x.created_at)}
                      </span>
                    </span>
                    <Badge tone={x.status === "succeeded" ? "green" : x.status === "failed" ? "red" : "amber"}>
                      {x.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}

      {tab === "edit" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Profile">
            <Form method="post" className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="intent" value="profile" />
              <TextField label="Full name" name="full_name" defaultValue={p.full_name} required />
              <TextField label="Email" name="email" type="email" defaultValue={p.email} />
              <TextField label="Phone" name="phone" defaultValue={p.phone} />
              <TextField label="Country" name="country_code" defaultValue={p.country_code} />
              <TextField
                label="Photo URL"
                name="avatar_url"
                defaultValue={p.avatar_url}
                className="sm:col-span-2"
              />
              <TextField
                label="Emergency contact"
                name="emergency_contact_name"
                defaultValue={p.emergency_contact_name}
              />
              <TextField
                label="Emergency phone"
                name="emergency_contact_phone"
                defaultValue={p.emergency_contact_phone}
              />
              <div className="sm:col-span-2">
                <Button size="sm" type="submit" loading={busy}>
                  Save profile
                </Button>
              </div>
            </Form>
          </Panel>

          {d.isGuide && g && (
            <Panel title="Guide record">
              <Form method="post" className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="intent" value="guide" />
                <label className="text-sm">
                  <span className="mb-1 block text-ink-soft">Status</span>
                  <select
                    name="status"
                    defaultValue={g.status}
                    className="w-full rounded border border-border bg-surface px-2.5 py-1.5"
                  >
                    {["applied", "in_review", "verified", "suspended", "removed"].map((s) => (
                      <option key={s} value={s}>
                        {s.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-ink-soft">Tier</span>
                  <select
                    name="tier"
                    defaultValue={g.tier}
                    className="w-full rounded border border-border bg-surface px-2.5 py-1.5"
                  >
                    <option value={0}>0 — none</option>
                    <option value={1}>1 — Verified</option>
                    <option value={2}>2 — Trusted</option>
                    <option value={3}>3 — Elite</option>
                  </select>
                </label>
                <TextField label="Licence no." name="licence_no" defaultValue={g.licence_no} />
                <TextField
                  label="Licence expiry"
                  name="licence_expiry"
                  type="date"
                  defaultValue={g.licence_expiry}
                />
                <TextField label="District" name="home_district" defaultValue={g.home_district} />
                <TextField
                  label="Years guiding"
                  name="years_experience"
                  type="number"
                  defaultValue={g.years_experience}
                />
                <TextField
                  label="Day rate (USD)"
                  name="day_rate_usd"
                  type="number"
                  step="1"
                  defaultValue={
                    g.day_rate_usd_cents != null ? String(g.day_rate_usd_cents / 100) : ""
                  }
                />
                <label className="text-sm">
                  <span className="mb-1 block text-ink-soft">Payout method</span>
                  <select
                    name="payout_method"
                    defaultValue={g.payout_method ?? ""}
                    className="w-full rounded border border-border bg-surface px-2.5 py-1.5"
                  >
                    <option value="">—</option>
                    <option value="esewa">eSewa</option>
                    <option value="khalti">Khalti</option>
                    <option value="bank">Bank</option>
                  </select>
                </label>
                <TextField label="Payout account" name="payout_account" defaultValue={g.payout_account} />
                <TextField
                  label="Account name"
                  name="payout_account_name"
                  defaultValue={g.payout_account_name}
                />
                <TextField
                  label="Hook line"
                  name="hook_line"
                  defaultValue={g.hook_line}
                  className="sm:col-span-2"
                />
                <label className="text-sm sm:col-span-2">
                  <span className="mb-1 block text-ink-soft">Bio</span>
                  <textarea
                    name="bio"
                    rows={5}
                    defaultValue={g.bio ?? ""}
                    className="w-full rounded border border-border bg-surface px-2.5 py-1.5"
                  />
                </label>
                <div className="sm:col-span-2">
                  <Button size="sm" type="submit" loading={busy}>
                    Save guide record
                  </Button>
                </div>
              </Form>
            </Panel>
          )}

          <Panel title="Sign-in">
            <Form method="post" className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="intent" value="password" />
              <TextField label="Set a new password" name="password" type="text" />
              <Button size="sm" variant="secondary" type="submit">
                Set password
              </Button>
            </Form>
            <p className="mt-2 text-xs text-ink-soft">
              Use this when someone is locked out on the phone to you. Say it
              once, out loud, and tell them to change it.
            </p>
          </Panel>
        </div>
      )}
    </div>
  );
}

/**
 * The papers we hold on a guide. Upload, see what expires when, open one
 * through a signed link, delete one that should not be kept.
 */
function GuideDocuments({
  docs,
  checks,
  busy,
}: {
  docs: any[];
  checks: any[];
  busy: boolean;
}) {
  const today = new Date();
  return (
    <Panel title="Papers on file">
      {docs.length === 0 ? (
        <EmptyRow>Nothing filed yet.</EmptyRow>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {docs.map((doc) => {
            const expired = doc.expires_on && new Date(doc.expires_on) < today;
            const soon =
              !expired &&
              doc.expires_on &&
              new Date(doc.expires_on) < new Date(Date.now() + 60 * 864e5);
            return (
              <li key={doc.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {GUIDE_DOC_LABELS[doc.kind as GuideDocKind] ?? doc.kind}
                    {doc.label ? <span className="font-normal text-ink-soft"> — {doc.label}</span> : null}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {Math.max(1, Math.round(doc.size_bytes / 1024))} KB ·{" "}
                    {doc.mime_type.split("/")[1]?.toUpperCase() ?? doc.mime_type} · filed{" "}
                    {fmtDate(doc.uploaded_at)}
                    {doc.issued_on ? ` · issued ${fmtDate(doc.issued_on)}` : ""}
                    {doc.delete_after ? ` · deleted after ${fmtDate(doc.delete_after)}` : ""}
                  </p>
                </div>
                {doc.expires_on && (
                  <Badge tone={expired ? "red" : soon ? "amber" : "neutral"}>
                    {expired ? "expired" : "expires"} {fmtDate(doc.expires_on)}
                  </Badge>
                )}
                <a
                  href={`/ops/doc/guide/${doc.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Open
                </a>
                <Form method="post">
                  <input type="hidden" name="intent" value="doc_delete" />
                  <input type="hidden" name="document_id" value={doc.id} />
                  <button className="text-xs text-ink-soft hover:text-red-700 hover:underline">
                    Delete
                  </button>
                </Form>
              </li>
            );
          })}
        </ul>
      )}

      <Form
        method="post"
        encType="multipart/form-data"
        className="mt-4 grid gap-3 rounded-md border border-dashed border-border p-3 sm:grid-cols-2"
      >
        <input type="hidden" name="intent" value="doc_upload" />
        <label className="text-sm">
          <span className="mb-1 block text-ink-soft">What is it</span>
          <select
            name="kind"
            className="w-full rounded border border-border bg-surface px-2.5 py-1.5"
          >
            {GUIDE_DOC_KINDS.map((k) => (
              <option key={k} value={k}>
                {GUIDE_DOC_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-ink-soft">Against which check</span>
          <select
            name="verification_id"
            className="w-full rounded border border-border bg-surface px-2.5 py-1.5"
          >
            <option value="">Not tied to one</option>
            {checks.map((c: any) => (
              <option key={c.id} value={c.id}>
                {checkLabel(c.check_type)}
              </option>
            ))}
          </select>
        </label>
        <TextField label="Note (optional)" name="label" />
        <div className="grid grid-cols-2 gap-2">
          <TextField label="Issued" name="issued_on" type="date" />
          <TextField label="Expires" name="expires_on" type="date" />
        </div>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block text-ink-soft">File — JPG, PNG, WEBP or PDF, up to 10MB</span>
          <input
            type="file"
            name="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            required
            className="w-full rounded border border-border bg-surface px-2.5 py-1.5 text-sm"
          />
        </label>
        <div className="sm:col-span-2">
          <Button size="sm" type="submit" loading={busy}>
            File this document
          </Button>
        </div>
      </Form>

      <p className="mt-3 text-xs text-ink-soft">
        Stored in a private bucket no browser can reach. Opening one mints a
        link that dies in ten minutes and writes a line to the access log. If a
        guide is removed, their papers are deleted 90 days later.
      </p>
    </Panel>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "primary" | "amber" | "red";
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <p
        className={cn(
          "font-display text-xl",
          tone === "primary" && "text-primary",
          tone === "amber" && "text-amber-700",
          tone === "red" && "text-red-700",
        )}
      >
        {value}
      </p>
      <p className="text-xs text-ink-soft">{label}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="text-right">{value || "—"}</dd>
    </div>
  );
}

function TextField({
  label,
  name,
  type = "text",
  defaultValue,
  required,
  step,
  className,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number | null;
  required?: boolean;
  step?: string;
  className?: string;
}) {
  return (
    <label className={cn("text-sm", className)}>
      <span className="mb-1 block text-ink-soft">{label}</span>
      <input
        name={name}
        type={type}
        step={step}
        required={required}
        defaultValue={defaultValue ?? ""}
        className="w-full rounded border border-border bg-surface px-2.5 py-1.5 outline-none focus:border-primary"
      />
    </label>
  );
}
