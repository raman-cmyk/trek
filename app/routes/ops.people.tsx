import { Form, Link, data, useNavigation, useSearchParams } from "react-router";
import { useState } from "react";
import type { Route } from "./+types/ops.people";
import { Badge, EmptyRow, Panel } from "~/components/ops/ui";
import { Button } from "~/components/Button";
import { cn } from "~/lib/cn";
import { escapeLike } from "~/lib/browse";
import { PENDING_CHECKS } from "~/lib/guide-checks";
import { fmtDate } from "~/lib/format";
import { formatUsd } from "~/lib/pricing";
import { createAdminClient, getEnv, requireOps } from "~/lib/supabase.server";
import { describeDeletionBlock, whyNotDeletable } from "~/lib/people";
import { deletePerson } from "~/lib/people.server";

/**
 * Everybody, in one list.
 *
 * The office could find a person only by already knowing which page they were
 * on — the verification queue held applicants, the pipeline held bookings, and
 * a trekker who had not booked yet appeared nowhere at all. This is the
 * directory: guides, trekkers and the office itself, searchable, each row
 * opening the one page that holds their whole story.
 */

const TABS = [
  { key: "guides", label: "Guides" },
  { key: "trekkers", label: "Trekkers" },
  { key: "office", label: "Office" },
] as const;

const GUIDE_STATUSES = ["applied", "in_review", "verified", "suspended", "removed"];

function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "guide"
  );
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireOps(request, env);
  const url = new URL(request.url);
  const tab = (url.searchParams.get("tab") ?? "guides") as (typeof TABS)[number]["key"];
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 60);
  const status = url.searchParams.get("status") ?? "";

  const role = tab === "office" ? "ops" : tab === "trekkers" ? "trekker" : "guide";

  let people = admin
    .from("users")
    .select("id, full_name, email, phone, country_code, avatar_url, created_at, role")
    .eq("role", role)
    .order("created_at", { ascending: false })
    .limit(400);
  if (q.length >= 2) {
    const like = `%${escapeLike(q)}%`;
    people = people.or(
      `full_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`,
    );
  }
  const { data: users } = await people;
  const ids = (users ?? []).map((u: any) => u.id);

  // Guide records and booking counts, fetched once and joined in memory —
  // three round trips beats one per row.
  const [guideRes, bookingRes] = await Promise.all([
    tab === "guides" && ids.length
      ? admin
          .from("guides")
          .select(
            "user_id, slug, status, tier, home_district, day_rate_usd_cents, treks_completed_platform, licence_expiry, created_at",
          )
          .in("user_id", ids)
      : Promise.resolve({ data: [] as any[] }),
    ids.length
      ? admin
          .from("bookings")
          .select("id, status, trekker_id, guide_id, start_date")
          .or(
            role === "guide"
              ? `guide_id.in.(${ids.join(",")})`
              : `trekker_id.in.(${ids.join(",")})`,
          )
          .limit(4000)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const guideBy = new Map((guideRes.data ?? []).map((g: any) => [g.user_id, g]));
  const trips = new Map<string, { total: number; live: number }>();
  for (const b of bookingRes.data ?? []) {
    const key = role === "guide" ? b.guide_id : b.trekker_id;
    const t = trips.get(key) ?? { total: 0, live: 0 };
    t.total++;
    if (["deposit_paid", "docs_pending", "confirmed", "active"].includes(b.status)) {
      t.live++;
    }
    trips.set(key, t);
  }

  let rows = (users ?? []).map((u: any) => ({
    id: u.id,
    name: u.full_name as string,
    email: u.email as string | null,
    phone: u.phone as string | null,
    country: u.country_code as string | null,
    avatar: u.avatar_url as string | null,
    joined: u.created_at as string,
    guide: (guideBy.get(u.id) ?? null) as any,
    trips: trips.get(u.id) ?? { total: 0, live: 0 },
  }));

  if (tab === "guides" && status) rows = rows.filter((r) => r.guide?.status === status);

  return data({ tab, q, status, rows, me: user.id }, { headers });
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, headers } = await requireOps(request, env);
  const form = await request.formData();

  if (form.get("intent") === "delete") {
    const id = String(form.get("id") ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return data({ error: "Nobody picked." }, { status: 400, headers });
    }
    if (id === user.id) {
      return data({ error: "You can't delete yourself." }, { status: 400, headers });
    }
    const result = await deletePerson(createAdminClient(env), id);
    if (result.ok) return data({ ok: `${result.name} deleted.` }, { headers });
    if (result.reason === "has_history") {
      return data({ error: describeDeletionBlock(result) }, { status: 400, headers });
    }
    if (result.reason === "not_found") {
      return data({ error: "They're already gone." }, { status: 404, headers });
    }
    return data({ error: "Couldn't delete them. Try again." }, { status: 500, headers });
  }

  const role = String(form.get("role") ?? "trekker");
  const fullName = String(form.get("full_name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const phone = String(form.get("phone") ?? "").trim() || null;
  const country = String(form.get("country_code") ?? "").trim().toUpperCase() || null;
  const password = String(form.get("password") ?? "");

  if (fullName.length < 2) return data({ error: "A name is needed." }, { status: 400, headers });
  if (!/.+@.+\..+/.test(email)) {
    return data({ error: "That email doesn't look right." }, { status: 400, headers });
  }
  if (password.length < 8) {
    return data(
      { error: "Set a password of at least 8 characters — they can change it later." },
      { status: 400, headers },
    );
  }
  if (!["trekker", "guide", "ops"].includes(role)) {
    return data({ error: "Pick what kind of account this is." }, { status: 400, headers });
  }

  const admin = createAdminClient(env);
  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    ...(phone ? { phone } : {}),
    email_confirm: true,
    user_metadata: { full_name: fullName, created_by: "ops" },
  });
  if (authErr || !created?.user) {
    const msg = /already|registered|exists/i.test(authErr?.message ?? "")
      ? "Someone already has that email or phone."
      : "Couldn't create the account.";
    return data({ error: msg }, { status: 400, headers });
  }
  const userId = created.user.id;

  const { error: profileErr } = await admin.from("users").insert({
    id: userId,
    role,
    full_name: fullName,
    email,
    phone,
    country_code: country,
  });
  if (profileErr) {
    await admin.auth.admin.deleteUser(userId);
    return data({ error: "Couldn't save the profile." }, { status: 400, headers });
  }

  if (role === "guide") {
    const slug = `${slugify(fullName)}-${Math.floor(Math.random() * 9000 + 1000)}`;
    const { error: guideErr } = await admin
      .from("guides")
      .insert({ user_id: userId, slug, status: "applied", tier: 0 });
    if (guideErr) {
      await admin.from("users").delete().eq("id", userId);
      await admin.auth.admin.deleteUser(userId);
      return data({ error: "Couldn't create the guide record." }, { status: 400, headers });
    }
    // Same starting checklist a public application gets, so a guide added by
    // the office is not quietly exempt from verification.
    await admin.from("guide_verifications").insert(
      PENDING_CHECKS.map((check_type) => ({
        guide_id: userId,
        check_type,
        status: "pending",
      })),
    );
  }

  return data({ ok: `${fullName} added.`, id: userId }, { headers });
}

export default function OpsPeople({ loaderData, actionData }: Route.ComponentProps) {
  const { tab, q, status, rows, me } = loaderData;
  const [params] = useSearchParams();
  const nav = useNavigation();
  const [adding, setAdding] = useState(false);
  // Delete mode swaps the row's "Open" for a "Delete" that asks once, inline.
  // A second click is the whole ceremony: this is the office, not the public.
  const [removing, setRemoving] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const gone = params.get("gone");
  const deleting =
    nav.state === "submitting" && nav.formData?.get("intent") === "delete"
      ? String(nav.formData.get("id"))
      : null;
  const said = actionData as { ok?: string; id?: string; error?: string } | undefined;

  const tabHref = (key: string) => {
    const p = new URLSearchParams(params);
    p.set("tab", key);
    p.delete("status");
    return `/ops/people?${p.toString()}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl">People</h1>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={removing ? "secondary" : "danger"}
            onClick={() => {
              setRemoving((v) => !v);
              setConfirming(null);
              setAdding(false);
            }}
          >
            {removing ? "Done" : "Delete someone"}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setAdding((v) => !v);
              setRemoving(false);
            }}
          >
            {adding ? "Cancel" : "Add someone"}
          </Button>
        </div>
      </div>

      {(said?.ok || gone) && (
        <div className="flex items-center justify-between rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          <span>{said?.ok ?? `${gone} deleted.`}</span>
          {said?.id && (
            <Link to={`/ops/people/${said.id}`} className="font-medium underline">
              Open their profile →
            </Link>
          )}
        </div>
      )}
      {said?.error && !adding && (
        <div className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-800">{said.error}</div>
      )}

      {removing && (
        <div className="rounded-md border border-ember/30 bg-ember/5 px-4 py-2 text-sm">
          Pick who to delete. Their account, profile, listings and messages go for
          good. Anyone with a trip on the books can't be deleted — set a guide to
          removed instead.
        </div>
      )}

      {adding && (
        <Panel title="Add someone">
          <Form method="post" className="grid gap-3 sm:grid-cols-2">
            {said?.error && (
              <p className="sm:col-span-2 rounded bg-red-50 px-3 py-2 text-sm text-red-800">
                {said.error}
              </p>
            )}
            <Field label="Full name" name="full_name" required />
            <label className="text-sm">
              <span className="mb-1 block text-ink-soft">They are a</span>
              <select
                name="role"
                defaultValue={tab === "trekkers" ? "trekker" : tab === "office" ? "ops" : "guide"}
                className="w-full rounded border border-border bg-surface px-2.5 py-1.5"
              >
                <option value="guide">Guide</option>
                <option value="trekker">Trekker</option>
                <option value="ops">Office</option>
              </select>
            </label>
            <Field label="Email" name="email" type="email" required />
            <Field label="Phone" name="phone" placeholder="+977…" />
            <Field label="Country" name="country_code" placeholder="NP" />
            <Field
              label="Temporary password"
              name="password"
              type="text"
              required
              hint="Tell them this once; they change it after signing in."
            />
            <div className="sm:col-span-2">
              <Button type="submit" size="sm" loading={nav.state === "submitting"}>
                Create account
              </Button>
            </div>
          </Form>
        </Panel>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            to={tabHref(t.key)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              tab === t.key
                ? "border-primary bg-primary/10 font-medium text-primary"
                : "border-border text-ink-soft hover:bg-black/5",
            )}
          >
            {t.label}
          </Link>
        ))}
        <Form method="get" className="ml-auto flex items-center gap-2">
          <input type="hidden" name="tab" value={tab} />
          <input
            name="q"
            defaultValue={q}
            type="search"
            placeholder="Name, email or phone"
            className="w-56 rounded border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-primary"
          />
          {tab === "guides" && (
            <select
              name="status"
              defaultValue={status}
              className="rounded border border-border bg-surface px-2 py-1.5 text-sm"
            >
              <option value="">Any status</option>
              {GUIDE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
          )}
          <Button size="sm" variant="secondary" type="submit">
            Search
          </Button>
        </Form>
      </div>

      <Panel>
        {rows.length === 0 ? (
          <EmptyRow>
            {q ? `Nobody matches “${q}”.` : "Nobody here yet."}
          </EmptyRow>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-soft">
              <tr className="border-b border-border">
                <th className="pb-2 font-medium">Name</th>
                <th className="pb-2 font-medium">Contact</th>
                {tab === "guides" ? (
                  <>
                    <th className="pb-2 font-medium">District</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Day rate</th>
                  </>
                ) : (
                  <>
                    <th className="pb-2 font-medium">Country</th>
                    <th className="pb-2 font-medium">Joined</th>
                  </>
                )}
                <th className="pb-2 font-medium">Trips</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 hover:bg-black/[0.02]">
                  <td className="py-2.5">
                    <Link
                      to={`/ops/people/${r.id}`}
                      className="flex items-center gap-2 font-medium hover:underline"
                    >
                      <Avatar url={r.avatar} name={r.name} />
                      {r.name}
                      {r.guide?.tier > 0 && (
                        <span className="text-xs text-ink-soft">T{r.guide.tier}</span>
                      )}
                    </Link>
                  </td>
                  <td className="py-2.5 text-ink-soft">
                    <div className="truncate">{r.email ?? "—"}</div>
                    {r.phone && <div className="text-xs">{r.phone}</div>}
                  </td>
                  {tab === "guides" ? (
                    <>
                      <td className="py-2.5 text-ink-soft">{r.guide?.home_district ?? "—"}</td>
                      <td className="py-2.5">
                        <Badge tone={guideTone(r.guide?.status)}>
                          {(r.guide?.status ?? "no record").replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-ink-soft">
                        {r.guide?.day_rate_usd_cents
                          ? formatUsd(r.guide.day_rate_usd_cents)
                          : "—"}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-2.5 text-ink-soft">{r.country ?? "—"}</td>
                      <td className="py-2.5 text-ink-soft">{fmtDate(r.joined)}</td>
                    </>
                  )}
                  <td className="py-2.5 text-ink-soft">
                    {r.trips.total === 0 ? (
                      "—"
                    ) : (
                      <>
                        <span>{r.trips.total}</span>
                        {r.trips.live > 0 && (
                          <span className="ml-1.5 text-xs text-primary">
                            · {r.trips.live} live
                          </span>
                        )}
                      </>
                    )}
                  </td>
                  <td className="py-2.5 text-right">
                    {!removing ? (
                      <Link
                        to={`/ops/people/${r.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        Open →
                      </Link>
                    ) : (
                      <DeleteCell
                        id={r.id}
                        name={r.name}
                        blocked={whyNotDeletable({ isSelf: r.id === me, trips: r.trips.total })}
                        confirming={confirming === r.id}
                        busy={deleting === r.id}
                        onAsk={() => setConfirming(r.id)}
                        onKeep={() => setConfirming(null)}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      <p className="text-xs text-ink-soft">
        {rows.length} shown{rows.length >= 400 ? " (first 400 — narrow with search)" : ""}.
      </p>
    </div>
  );
}

function DeleteCell({
  id,
  name,
  blocked,
  confirming,
  busy,
  onAsk,
  onKeep,
}: {
  id: string;
  name: string;
  blocked: string | null;
  confirming: boolean;
  busy: boolean;
  onAsk: () => void;
  onKeep: () => void;
}) {
  if (blocked) return <span className="text-xs text-ink-soft">{blocked}</span>;
  if (!confirming) {
    return (
      <button
        type="button"
        onClick={onAsk}
        className="font-medium text-ember hover:underline"
      >
        Delete
      </button>
    );
  }
  return (
    <Form method="post" className="flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="intent" value="delete" />
      <input type="hidden" name="id" value={id} />
      <span className="text-xs text-ink-soft">Delete {name.split(" ")[0]} for good?</span>
      <Button type="submit" size="sm" variant="danger" loading={busy} loadingText="Deleting…">
        Yes, delete
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onKeep}>
        Keep
      </Button>
    </Form>
  );
}

function guideTone(status?: string) {
  if (status === "verified") return "green" as const;
  if (status === "in_review" || status === "applied") return "amber" as const;
  if (status === "suspended" || status === "removed") return "red" as const;
  return "neutral" as const;
}

function Avatar({ url, name }: { url: string | null; name: string }) {
  if (url) {
    return <img src={url} alt="" className="h-6 w-6 rounded-full object-cover" />;
  }
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-stone-200 text-[10px] font-semibold text-stone-600">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-ink-soft">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="w-full rounded border border-border bg-surface px-2.5 py-1.5 outline-none focus:border-primary"
      />
      {hint && <span className="mt-1 block text-xs text-ink-soft">{hint}</span>}
    </label>
  );
}
