import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanReason, rejectionProblem } from "~/lib/doc-review";
import { GUIDE_DOC_KINDS, type GuideDocKind } from "~/lib/guide-documents";

const BUCKET = "documents";
const SIGNED_TTL_SECONDS = 600; // 10 minutes (docs/02 §Security)

function extFor(type: string, filename: string): string {
  const m = filename.match(/\.([a-z0-9]+)$/i);
  if (m) return m[1].toLowerCase();
  return type.includes("pdf") ? "pdf" : "jpg";
}

/**
 * A passport or an insurance certificate, filed against the person it belongs
 * to. The file goes to the private bucket under the booking id; the metadata
 * to `booking_documents`. The caller must already have checked that the
 * booking belongs to the trekker, or that the caller is ops.
 *
 * `travellerId` is the roster row (0099). It used to be free text typed fresh
 * on every upload, which is how one party of one came to hold three passports
 * under three spellings of the same name.
 *
 * A second document of the same type for the same person REPLACES the first:
 * the partial unique index over live rows would refuse the insert otherwise,
 * and "replaces" is what the trekker means when they upload a clearer scan.
 * The old row is marked superseded (0101) rather than deleted — its file is a
 * real passport scan and the retention sweep owns when that goes — and it
 * points at the row that replaced it.
 */
export async function uploadDocument(
  admin: SupabaseClient,
  args: {
    bookingId: string;
    travellerId: string;
    type: "passport" | "insurance";
    file: File;
  },
): Promise<{ ok: boolean; error?: string }> {
  const { data: traveller } = await admin
    .from("booking_travellers")
    .select("id, full_name, booking_id")
    .eq("id", args.travellerId)
    .eq("booking_id", args.bookingId)
    .maybeSingle();
  // Belt and braces: a traveller id from another booking would otherwise file
  // somebody's passport against a trip they are not on.
  if (!traveller) return { ok: false, error: "We could not find that person on this trip." };

  const ext = extFor(args.file.type, args.file.name);
  const safePerson = traveller.full_name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const path = `${args.bookingId}/${args.type}-${safePerson}-${Date.now()}.${ext}`;

  const bytes = new Uint8Array(await args.file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: args.file.type, upsert: true });
  if (upErr) return { ok: false, error: upErr.message };

  // Stand the old one down first, or the unique index refuses the new row.
  // Superseded, not rejected (0101): nobody said no to it, and a trekker who
  // sends a clearer scan should not be told their passport needs redoing.
  const superseded = await admin
    .from("booking_documents")
    .update({ superseded_at: new Date().toISOString() })
    .eq("booking_id", args.bookingId)
    .eq("traveller_id", args.travellerId)
    .eq("type", args.type)
    .is("rejected_at", null)
    .is("superseded_at", null)
    .select("id");
  if (superseded.error) {
    await admin.storage.from(BUCKET).remove([path]);
    return { ok: false, error: "That upload failed. Try again." };
  }

  const { data: inserted, error } = await admin
    .from("booking_documents")
    .insert({
      booking_id: args.bookingId,
      traveller_id: args.travellerId,
      // Kept in step with the roster so the ops list still reads as names.
      person_name: traveller.full_name,
      type: args.type,
      storage_path: path,
    })
    .select("id")
    .single();
  if (error || !inserted) {
    await admin.storage.from(BUCKET).remove([path]);
    // Put the old one back: it is the document we still hold.
    for (const old of superseded.data ?? []) {
      await admin.from("booking_documents").update({ superseded_at: null }).eq("id", old.id);
    }
    return { ok: false, error: error?.message ?? "That upload failed. Try again." };
  }

  // Which document replaced it — so the office can follow a passport back
  // through its versions rather than guessing from timestamps.
  for (const old of superseded.data ?? []) {
    await admin.from("booking_documents").update({ superseded_by: inserted.id }).eq("id", old.id);
  }
  return { ok: true };
}

/**
 * Ops removes a booking document.
 *
 * For the wrong file, the duplicate, the page of somebody else's passport —
 * the office could add one and send one back, but never take one away, so a
 * mistake stayed on the booking for ever and kept it out of "docs complete".
 *
 * The stored object goes first, then the access log (which has a foreign key
 * to the row), then the row. Deleting the row while its file stayed in the
 * bucket would leave a passport scan nobody can see and nobody can delete.
 */
export async function deleteBookingDocument(
  admin: SupabaseClient,
  documentId: string,
): Promise<boolean> {
  const { data: doc } = await admin
    .from("booking_documents")
    .select("storage_path")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return false;
  await admin.storage.from(BUCKET).remove([doc.storage_path]);
  await admin.from("document_access_log").delete().eq("document_id", documentId);
  await admin.from("booking_documents").delete().eq("id", documentId);
  return true;
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
    .update({
      verified_by: verifiedBy,
      verified_at: new Date().toISOString(),
      // Verifying settles it, so any earlier rejection is over (0073 forbids a
      // row claiming both).
      rejected_at: null,
      rejected_reason: null,
      rejected_by: null,
    })
    .eq("id", documentId)
    .select("booking_id")
    .single();
  if (!doc) return { bookingId: null, confirmed: false };

  const confirmed = await confirmIfDocsComplete(admin, doc.booking_id);
  return { bookingId: doc.booking_id, confirmed };
}

/**
 * Say no to a document, in words the trekker can act on.
 *
 * The reason is not optional at any layer — here, in the form, and in the
 * database — because a rejection without one tells somebody their passport is
 * wrong and gives them no way to make it right.
 */
export async function rejectDocument(
  admin: SupabaseClient,
  documentId: string,
  rejectedBy: string,
  reason: string,
): Promise<{ bookingId: string | null; personName: string | null; type: string | null }> {
  const problem = rejectionProblem(reason);
  if (problem) return { bookingId: null, personName: null, type: null };

  const { data: doc } = await admin
    .from("booking_documents")
    .update({
      rejected_at: new Date().toISOString(),
      rejected_reason: cleanReason(reason),
      rejected_by: rejectedBy,
      // It is not verified any more, whatever it was before.
      verified_at: null,
      verified_by: null,
    })
    .eq("id", documentId)
    .select("booking_id, person_name, type")
    .single();
  if (!doc) return { bookingId: null, personName: null, type: null };
  // A confirmed trip whose passport has just been sent back is not confirmed
  // any more, and nothing used to notice: `confirmIfDocsComplete` fired from
  // verifying alone, never from rejecting.
  const { applyBookingStatus } = await import("~/lib/booking-status.server");
  await applyBookingStatus(admin, doc.booking_id);
  return { bookingId: doc.booking_id, personName: doc.person_name, type: doc.type };
}

/**
 * Re-derive this booking's status after a document changed.
 *
 * It used to work out the answer itself — papers complete, balance settled,
 * write "confirmed" — which made it the only re-evaluation in the codebase
 * and the only one that noticed. A booking that became complete any other way
 * (a payment settling, a traveller added, a rejection lifted) never did.
 *
 * Now it asks `applyBookingStatus`, which reads the same facts for every
 * caller. Returns whether the booking is now confirmed or past it, which is
 * what the callers use to decide whether to send the confirmation email.
 */
export async function confirmIfDocsComplete(
  admin: SupabaseClient,
  bookingId: string,
): Promise<boolean> {
  const { applyBookingStatus } = await import("~/lib/booking-status.server");
  const { status } = await applyBookingStatus(admin, bookingId);
  return ["confirmed", "active", "completed"].includes(String(status));
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

/* ── Permit scans (0074) ─────────────────────────────────────────────────
   The issued permit itself, so the trekker has something to show at a
   checkpost rather than our word that it is "ready". Same private bucket and
   the same signed-URL-only rule as a passport: the path is stored, never the
   URL, and nothing is ever public. */

/** Ops attaches the issued permit — a photograph of it, or the PDF. */
export async function uploadPermitScan(
  admin: SupabaseClient,
  args: { applicationId: string; bookingId: string; file: File; uploadedBy: string },
): Promise<{ ok: boolean; error?: string }> {
  const ext = extFor(args.file.type, args.file.name);
  const path = `permits/${args.bookingId}/${args.applicationId}-${Date.now()}.${ext}`;

  const bytes = new Uint8Array(await args.file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: args.file.type, upsert: true });
  if (upErr) return { ok: false, error: upErr.message };

  const { error } = await admin
    .from("permit_applications")
    .update({
      scan_path: path,
      scan_uploaded_at: new Date().toISOString(),
      scan_uploaded_by: args.uploadedBy,
    })
    .eq("id", args.applicationId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * A short-lived link to an issued permit.
 *
 * The caller decides who is allowed to ask — ops, or the trekker whose booking
 * it is. This only turns a stored path into a link that expires.
 */
export async function signedPermitScanUrl(
  admin: SupabaseClient,
  applicationId: string,
): Promise<string | null> {
  const { data: app } = await admin
    .from("permit_applications")
    .select("scan_path")
    .eq("id", applicationId)
    .maybeSingle();
  if (!app?.scan_path) return null;

  const { data: signed } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(app.scan_path, SIGNED_TTL_SECONDS);
  return signed?.signedUrl ?? null;
}
