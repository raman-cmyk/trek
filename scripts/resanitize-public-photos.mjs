/**
 * Remove legacy metadata payloads from every object in journal-photos.
 *
 * Dry-run by default. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, inspect
 * the object list, then rerun with --apply. Files that are already clean are
 * left untouched; malformed or unsupported objects fail the run without being
 * overwritten.
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
const bucket = admin.storage.from("journal-photos");

async function listAll(prefix = "") {
  const files = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await bucket.list(prefix, {
      limit: 100,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`list ${prefix || "/"}: ${error.message}`);
    for (const item of data ?? []) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id) files.push(path);
      else files.push(...await listAll(path));
    }
    if ((data ?? []).length < 100) break;
  }
  return files;
}

const files = await listAll();
console.log(`${apply ? "Checking" : "Would check"} ${files.length} public photo(s).`);
if (!apply) {
  for (const path of files) console.log(path);
  if (files.length) console.log("Review the list, then rerun with --apply.");
  process.exit(0);
}

let changed = 0;
let failed = 0;
for (const path of files) {
  try {
    const { data: blob, error: downloadError } = await bucket.download(path);
    if (downloadError || !blob) throw new Error(downloadError?.message ?? "no data");
    const cleaned = sanitizeImage(new Uint8Array(await blob.arrayBuffer()));
    if (!cleaned.understood || !cleaned.contentType) throw new Error("unsupported or malformed image");
    if (!cleaned.strippedGps) continue;
    const { error: updateError } = await bucket.update(path, cleaned.bytes, {
      contentType: cleaned.contentType,
      upsert: true,
    });
    if (updateError) throw new Error(updateError.message);
    changed++;
    console.log(`sanitized ${path}`);
  } catch (error) {
    failed++;
    console.error(`FAILED ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(`Sanitized ${changed}; failed ${failed}; unchanged ${files.length - changed - failed}.`);
if (failed) process.exit(1);
