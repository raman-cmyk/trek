import { useState } from "react";
import { Form, Link, useFetcher } from "react-router";
import { Button } from "~/components/Button";
import { docState, liveDocs, outstanding, STATE_LABEL } from "~/lib/doc-review";
import { Badge } from "~/components/ops/ui";
import { missingDocs, owedSummary, type Traveller } from "~/lib/travellers";

/**
 * Who is walking.
 *
 * The upload form used to ask "whose is it?" as free text, typed fresh every
 * time, so one party of one ended up with three passports filed under "xyz",
 * "XYZ" and "INS" and nothing could tell whether that was one person or three.
 * The names are the roster now, and the roster is what the permits are filed
 * against.
 */
export function TravellerRoster({
  travellers,
  docs,
  partySize,
  error,
  busy,
  canEdit = true,
}: {
  travellers: Traveller[];
  docs: any[];
  partySize: number;
  error?: string | null;
  busy: boolean;
  canEdit?: boolean;
}) {
  const owed = missingDocs(travellers, docs);
  const short = Math.max(0, partySize - travellers.length);
  const summary = owedSummary(owed);

  return (
    <div className="rounded-card border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium text-ink">Who is going</h3>
        <span className="text-xs text-ink-soft">
          {travellers.length} of {partySize}
        </span>
      </div>
      <p className="mt-0.5 text-sm text-ink-soft">
        Names exactly as they are printed on each passport — that is what the
        permit counter reads.
      </p>

      {travellers.length > 0 && (
        <ul className="mt-3 divide-y divide-border border-y border-border">
          {owed.map(({ traveller: t, missing, pending }) => (
            <li key={t.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-ink">
                {t.full_name}
                {t.is_lead && (
                  <span className="ml-1.5 text-xs text-ink-soft">· we call them first</span>
                )}
              </span>
              {missing.length + pending.length === 0 ? (
                <Badge tone="green">papers in</Badge>
              ) : (
                <Badge tone="amber">
                  {missing.length > 0 ? `${missing.length} to send` : "checking"}
                </Badge>
              )}
              {canEdit && (
                <Form method="post" className="shrink-0">
                  <input type="hidden" name="intent" value="roster_remove" />
                  <input type="hidden" name="traveller_id" value={t.id} />
                  <button
                    className="text-xs text-ink-soft underline hover:text-danger"
                    aria-label={`Remove ${t.full_name}`}
                  >
                    remove
                  </button>
                </Form>
              )}
            </li>
          ))}
        </ul>
      )}

      {summary && <p className="mt-2 text-sm text-ink-soft">{summary}</p>}

      {canEdit && short > 0 && (
        <Form method="post" className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="intent" value="roster_add" />
          <input
            name="full_name"
            required
            placeholder="Name as printed on the passport"
            className="min-w-0 flex-1 rounded-button border border-border px-3 py-2 text-sm"
          />
          <Button type="submit" size="sm" variant="secondary" loading={busy}>
            Add
          </Button>
        </Form>
      )}

      {canEdit && short === 0 && travellers.length > partySize && (
        <p className="mt-2 text-sm text-ink-soft">
          This trip is booked for {partySize}. Message your guide if the party has
          changed.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}

/**
 * Choose a file, in words a person can find.
 *
 * This was the browser's own control: "Choose file  No file chosen", 13px,
 * grey on grey, no border, sitting above a green Upload button. The founder,
 * on his phone: *"The place i need to click that says 'choose file' need to be
 * more clear. And also the choose file and no file chosen seems like one
 * word."* Both complaints are about the same rendering — the button and the
 * status run together because the native control draws them as one line with
 * no gap and no boundary.
 *
 * So: the input is hidden inside a label that looks like what it is, and what
 * you have chosen gets its own line underneath. Same pattern as the guide
 * application's DocUpload, which was built for the same reason.
 *
 * `required` is deliberately gone. A hidden input that fails validation is one
 * Chrome cannot scroll to or focus, so the form silently refuses to submit
 * with no message anywhere. The action already answers this — "Say whose it is
 * and choose a file" — and that is a sentence rather than a browser tooltip.
 */
function FilePick({ name, accept }: { name: string; accept: string }) {
  const [chosen, setChosen] = useState<string | null>(null);
  return (
    <div>
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-button border-2 border-dashed border-sage bg-mist/40 px-4 py-3 text-sm font-medium text-ink transition-colors duration-instant hover:border-moss hover:bg-mist focus-within:border-moss focus-within:ring-2 focus-within:ring-moss/30">
        <PaperclipGlyph />
        {chosen ? "Choose a different file" : "Choose a photo or PDF"}
        <input
          type="file"
          name={name}
          accept={accept}
          onChange={(e) => setChosen(e.target.files?.[0]?.name ?? null)}
          className="sr-only"
        />
      </label>
      {/* Its own line, so it can never read as part of the button. With
          JavaScript off this stays on "Nothing chosen yet" — the label still
          opens the picker and the upload still works, which is the half that
          matters. */}
      <p className="mt-1.5 truncate text-caption text-ink-soft">
        {chosen ?? "Nothing chosen yet."}
      </p>
    </div>
  );
}

function PaperclipGlyph() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="h-4 w-4 shrink-0 text-moss"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M13.5 7.5 8 13a2.5 2.5 0 0 1-3.5-3.5l6-6a4 4 0 0 1 5.7 5.7l-6 6a5.5 5.5 0 0 1-7.8-7.8" />
    </svg>
  );
}

/**
 * One kind of document, with its own upload form.
 *
 * Deliberately not a dropdown: a person on this page has one document in
 * their hand, and the question "which of these two is it?" is one we can
 * answer for them by asking twice instead of once.
 */
export function DocumentSlot({
  title,
  blurb,
  type,
  docs,
  travellers,
  bookingId,
  error,
  busy,
  status,
  footer,
}: {
  title: string;
  blurb: string;
  type: "passport" | "insurance";
  docs: any[];
  travellers: Traveller[];
  bookingId: string;
  error: string | null;
  busy: boolean;
  /** Where this document stands with our team, when that is worth saying. */
  status?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  // Who we already hold this document for, so the picker can say that
  // uploading again replaces it rather than adding a second one.
  const held = new Set(liveDocs(docs).map((d: any) => d.traveller_id));
  const waiting = travellers.filter((t) => !held.has(t.id));

  if (travellers.length === 0) {
    return (
      <div className="rounded-card border border-border bg-card p-4">
        <h3 className="font-medium text-ink">{title}</h3>
        <p className="mt-0.5 text-sm text-ink-soft">
          Add who is going first — every document is filed against a person.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium text-ink">{title}</h3>
        <span className="text-xs text-ink-soft">
          {liveDocs(docs).length} of {travellers.length}
        </span>
      </div>
      <p className="mt-0.5 text-sm text-ink-soft">{blurb}</p>
      {status}

      {liveDocs(docs).length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {liveDocs(docs).map((d: any) => (
            <li key={d.id} className="flex items-center justify-between gap-2">
              <a
                href={`/trips/${bookingId}/doc/${d.id}`}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 truncate text-primary hover:underline"
              >
                {d.person_name}
              </a>
              <Badge tone={docState(d) === "verified" ? "green" : docState(d) === "rejected" ? "red" : "amber"}>
                {STATE_LABEL[docState(d)]}
              </Badge>
            </li>
          ))}
        </ul>
      )}

      {outstanding(docs).map((d: any) => (
        <p
          key={`why-${d.id}`}
          className="mt-2 rounded-card border border-danger/30 bg-danger/5 p-3 text-sm text-ink"
        >
          <span className="font-medium">{d.person_name} needs redoing.</span>{" "}
          {d.rejected_reason}
          <span className="mt-1 block text-xs text-ink-soft">
            Upload a new one below and we will check it again.
          </span>
        </p>
      ))}

      <Form
        method="post"
        encType="multipart/form-data"
        className="mt-3 space-y-2 border-t border-border pt-3"
      >
        <input type="hidden" name="intent" value="upload" />
        <input type="hidden" name="type" value={type} />
        {/* A picker over the roster, not a name box. Typing the name again on
            every upload is what put three spellings of one person on one
            booking. */}
        <select
          name="traveller_id"
          required
          defaultValue={waiting[0]?.id ?? travellers[0]?.id ?? ""}
          className="w-full rounded-button border border-border bg-card px-3 py-2 text-sm"
        >
          {travellers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.full_name}
              {held.has(t.id) ? " — replaces the one we hold" : ""}
            </option>
          ))}
        </select>
        <FilePick name="file" accept="image/*,application/pdf" />
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" size="sm" loading={busy}>
          Upload {title.toLowerCase()}
        </Button>
      </Form>

      {footer}
    </div>
  );
}

/**
 * The other half of the insurance question.
 *
 * Half the people on this page do not have a certificate to upload, and the
 * ones who think they do often hold a policy that stops at 3,000m — which is
 * below where they are walking. Both need somewhere to go that is not the
 * upload box.
 *
 * We do not sell insurance yet, so this asks rather than sells: no price, no
 * checkout, no provider named until there is one. The request reaches a human
 * and lands in email_log, which is also how we find out whether enough people
 * want it to be worth building properly.
 */
export function NoInsuranceYet({
  bookingId,
  altitudeM,
  asked,
  attested,
}: {
  bookingId: string;
  altitudeM: number;
  asked: boolean;
  attested: boolean;
}) {
  const fetcher = useFetcher<{ ok?: string }>();
  const done = asked || !!fetcher.data?.ok;
  return (
    <div className="mt-4 rounded-card bg-surface p-3">
      <p className="text-sm font-medium text-ink">Don’t have insurance yet?</p>
      <p className="mt-0.5 text-sm text-ink-soft">
        Most ordinary travel policies stop at 3,000m, so a policy you already
        own may not cover this trek — you are walking to {altitudeM.toLocaleString()}m.
        We are putting together cover you can buy through us that does, including
        helicopter rescue.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {done ? (
          <p className="text-sm text-accent">
            Asked — we’ll email you with cover that qualifies.
          </p>
        ) : (
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="insurance_interest" />
            <Button type="submit" size="sm" loading={fetcher.state !== "idle"}>
              Ask us to sort it
            </Button>
          </fetcher.Form>
        )}
        <Link
          to={`/insurance?bookingId=${bookingId}`}
          className="text-sm text-primary hover:underline"
        >
          {attested ? "Re-check the policy you have" : "Check the policy you have →"}
        </Link>
      </div>
      <p className="mt-2 text-xs text-ink-soft">
        Nothing is charged, and you can always use your own policy.
      </p>
    </div>
  );
}
