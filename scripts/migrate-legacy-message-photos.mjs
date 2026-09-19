/**
 * Move legacy chat images out of the public journal-photos bucket.
 *
 * Dry-run by default. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, inspect
 * the output, then rerun with --apply during deployment. Each object is copied
 * to the private bucket, its message is changed to the authenticated proxy URL,
 * and only then is the public copy removed.
 */
import { createClient } from "@supabase/supabase-js";
import { sanitizeImage } from "../app/lib/exif.ts";

const apply = process.argv.includes("--apply");
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });
const publicBucket = admin.storage.from("journal-photos");
const legacyPrefix = "/storage/v1/object/public/journal-photos/";
const legacyName = /(?:^|\/)\d+-msg\.(?:jpe?g|png|webp)$/i;

function legacyPath(value) {
  try {
    const parsed = new URL(value);
    const at = parsed.pathname.indexOf(legacyPrefix);
    if (at < 0) return null;
    const path = decodeURIComponent(parsed.pathname.slice(at + legacyPrefix.length));
    return legacyName.test(path) ? path : null;
  } catch {
    return null;
  }
}

async function selectAll(table, columns) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .like("body", "%/journal-photos/%-msg.%")
      .order("id", { ascending: true })
      .range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < 500) break;
  }
  return rows;
}

async function listLegacyObjects(prefix = "") {
  const paths = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await publicBucket.list(prefix, {
      limit: 100,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`list journal-photos/${prefix}: ${error.message}`);
    for (const item of data ?? []) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id) {
        if (legacyName.test(path)) paths.push(path);
      } else {
        paths.push(...await listLegacyObjects(path));
      }
    }
    if ((data ?? []).length < 100) break;
  }
  return paths;
}

function extension(path) {
  const ext = path.split(".").pop().toLowerCase();
  return ext === "jpeg" ? "jpg" : ext;
}

function privateUrl(type, id, path) {
  const q = new URLSearchParams({ thread_type: type, thread_id: id, path });
  return `/api/message-photo?${q}`;
}

async function migrate(table, row, type, threadId) {
  const source = legacyPath(row.body);
  if (!source) return false;
  const sourceExt = extension(source);
  const previewTarget = `${type}/${threadId}/<new-id>.${sourceExt}`;
  console.log(`${table}:${row.id}  ${source} -> ${previewTarget}`);
  if (!apply) return true;

  const { data: blob, error: downloadError } = await publicBucket.download(source);
  if (downloadError || !blob) throw new Error(`download ${source}: ${downloadError?.message ?? "no data"}`);
  const cleaned = sanitizeImage(new Uint8Array(await blob.arrayBuffer()));
  if (!cleaned.understood || !cleaned.contentType || !cleaned.extension) {
    throw new Error(`cannot safely sanitize ${source}`);
  }
  const target = `${type}/${threadId}/${crypto.randomUUID()}.${cleaned.extension}`;
  const { error: uploadError } = await admin.storage.from("message-photos").upload(target, cleaned.bytes, {
    contentType: cleaned.contentType,
    upsert: false,
  });
  if (uploadError) throw new Error(`upload ${target}: ${uploadError.message}`);

  const body = privateUrl(type, threadId, target);
  const changes = table === "messages"
    ? { body, body_rendered: body, flagged_reason: null }
    : { body };
  const { error: updateError } = await admin.from(table).update(changes).eq("id", row.id);
  if (updateError) throw new Error(`update ${table}:${row.id}: ${updateError.message}`);

  const { error: removeError } = await publicBucket.remove([source]);
  if (removeError) {
    throw new Error(`PUBLIC COPY STILL EXISTS; remove journal-photos/${source}: ${removeError.message}`);
  }
  return true;
}

const direct = await selectAll(
  "messages",
  "id,body,booking_id,conversation_id,enquiry_id",
);
const groups = await selectAll("trip_group_messages", "id,body,group_id");

// Refuse orphan cleanup when a matching row has an unexpected shape. It is
// safer to leave a public object behind than to delete one still referenced.
for (const row of [...direct, ...groups]) {
  if (!legacyPath(row.body)) {
    throw new Error(`cannot safely parse legacy photo URL in message ${row.id}`);
  }
}
const referenced = new Set([...direct, ...groups].map((row) => legacyPath(row.body)));
const legacyObjects = await listLegacyObjects();
const orphans = legacyObjects.filter((path) => !referenced.has(path));

let found = 0;
for (const row of direct) {
  const pair = row.booking_id
    ? ["booking", row.booking_id]
    : row.conversation_id
      ? ["conversation", row.conversation_id]
      : row.enquiry_id
        ? ["enquiry", row.enquiry_id]
        : null;
  if (!pair) throw new Error(`message ${row.id} has no thread`);
  found += Number(await migrate("messages", row, pair[0], pair[1]));
}
for (const row of groups) {
  found += Number(await migrate("trip_group_messages", row, "group", row.group_id));
}

for (const path of orphans) {
  console.log(`${apply ? "Removing" : "Would remove"} orphan public copy journal-photos/${path}`);
  if (!apply) continue;
  const { error } = await publicBucket.remove([path]);
  if (error) throw new Error(`PUBLIC COPY STILL EXISTS; remove journal-photos/${path}: ${error.message}`);
}

console.log(`${apply ? "Migrated" : "Would migrate"} ${found} legacy message photo(s).`);
console.log(`${apply ? "Removed" : "Would remove"} ${orphans.length} orphan public cop${orphans.length === 1 ? "y" : "ies"}.`);
if (!apply && (found || orphans.length)) console.log("Review the list, then rerun with --apply.");
