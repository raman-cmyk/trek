import { useState } from "react";
import { Form, Link, data } from "react-router";
import type { Route } from "./+types/g.payout";
import { Button } from "~/components/Button";
import { copy } from "~/lib/copy";
import { cn } from "~/lib/cn";
import { fmtDate } from "~/lib/format";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { uploadGuideDocument } from "~/lib/documents.server";
import { sniffImage, stripGps } from "~/lib/exif";
import { AFTER_VERIFIED } from "~/lib/guide-checks";
import {
  PAYOUT_METHODS,
  PAYOUT_METHOD_LABELS,
  accountHint,
  accountLabel,
  cleanPan,
  needsBankFields,
  panProblem,
  payoutProblems,
  payoutReady,
} from "~/lib/payout";

/**
 * The guide's money details, on their own screen.
 *
 * This used to be a card squeezed onto the profile page, sharing a form with
 * the day rate: one free-text box called "Payout account" for a wallet number
 * and a bank account alike, no bank, no branch, no way to send us a QR, and
 * every field skip-if-blank so a wrong number could never be removed. The
 * founder's words were "fix the guide payout bank info talking area, upload
 * your QR too".
 *
 * Three things live here and nowhere else now: where to send the money, the
 * QR that proves it, and — for a verified guide only — a PAN. The day rate
 * stays on the profile, because that is a price, not a payment instruction.
 */

/** A QR is a photograph off a phone or a PDF from a bank. Nothing else. */
const MAX_QR_BYTES = 10 * 1024 * 1024;

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");

  const [{ data: guide }, { data: qr }] = await Promise.all([
    admin
      .from("guides")
      .select(
        "status, payout_method, payout_account, payout_account_name, payout_bank_name, payout_branch, pan_number",
      )
      .eq("user_id", user.id)
      .single(),
    // The live QR is simply the newest one they sent (0112 indexes exactly
    // this). Older ones stay on file; the office can still see the history.
    admin
      .from("guide_documents")
      .select("id, original_name, uploaded_at, mime_type")
      .eq("guide_id", user.id)
      .eq("kind", "payout_proof")
      .order("uploaded_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return data({ guide, qr }, { headers });
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "details") {
    const method = String(form.get("payout_method") ?? "").trim();
    const account = String(form.get("payout_account") ?? "").trim();
    const accountName = String(form.get("payout_account_name") ?? "").trim();
    const bankName = String(form.get("payout_bank_name") ?? "").trim();
    const branch = String(form.get("payout_branch") ?? "").trim();

    const problems = payoutProblems({ method, account, accountName, bankName });
    if (problems.length) {
      return data({ error: problems.join(" ") }, { status: 400, headers });
    }

    // Written as given, not skip-if-blank. The old action ignored empty
    // fields, so a guide who had typed the wrong bank could overwrite it but
    // never clear it — and the bank fields are meaningless for a wallet, so
    // they have to be clearable when the method changes.
    const bank = needsBankFields(method);
    const { error } = await admin
      .from("guides")
      .update({
        payout_method: method,
        payout_account: account,
        payout_account_name: accountName,
        payout_bank_name: bank ? bankName || null : null,
        payout_branch: bank ? branch || null : null,
      })
      .eq("user_id", user.id);
    if (error) {
      return data({ error: "That didn't save. Try again." }, { status: 500, headers });
    }

    // A guide telling us where their money goes is the event that creates the
    // office's job of checking it. Eight guides are owed money today and not
    // one of them has a payout_account check row at all, because the rows are
    // only made at application time and these guides predate it.
    await ensureCheck(admin, user.id, "payout_account");
    return data({ ok: copy.guide.payout.saved }, { headers });
  }

  if (intent === "pan") {
    const raw = String(form.get("pan_number") ?? "");
    const problem = panProblem(raw);
    if (problem) return data({ error: problem }, { status: 400, headers });
    const pan = cleanPan(raw);

    const { error } = await admin
      .from("guides")
      .update({ pan_number: pan })
      .eq("user_id", user.id);
    if (error) {
      return data({ error: "That didn't save. Try again." }, { status: 500, headers });
    }
    // Volunteering a PAN is what moves the check off `not_required`, where
    // 0109 left fifty-four of them. Clearing it does not drag the office back
    // into a review of something that is no longer there.
    if (pan) await ensureCheck(admin, user.id, "pan_card", { reopen: true });
    return data({ ok: copy.guide.payout.saved }, { headers });
  }

  if (intent === "qr") {
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return data({ error: "Choose a photo of your QR." }, { status: 400, headers });
    }
    if (file.size > MAX_QR_BYTES) {
      return data(
        { error: "That photo is over 10 MB. Send a smaller one." },
        { status: 400, headers },
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    let body: Uint8Array<ArrayBuffer> = bytes;
    let contentType = file.type;
    let ext = "";

    // A PDF straight from a bank is a real case and arrives with its type set.
    const looksPdf =
      bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
    if (looksPdf) {
      contentType = "application/pdf";
      ext = "pdf";
    } else {
      // Sniffed from the bytes, never from `file.type`. The browser's guess is
      // routinely EMPTY for a screenshot shared out of another app — which is
      // the exact case here, since a guide screenshots their wallet QR and
      // shares it — and trusting it was rejecting real photographs on the
      // journal uploader with "Photos only".
      const kind = sniffImage(bytes);
      if (kind === "heic") {
        return data(
          {
            error:
              "That is an iPhone HEIC photo, which most browsers cannot show. On your iPhone: Settings → Camera → Formats → Most Compatible, then take it again — or send it to yourself on WhatsApp and upload the copy.",
          },
          { status: 400, headers },
        );
      }
      if (kind === "unknown" || kind === "gif") {
        return data(
          { error: "That file is not a photo we can read. Send a JPG, PNG or PDF." },
          { status: 400, headers },
        );
      }
      if (kind === "jpeg") {
        // A payout QR is photographed at home, so the file carries the guide's
        // home coordinates. Same rule as journal photos (app/lib/exif.ts).
        const stripped = stripGps(bytes);
        if (!stripped.understood) {
          return data(
            {
              error:
                "We couldn't read that photo, so we couldn't clear its location. Try another.",
            },
            { status: 400, headers },
          );
        }
        body = stripped.bytes;
      }
      ext = kind === "jpeg" ? "jpg" : kind;
      contentType = kind === "jpeg" ? "image/jpeg" : `image/${kind}`;
    }

    // Handed on as a File whose type matches its bytes, because
    // uploadGuideDocument validates on `.type` and names the stored object
    // from it — the stored file and its content type must always agree.
    const clean = new File([body as BlobPart], `payout-qr.${ext}`, { type: contentType });
    const done = await uploadGuideDocument(admin, {
      guideId: user.id,
      kind: "payout_proof",
      file: clean,
      label: "QR sent by the guide",
      uploadedBy: user.id,
    });
    if (!done.ok) return data({ error: done.error }, { status: 400, headers });

    await ensureCheck(admin, user.id, "payout_account");
    return data({ ok: "Your QR is with the office." }, { headers });
  }

  return data({ error: "Nothing to do." }, { status: 400, headers });
}

/**
 * Make sure the office has a box to tick for this check, and open it.
 *
 * `guide_verifications` rows are created at application time and when ops adds
 * a guide by hand — so every guide who predates that, which is all of the ones
 * currently owed money, has no payout check at all. Creating it here means the
 * row appears because the guide did something, rather than as a backfill that
 * would drop fifty pending items into the office queue at once.
 */
async function ensureCheck(
  admin: any,
  guideId: string,
  checkType: string,
  opts: { reopen?: boolean } = {},
) {
  const { data: existing } = await admin
    .from("guide_verifications")
    .select("id, status")
    .eq("guide_id", guideId)
    .eq("check_type", checkType)
    .maybeSingle();

  if (!existing) {
    await admin
      .from("guide_verifications")
      .insert({ guide_id: guideId, check_type: checkType, status: "pending" });
    return;
  }
  // A passed check is not reopened by an edit — the office decides that. But a
  // PAN arriving against a `not_required` row is new information.
  if (opts.reopen && existing.status === "not_required") {
    await admin
      .from("guide_verifications")
      .update({ status: "pending", verified_at: null, verified_by: null })
      .eq("id", existing.id);
  }
}

export default function GuidePayout({ loaderData, actionData }: Route.ComponentProps) {
  const { guide, qr } = loaderData as any;
  // One shape for both outcomes: the action returns `{ok}` or `{error}` and
  // TypeScript narrows the union per branch, not per property read.
  const said = actionData as { ok?: string; error?: string } | undefined;
  const c = copy.guide.payout;
  const [method, setMethod] = useState<string>(guide?.payout_method ?? "");
  const verified = guide?.status === "verified";
  const ready = payoutReady({
    method: guide?.payout_method,
    account: guide?.payout_account,
    accountName: guide?.payout_account_name,
    bankName: guide?.payout_bank_name,
  });
  const problems = payoutProblems({
    method: guide?.payout_method,
    account: guide?.payout_account,
    accountName: guide?.payout_account_name,
    bankName: guide?.payout_bank_name,
  });

  return (
    <div className="space-y-5 pb-8">
      <div>
        <Link to="/g/earnings" className="text-sm text-primary hover:underline">
          ← Your money
        </Link>
        <h1 className="mt-1 font-display text-2xl text-ink">{c.title}</h1>
        <p className="mt-1 text-sm text-ink-soft">{c.lede}</p>
      </div>

      {/* Where they stand, before any form. A guide should not have to read a
          form to find out whether they are going to be paid. */}
      <section
        className={cn(
          "rounded-photo border p-4",
          ready ? "border-moss/50 bg-mist" : "border-ember/40 bg-ember/5",
        )}
      >
        <p className={cn("text-sm font-medium", ready ? "text-ink" : "text-ember")}>
          {ready ? c.ready : c.notReady}
        </p>
        {!ready && (
          <ul className="mt-1.5 space-y-0.5 text-sm text-ink-soft">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </section>

      {said?.error && (
        <p className="rounded-button bg-ember/10 px-3 py-2 text-sm text-ember">
          {said.error}
        </p>
      )}
      {said?.ok && (
        <p className="rounded-button bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {said.ok}
        </p>
      )}

      {/* ── Where to send it ──────────────────────────────────────────────── */}
      <Form method="post" className="space-y-3 rounded-photo border border-border bg-card p-4">
        <input type="hidden" name="intent" value="details" />

        <label className="block text-sm">
          <span className="text-ink-soft">{c.methodLabel}</span>
          <select
            name="payout_method"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="mt-1 w-full rounded-button border border-border bg-card px-3 py-2.5 text-base"
          >
            {/* A real blank option. Without one the browser selects eSewa and
                a guide who has chosen nothing believes it is set — which is
                how four guides ended up with no method on file. */}
            <option value="">{c.methodBlank}</option>
            {PAYOUT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYOUT_METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="text-ink-soft">{accountLabel(method)}</span>
          <input
            name="payout_account"
            inputMode={method === "bank" ? "numeric" : "tel"}
            defaultValue={guide?.payout_account ?? ""}
            className="mt-1 w-full rounded-button border border-border px-3 py-2.5 text-base"
          />
          {accountHint(method) && (
            <span className="mt-0.5 block text-caption text-muted">{accountHint(method)}</span>
          )}
        </label>

        {needsBankFields(method) && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-ink-soft">{c.bankLabel}</span>
              <input
                name="payout_bank_name"
                defaultValue={guide?.payout_bank_name ?? ""}
                placeholder="NIC Asia"
                className="mt-1 w-full rounded-button border border-border px-3 py-2.5 text-base"
              />
            </label>
            <label className="block text-sm">
              <span className="text-ink-soft">{c.branchLabel}</span>
              <input
                name="payout_branch"
                defaultValue={guide?.payout_branch ?? ""}
                placeholder="Thamel"
                className="mt-1 w-full rounded-button border border-border px-3 py-2.5 text-base"
              />
            </label>
          </div>
        )}

        <label className="block text-sm">
          <span className="text-ink-soft">{c.nameLabel}</span>
          <input
            name="payout_account_name"
            defaultValue={guide?.payout_account_name ?? ""}
            placeholder={c.nameHint}
            className="mt-1 w-full rounded-button border border-border px-3 py-2.5 text-base"
          />
          <span className="mt-0.5 block text-caption text-muted">{c.nameHint}</span>
        </label>

        <Button type="submit">Save</Button>
      </Form>

      {/* ── The QR ───────────────────────────────────────────────────────── */}
      <Form
        method="post"
        encType="multipart/form-data"
        className="space-y-3 rounded-photo border border-border bg-card p-4"
      >
        <input type="hidden" name="intent" value="qr" />
        <div>
          <p className="text-sm font-medium text-ink">{c.qrTitle}</p>
          <p className="mt-0.5 text-caption text-muted">{c.qrLede}</p>
        </div>

        {qr ? (
          <p className="text-sm text-ink-soft">
            {/* Opened through /g/doc/:id, which signs a ten-minute URL and
                logs it. The link is never the file itself. */}
            <a
              href={`/g/doc/${qr.id}`}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline"
            >
              See the QR we have
            </a>{" "}
            · sent {fmtDate(qr.uploaded_at)}
          </p>
        ) : (
          <p className="text-sm text-ink-soft">{c.qrNone}</p>
        )}

        <input
          type="file"
          name="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="block w-full text-sm file:mr-3 file:rounded-button file:border-0 file:bg-mist file:px-3 file:py-2 file:text-sm file:text-ink"
        />
        <Button type="submit" variant="secondary">
          {qr ? c.qrReplace : c.qrAdd}
        </Button>
      </Form>

      {/* ── PAN, only once they are in ───────────────────────────────────── */}
      {verified && AFTER_VERIFIED.includes("pan_card") && (
        <Form method="post" className="space-y-3 rounded-photo border border-border bg-card p-4">
          <input type="hidden" name="intent" value="pan" />
          <div>
            <p className="text-sm font-medium text-ink">{c.panTitle}</p>
            <p className="mt-0.5 text-caption text-muted">{c.panLede}</p>
          </div>
          <input
            name="pan_number"
            inputMode="numeric"
            defaultValue={guide?.pan_number ?? ""}
            placeholder="301234567"
            className="w-full rounded-button border border-border px-3 py-2.5 text-base"
          />
          <Button type="submit" variant="secondary">
            Save
          </Button>
        </Form>
      )}
    </div>
  );
}
