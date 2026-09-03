import type { SupabaseClient } from "@supabase/supabase-js";
import { GUIDE_DOC_KINDS, type GuideDocKind } from "~/lib/guide-documents";

const BUCKET = "documents";
const SIGNED_TTL_SECONDS = 600; // 10 minutes (docs/02 §Security)

function extFor(type: string, filename: string): string {
  const m = filename.match(/\.([a-z0-9]+)$/i);
  if (m) return m[1].toLowerCase();
  return type.includes("pdf") ? "pdf" : "jpg";
}

/**
 * Trekker uploads a passport/insurance doc for a party member. File goes to the
 * private bucket under the booking id; metadata to booking_documents. The
 * caller must have already checked the booking belongs to the trekker.
 */
export async function uploadDocument(
  admin: SupabaseClient,
  args: {
    bookingId: string;
    personName: string;
    type: "passport" | "insurance";
    file: File;
  },
): Promise<{ ok: boolean; error?: string }> {
  const ext = extFor(args.file.type, args.file.name);
  const safePerson = args.personName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const path = `${args.bookingId}/${args.type}-${safePerson}-${Date.now()}.${ext}`;

  const bytes = new Uint8Array(await args.file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: args.file.type, upsert: true });
  if (upErr) return { ok: false, error: upErr.message };

  const { error } = await admin.from("booking_documents").insert({
    booking_id: args.bookingId,
    person_name: args.personName,
    type: args.type,
    storage_path: path,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Issue a short-lived signed URL for a document and log the access. Never logs
 * the URL itself. Caller must have authorised (ops, or the owning trekker).
 */
export async function signedDocumentUrl(
  admin: SupabaseClient,
  documentId: string,
  accessedBy: string,
): Promise<string | null> {
  const { data: doc } = await admin
    .from("booking_documents")
    .select("storage_path")
    .eq("id", documentId)
    .single();
  if (!doc) return null;

  const { data: signed } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(doc.storage_path, SIGNED_TTL_SECONDS);
  if (!signed) return null;

  await admin
    .from("document_access_log")
    .insert({ document_id: documentId, accessed_by: accessedBy });
  return signed.signedUrl;
}

/** Ops verifies a document; if all of a booking's docs are verified, confirm it. */
export async function verifyDocument(
  admin: SupabaseClient,
  documentId: string,
  verifiedBy: string,
): Promise<{ bookingId: string | null; confirmed: boolean }> {
  const { data: doc } = await admin
    .from("booking_documents")
    .update({ verified_by: verifiedBy, verified_at: new Date().toISOString() })
    .eq("id", documentId)
    .select("booking_id")
    .single();
  if (!doc) return { bookingId: null, confirmed: false };

  const confirmed = await confirmIfDocsComplete(admin, doc.booking_id);
  return { bookingId: doc.booking_id, confirmed };
}

/**
 * Confirm a booking once every uploaded document is verified (and the balance
 * has been paid — the confirmed state means "balance paid + insurance verified",
 * docs/03). The permit-application trigger fires on this transition.
 */
export async function confirmIfDocsComplete(
  admin: SupabaseClient,
  bookingId: string,
): Promise<boolean> {
  const { data: docs } = await admin
    .from("booking_documents")
    .select("verified_at")
    .eq("booking_id", bookingId);
  if (!docs || docs.length === 0) return false;
  if (docs.some((d) => !d.verified_at)) return false;

  const { data: b } = await admin
    .from("bookings")
    .select("status, balance_paid_at, deposit_usd_cents, total_usd_cents")
    .eq("id", bookingId)
    .single();
  if (!b) return false;
  // Require the balance to be settled (deposit == total counts as paid-in-full).
  const balanceSettled =
    !!b.balance_paid_at || b.deposit_usd_cents >= b.total_usd_cents;
  if (!balanceSettled) return false;
  if (["confirmed", "active", "completed"].includes(b.status)) return true;

  await admin
    .from("bookings")
    .update({ status: "confirmed" })
    .eq("id", bookingId)
    .in("status", ["deposit_paid", "docs_pending"]);
  return true;
}

/** Delete documents 90 days after trek completion (retention sweep, docs/02). */
export async function runDocumentRetentionSweep(
  admin: SupabaseClient,
  todayIso: string,
): Promise<{ deleted: number }> {
  const { data: due } = await admin
    .from("booking_documents")
    .select("id, storage_path")
    .not("delete_after", "is", null)
    .lte("delete_after", todayIso);

  let deleted = 0;
  for (const d of due ?? []) {
    await admin.storage.from(BUCKET).remove([d.storage_path]);
    await admin.from("document_access_log").delete().eq("document_id", d.id);
    await admin.from("booking_documents").delete().eq("id", d.id);
    deleted++;
  }

  // Guide papers, 90 days after the guide was removed (stamped by the
  // guides_document_retention trigger). Same bucket, same sweep — a second
  // retention job is a second thing to forget to run.
  const { data: guideDue } = await admin
    .from("guide_documents")
    .select("id, storage_path")
    .not("delete_after", "is", null)
    .lte("delete_after", todayIso);

  for (const d of guideDue ?? []) {
    await admin.storage.from(BUCKET).remove([d.storage_path]);
    await admin.from("document_access_log").delete().eq("guide_document_id", d.id);
    await admin.from("guide_documents").delete().eq("id", d.id);
    deleted++;
  }
  return { deleted };
}

// ---------------------------------------------------------------------------
// Guide verification papers.
//
// Same private bucket and the same rules as a trekker's passport: the file is
// never public, the path is never rendered to a browser, and every view is a
// short-lived signed URL written to the access log. Different table only
// because the metadata is different — a licence has an expiry, a passport
// scan for a booking has a person's name.
// ---------------------------------------------------------------------------

const MAX_DOC_BYTES = 10 * 1024 * 1024; // matches the bucket's own limit
const ALLOWED_DOC_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

/**
 * Ops files a paper against a guide. Uploads to the private bucket under the
 * guide's own folder, then records the metadata. If the metadata insert fails
 * the uploaded file is removed rather than left orphaned in the bucket.
 */
export async function uploadGuideDocument(
  admin: SupabaseClient,
  args: {
    guideId: string;
    kind: GuideDocKind;
    file: File;
    label?: string | null;
    verificationId?: string | null;
    issuedOn?: string | null;
    expiresOn?: string | null;
    uploadedBy: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  if (!args.file || args.file.size === 0) {
    return { ok: false, error: "Choose a file to upload." };
  }
  if (args.file.size > MAX_DOC_BYTES) {
    return { ok: false, error: "That file is over 10MB. Send a smaller scan." };
  }
  if (!ALLOWED_DOC_MIME.has(args.file.type)) {
    return { ok: false, error: "Only JPG, PNG, WEBP or PDF can be stored." };
  }
  // Checked again at the storage boundary: the kind becomes part of the path,
  // and a caller that skipped its own validation must not shape a filename.
  if (!GUIDE_DOC_KINDS.includes(args.kind)) {
    return { ok: false, error: "That isn't a kind of document we file." };
  }

  const ext = extFor(args.file.type, args.file.name);
  const path = `guides/${args.guideId}/${args.kind}-${Date.now()}.${ext}`;
  const bytes = new Uint8Array(await args.file.arrayBuffer());

  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: args.file.type, upsert: false });
  if (upErr) return { ok: false, error: "The file didn't upload. Try again." };

  const { error } = await admin.from("guide_documents").insert({
    guide_id: args.guideId,
    verification_id: args.verificationId || null,
    kind: args.kind,
    label: args.label?.trim() || null,
    storage_path: path,
    mime_type: args.file.type,
    size_bytes: args.file.size,
    // Kept for the office's own eyes; never used to build a URL.
    original_name: args.file.name.slice(0, 120),
    issued_on: args.issuedOn || null,
    expires_on: args.expiresOn || null,
    uploaded_by: args.uploadedBy,
  });
  if (error) {
    await admin.storage.from(BUCKET).remove([path]);
    return { ok: false, error: "The file uploaded but wouldn't save. Try again." };
  }
  return { ok: true };
}

/**
 * A signed URL for one guide document, logged. Caller must have authorised —
 * today that is ops only. The URL is returned for a redirect and goes nowhere
 * near a log line or an error message.
 */
export async function signedGuideDocumentUrl(
  admin: SupabaseClient,
  documentId: string,
  accessedBy: string,
  purpose = "ops_review",
): Promise<string | null> {
  const { data: doc } = await admin
    .from("guide_documents")
    .select("storage_path")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return null;

  const { data: signed } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(doc.storage_path, SIGNED_TTL_SECONDS);
  if (!signed) return null;

  await admin
    .from("document_access_log")
    .insert({ guide_document_id: documentId, accessed_by: accessedBy, purpose });
  return signed.signedUrl;
}

/** Remove a guide document — file first, then the row and its access log. */
export async function deleteGuideDocument(
  admin: SupabaseClient,
  documentId: string,
): Promise<boolean> {
  const { data: doc } = await admin
    .from("guide_documents")
    .select("storage_path")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return false;
  await admin.storage.from(BUCKET).remove([doc.storage_path]);
  await admin.from("document_access_log").delete().eq("guide_document_id", documentId);
  await admin.from("guide_documents").delete().eq("id", documentId);
  return true;
}
