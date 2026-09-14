import { Form, Link, data, useNavigation, useSearchParams } from "react-router";
import { useState } from "react";
import type { Route } from "./+types/ops.verifications";
import { Badge, EmptyRow, Panel } from "~/components/ops/ui";
import { Button } from "~/components/Button";
import { cn } from "~/lib/cn";
import { fmtDate } from "~/lib/format";
import { CHECK_STATUS_LABELS, checkLabel, type CheckStatus } from "~/lib/guide-checks";
import {
  DOC_STAGES,
  GUIDE_STAGES,
  checkTally,
  docMatchesStage,
  docStage,
  docState,
  docTypeLabel,
  guideBlocker,
  guideStage,
  guideStatusLabel,
  validateRejection,
  type DocStageKey,
} from "~/lib/verification-queue";
import { verifyDocument } from "~/lib/documents.server";
import { getEnv, requireOps } from "~/lib/supabase.server";

/**
 * Everything waiting on a human eye, in two queues.
 *
 * It was one list of guides who had applied, each reduced to "2/6 passed" —
 * which two took opening the profile, and a verified or rejected guide could
 * not be reached from here at all. Trekkers' passports were not here in any
 * form, so the document a trip was waiting on lived only inside that trip.
 *
 * Both tabs are now filterable by stage, both itemise what is actually
 * outstanding, and a document can be passed or turned down without leaving
 * the page.
 */

const TABS = [
  { key: "guides", label: "Guides" },
  { key: "trekkers", label: "Trekkers" },
] as const;

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  const url = new URL(request.url);
  const tab = url.searchParams.get("tab") === "trekkers" ? "trekkers" : "guides";
  const stage = guideStage(url.searchParams.get("stage"));
  const docs = docStage(url.searchParams.get("docs"));

  const [{ data: guides }, { data: documents }] = await Promise.all([
    admin
      .from("guides")
      .select(
        "user_id, slug, status, tier, home_district, created_at, users(full_name, avatar_url), guide_verifications(check_type, status, notes, verified_at, expires_at)",
      )
      .order("created_at", { ascending: false })
      .limit(400),
    admin
      .from("booking_documents")
      .select(
        "id, type, person_name, created_at, verified_at, rejected_at, rejected_reason, booking:bookings(id, start_date, offering:offerings(title), trekker:users!bookings_trekker_id_fkey(full_name, email))",
      )
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  const allGuides = (guides ?? []).map((g: any) => {
    const checks = (g.guide_verifications ?? []) as Array<{
      check_type: string;
      status: string;
      expires_at: string | null;
    }>;
    return {
      userId: g.user_id,
      slug: g.slug,
      status: g.status as string,
      district: (g.home_district ?? null) as string | null,
      name: (g.users?.full_name ?? g.slug) as string,
      // "such as guide profile pictures" — a reviewer wants to know whether
      // there is a face on the page, which is not one of the formal checks.
      hasPhoto: Boolean(g.users?.avatar_url),
      appliedOn: g.created_at as string,
      checks: [...checks].sort((a, b) => a.check_type.localeCompare(b.check_type)),
      tally: checkTally(checks),
      blocker: guideBlocker(checks, checkLabel),
    };
  });

  const guideCounts = Object.fromEntries(
    GUIDE_STAGES.map((s) => [
      s.key,
      allGuides.filter((g) => (s.match as readonly string[]).includes(g.status)).length,
    ]),
  ) as Record<string, number>;

  const allDocs = (documents ?? []).map((d: any) => ({
    id: d.id as string,
    type: d.type as string,
    personName: d.person_name as string,
    uploadedAt: d.created_at as string,
    verifiedAt: (d.verified_at ?? null) as string | null,
    rejectedAt: (d.rejected_at ?? null) as string | null,
    rejectedReason: (d.rejected_reason ?? null) as string | null,
    state: docState({ verified_at: d.verified_at ?? null, rejected_at: d.rejected_at ?? null }),
    bookingId: (d.booking?.id ?? null) as string | null,
    tripTitle: (d.booking?.offering?.title ?? "a trip") as string,
    startDate: (d.booking?.start_date ?? null) as string | null,
    trekkerName: (d.booking?.trekker?.full_name ?? "—") as string,
  }));

  const docCounts = Object.fromEntries(
    DOC_STAGES.map((s) => [
      s.key,
      allDocs.filter((d) =>
        docMatchesStage({ verified_at: d.verifiedAt, rejected_at: d.rejectedAt }, s.key),
      ).length,
    ]),
  ) as Record<string, number>;

  return data(
    {
      tab,
      stage: stage.key,
      docs,
      guideCounts,
      docCounts,
      guides: allGuides.filter((g) => (stage.match as readonly string[]).includes(g.status)),
      documents: allDocs.filter((d) =>
        docMatchesStage({ verified_at: d.verifiedAt, rejected_at: d.rejectedAt }, docs),
      ),
    },
    { headers },
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireOps(request, env);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const id = String(form.get("doc_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return data({ error: "Nothing picked." }, { status: 400, headers });
  }

  if (intent === "verify_doc") {
    // Clears any earlier rejection, so a replaced document does not read as
    // both passed and turned down.
    await admin
      .from("booking_documents")
      .update({ rejected_at: null, rejected_by: null, rejected_reason: null })
      .eq("id", id);
    const res = await verifyDocument(admin, id, user.id);
    return data(
      {
        ok: res.confirmed
          ? "Verified — and that trip is now confirmed."
          : "Verified.",
      },
      { headers },
    );
  }

  if (intent === "reject_doc") {
    const parsed = validateRejection(form.get("reason"));
    if ("error" in parsed) return data({ error: parsed.error }, { status: 400, headers });
    await admin
      .from("booking_documents")
      .update({
        rejected_at: new Date().toISOString(),
        rejected_by: user.id,
        rejected_reason: parsed.reason,
        verified_at: null,
        verified_by: null,
      })
      .eq("id", id);
    return data({ ok: "Turned down. They can upload another." }, { headers });
  }

  return data({ error: "Nothing to do." }, { status: 400, headers });
}

export default function OpsVerifications({ loaderData, actionData }: Route.ComponentProps) {
  const { tab, stage, docs, guides, documents, guideCounts, docCounts } = loaderData as any;
  const [params] = useSearchParams();
  const said = actionData as { ok?: string; error?: string } | undefined;

  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) p.set(k, v);
    return `/ops/verifications?${p.toString()}`;
  };

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl">Verification queue</h1>

      {said?.ok && (
        <div className="rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{said.ok}</div>
      )}
      {said?.error && (
        <div className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-800">{said.error}</div>
      )}

      {/* Two queues, because a guide's licence and a trekker's passport are
          different jobs with different questions. */}
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            to={href({ tab: t.key })}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              tab === t.key
                ? "border-primary bg-primary/10 font-medium text-primary"
                : "border-border text-ink-soft hover:bg-black/5",
            )}
          >
            {t.label}
            <span className="ml-1.5 font-mono text-xs text-ink-soft">
              {t.key === "guides" ? guideCounts.waiting : docCounts.unverified}
            </span>
          </Link>
        ))}
      </div>

      {tab === "guides" ? (
        <>
          <Chips
            options={GUIDE_STAGES.map((s) => ({ key: s.key, label: s.label }))}
            current={stage}
            counts={guideCounts}
            hrefFor={(k) => href({ stage: k })}
          />
          <Panel>
            {guides.length === 0 ? (
              <EmptyRow>
                {stage === "waiting" ? "No guides waiting. All caught up." : "Nobody at this stage."}
              </EmptyRow>
            ) : (
              <ul className="divide-y divide-border">
                {guides.map((g: any) => (
                  <li key={g.userId} className="py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            to={`/ops/people/${g.userId}?t=verification`}
                            className="font-medium hover:underline"
                          >
                            {g.name}
                          </Link>
                          <Badge tone={toneForGuide(g.status)}>{guideStatusLabel(g.status)}</Badge>
                          {/* Not a formal check, but the first thing a
                              reviewer looks for: is there a face on the page. */}
                          <Badge tone={g.hasPhoto ? "green" : "red"}>
                            {g.hasPhoto ? "photo ✓" : "no photo"}
                          </Badge>
                          <span className="text-xs text-ink-soft">
                            {g.district ?? "no district"} · applied {fmtDate(g.appliedOn)}
                          </span>
                        </div>

                        {/* Itemised. "2/6 passed" told the office a number and
                            nothing they could act on. */}
                        <ul className="mt-2 flex flex-wrap gap-1.5">
                          {g.checks.length === 0 ? (
                            <li className="text-xs text-ink-soft">No checks on file yet.</li>
                          ) : (
                            g.checks.map((c: any) => (
                              <li key={c.check_type}>
                                <span
                                  className={cn(
                                    "rounded-full border px-2 py-0.5 text-xs",
                                    checkChip(c.status),
                                  )}
                                  title={CHECK_STATUS_LABELS[c.status as CheckStatus] ?? c.status}
                                >
                                  {checkLabel(c.check_type)}
                                  <span className="ml-1 opacity-70">
                                    {CHECK_STATUS_LABELS[c.status as CheckStatus] ?? c.status}
                                  </span>
                                </span>
                              </li>
                            ))
                          )}
                        </ul>
                        {g.blocker && <p className="mt-1.5 text-xs text-ink-soft">{g.blocker}</p>}
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="font-mono text-sm text-ink-soft">
                          {g.tally.passed}/{g.tally.total}
                        </p>
                        <Link
                          to={`/ops/people/${g.userId}?t=verification`}
                          className="text-sm font-medium text-primary hover:underline"
                        >
                          Review →
                        </Link>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      ) : (
        <>
          <Chips
            options={DOC_STAGES.map((s) => ({ key: s.key, label: s.label }))}
            current={docs}
            counts={docCounts}
            hrefFor={(k) => href({ docs: k })}
          />
          <Panel>
            {documents.length === 0 ? (
              <EmptyRow>
                {docs === "unverified"
                  ? "No documents waiting. All caught up."
                  : "Nothing at this stage."}
              </EmptyRow>
            ) : (
              <ul className="divide-y divide-border">
                {documents.map((d: any) => (
                  <DocRow key={d.id} doc={d} />
                ))}
              </ul>
            )}
          </Panel>
          <p className="text-xs text-ink-soft">
            Opening a document writes a line to the access log with your name.
            They are deleted 90 days after the trip ends.
          </p>
        </>
      )}
    </div>
  );
}

function Chips({
  options,
  current,
  counts,
  hrefFor,
}: {
  options: Array<{ key: string; label: string }>;
  current: string;
  counts: Record<string, number>;
  hrefFor: (key: string) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map((o) => (
        <Link
          key={o.key}
          to={hrefFor(o.key)}
          className={cn(
            "rounded-full border px-3 py-1 text-sm",
            current === o.key
              ? "border-primary bg-primary/10 font-medium text-primary"
              : "border-border text-ink-soft hover:bg-black/5",
          )}
        >
          {o.label}
          <span className="ml-1.5 font-mono text-xs text-ink-soft">{counts[o.key] ?? 0}</span>
        </Link>
      ))}
    </div>
  );
}

/**
 * One trekker document, with the two answers on it.
 *
 * Turning one down asks for a reason first, because the reason is what the
 * trekker reads and acts on — "blurred, we cannot read the number" is a
 * re-upload, "rejected" is a support thread.
 */
function DocRow({ doc }: { doc: any }) {
  const nav = useNavigation();
  const [rejecting, setRejecting] = useState(false);
  const busy =
    nav.state === "submitting" && String(nav.formData?.get("doc_id")) === doc.id;

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-ink">{docTypeLabel(doc.type)}</span>
            <Badge
              tone={doc.state === "verified" ? "green" : doc.state === "rejected" ? "red" : "amber"}
            >
              {doc.state === "unverified" ? "waiting" : doc.state}
            </Badge>
            <span className="text-sm text-ink-soft">for {doc.personName}</span>
          </div>
          <p className="mt-0.5 text-xs text-ink-soft">
            {doc.trekkerName} · {doc.tripTitle}
            {doc.startDate ? ` · leaves ${fmtDate(doc.startDate)}` : ""} · uploaded{" "}
            {fmtDate(doc.uploadedAt)}
          </p>
          {doc.state === "rejected" && doc.rejectedReason && (
            <p className="mt-1 text-xs text-ember">Turned down: {doc.rejectedReason}</p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <a
            href={`/ops/doc/booking/${doc.id}`}
            target="_blank"
            rel="noreferrer"
            className="rounded border border-border px-2.5 py-1 text-sm text-primary hover:bg-black/5"
          >
            Open
          </a>
          {doc.state !== "verified" && (
            <Form method="post">
              <input type="hidden" name="intent" value="verify_doc" />
              <input type="hidden" name="doc_id" value={doc.id} />
              <Button type="submit" size="sm" loading={busy}>
                Verify
              </Button>
            </Form>
          )}
          {doc.state !== "rejected" && !rejecting && (
            <button
              type="button"
              onClick={() => setRejecting(true)}
              className="rounded px-2 py-1 text-sm text-ember hover:underline"
            >
              Turn down
            </button>
          )}
          {doc.bookingId && (
            <Link
              to={`/ops/bookings/${doc.bookingId}`}
              className="text-sm text-ink-soft hover:text-primary"
            >
              Trip →
            </Link>
          )}
        </div>
      </div>

      {rejecting && (
        <Form method="post" className="mt-2 flex flex-wrap items-end gap-2">
          <input type="hidden" name="intent" value="reject_doc" />
          <input type="hidden" name="doc_id" value={doc.id} />
          <label className="min-w-[18rem] flex-1 text-xs text-ink-soft">
            What is wrong with it? They read this.
            <input
              name="reason"
              required
              minLength={4}
              maxLength={300}
              autoFocus
              placeholder="Blurred — we cannot read the passport number."
              className="mt-1 w-full rounded border border-border bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-primary"
            />
          </label>
          <Button type="submit" size="sm" variant="danger" loading={busy}>
            Turn it down
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setRejecting(false)}>
            Cancel
          </Button>
        </Form>
      )}
    </li>
  );
}

function toneForGuide(status: string): "green" | "amber" | "red" | "neutral" {
  if (status === "verified") return "green";
  if (status === "in_review") return "amber";
  if (status === "removed" || status === "suspended") return "red";
  return "neutral";
}

function checkChip(status: string): string {
  if (status === "passed") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "failed" || status === "expired") return "border-red-200 bg-red-50 text-red-800";
  if (status === "not_required") return "border-border bg-stone-50 text-stone-600";
  return "border-amber-200 bg-amber-50 text-amber-800";
}
