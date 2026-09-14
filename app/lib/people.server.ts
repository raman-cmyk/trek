import type { SupabaseClient } from "@supabase/supabase-js";
import { parseDeleteResult, type DeletePersonResult } from "./people";

const DOCUMENTS_BUCKET = "documents";

/**
 * Delete a guide, trekker or office account, entirely.
 *
 * Order matters and is the reason this is one function:
 *
 *   1. Note which private documents they hold — once the rows are gone the
 *      paths are unrecoverable, and a passport left in the bucket is exactly
 *      what rule 9 in CLAUDE.md forbids.
 *   2. `ops_delete_person` (migration 0059) refuses anyone with trips, payouts
 *      or contracts and otherwise removes every row in one transaction.
 *   3. Only then the files and the auth account. The profile row references
 *      auth.users, so the sign-in cannot go first; and a login that survives
 *      a failed step 2 still points at an intact profile, which is the safe
 *      way round.
 */
export async function deletePerson(
  admin: SupabaseClient,
  userId: string,
): Promise<DeletePersonResult | { ok: false; reason: "failed" }> {
  const { data: docs } = await admin
    .from("guide_documents")
    .select("storage_path")
    .eq("guide_id", userId);
  const paths = (docs ?? []).map((d: { storage_path: string }) => d.storage_path);

  const { data, error } = await admin.rpc("ops_delete_person", { p_user_id: userId });
  if (error) {
    console.error("ops_delete_person failed", error.message);
    return { ok: false, reason: "failed" };
  }
  const result = parseDeleteResult(data);
  if (!result.ok) return result;

  if (paths.length) {
    const { error: rmErr } = await admin.storage.from(DOCUMENTS_BUCKET).remove(paths);
    if (rmErr) console.error("could not remove guide documents after delete", rmErr.message);
  }
  const { error: authErr } = await admin.auth.admin.deleteUser(userId);
  if (authErr && !/not found/i.test(authErr.message)) {
    console.error("could not remove auth user after delete", authErr.message);
  }
  return result;
}
