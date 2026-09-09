import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/ops.users";
import { Badge, EmptyRow, Panel } from "~/components/ops/ui";
import { CopyButton } from "~/components/ops/CopyButton";
import { fmtDateShort } from "~/lib/format";
import { getEnv, requireOps } from "~/lib/supabase.server";
import {
  accountRows,
  isSuperAdmin,
  loginPathFor,
  matchesAccount,
  newPassword,
  sinceLabel,
  type AuthRecord,
} from "~/lib/super-admin";

/**
 * Every login on the platform, for the one person allowed to see them.
 *
 * /ops/people lists profiles. This lists ACCOUNTS — the auth record itself —
 * so a signup that never finished, a guide who has not opened the app since
 * March, and a phone-only account all show, with when they last signed in.
 *
 * Two things can be done from a row, and both are the founder stepping into
 * someone's shoes to see what they see:
 *
 *   Open as them  — a one-time sign-in link for that account, made on the
 *                   spot. Opening it signs this browser in as them.
 *   New password  — replaces their password with a fresh one, shown once.
 *                   For test accounts and for a guide on the phone who is
 *                   locked out; it is their real password afterwards.
 *
 * Nobody can read a password — Supabase stores a hash — so "copy their
 * password" is not a thing that exists. These are the two honest versions.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireOps(request, env);
  if (!isSuperAdmin(user.email)) throw redirect("/ops", { headers });

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 60);

  // Auth users come a page at a time; 1000 a page is far more than we have,
  // and the loop is here so the list never silently stops at page one.
  const auth: AuthRecord[] = [];
  for (let page = 1; page <= 10; page++) {
    const { data: res, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !res?.users?.length) break;
    auth.push(...(res.users as AuthRecord[]));
    if (res.users.length < 1000) break;
  }
  const { data: profiles } = await admin.from("users").select("id, role, full_name");

  const all = accountRows(auth, (profiles ?? []) as any);
  const week = Date.now() - 7 * 86400000;
  return data(
    {
      q,
      rows: all.filter((a) => matchesAccount(a, q)),
      total: all.length,
      thisWeek: all.filter((a) => a.last_sign_in_at && Date.parse(a.last_sign_in_at) > week).length,
      never: all.filter((a) => !a.last_sign_in_at).length,
    },
    { headers },
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireOps(request, env);
  if (!isSuperAdmin(user.email)) throw redirect("/ops", { headers });

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const id = String(form.get("id") ?? "");
  const { data: target } = await admin.auth.admin.getUserById(id);
  const who = target?.user;
  if (!who) return data({ error: "No such account." }, { status: 404, headers });
  const { data: profile } = await admin
    .from("users")
    .select("role, full_name")
    .eq("id", id)
    .maybeSingle();
  const name = profile?.full_name || who.email || who.phone || "this account";

  if (intent === "enter") {
    if (!who.email) {
      return data(
        { error: `${name} has no email address, so there is no link to make. Set a password instead.` },
        { status: 400, headers },
      );
    }
    // A magic link, minted here and never sent: the hashed token goes into
    // our own confirm route, which turns it into a session for that account.
    const { data: link, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: who.email,
    });
    const token = link?.properties?.hashed_token;
    if (error || !token) {
      return data({ error: error?.message ?? "Couldn't make a link." }, { status: 500, headers });
    }
    const url = new URL("/ops/users/enter", request.url);
    url.searchParams.set("token_hash", token);
    return data({ enter: { name, url: url.toString() } }, { headers });
  }

  if (intent === "password") {
    const password = newPassword();
    const { error } = await admin.auth.admin.updateUserById(id, { password });
    if (error) return data({ error: error.message }, { status: 500, headers });
    return data(
      {
        password: {
          name,
          email: who.email ?? who.phone ?? "",
          password,
          login: loginPathFor((profile?.role as any) ?? "none", who.email ?? null),
        },
      },
      { headers },
    );
  }

  return data({ error: "Unknown action." }, { status: 400, headers });
}

const ROLE_TONE = { guide: "teal", trekker: "blue", ops: "amber", none: "neutral" } as const;

export default function OpsUsers({ loaderData, actionData }: Route.ComponentProps) {
  const { q, rows, total, thisWeek, never } = loaderData;
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const act = (actionData ?? {}) as any;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl text-ink">Everyone's logins</h1>
        <p className="text-sm text-ink-soft">
          <span className="font-mono">{total}</span> accounts ·{" "}
          <span className="font-mono">{thisWeek}</span> signed in this week ·{" "}
          <span className="font-mono">{never}</span> never signed in. Only you see this page.
        </p>
      </div>

      {act.error && (
        <p role="alert" className="rounded border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          {act.error}
        </p>
      )}

      {act.enter && (
        <Panel title={`Sign in as ${act.enter.name}`}>
          <p className="text-sm text-ink-soft">
            A one-time link, good for an hour. Opening it here signs this browser out of ops
            and in as them — open it in a private window to keep both.
          </p>
          <Row label="Link" value={act.enter.url} />
          <a
            href={act.enter.url}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block rounded-button bg-pine px-3 py-1.5 text-sm font-medium text-paper hover:bg-moss"
          >
            Open as {act.enter.name} →
          </a>
        </Panel>
      )}

      {act.password && (
        <Panel title={`New password for ${act.password.name}`}>
          <p className="text-sm text-ink-soft">
            This is their password now — the old one no longer works. It is shown once; copy it.
          </p>
          <Row label="Email" value={act.password.email} />
          <Row label="Password" value={act.password.password} />
          <a
            href={act.password.login}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block rounded-button bg-pine px-3 py-1.5 text-sm font-medium text-paper hover:bg-moss"
          >
            Open their sign-in page →
          </a>
        </Panel>
      )}

      <Form method="get" className="flex gap-2">
        <input
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Name, email or phone"
          className="w-full max-w-sm rounded border border-border bg-card px-2.5 py-1.5 text-sm outline-none focus:border-primary"
        />
        <button className="rounded border border-border px-3 py-1.5 text-sm text-ink">Find</button>
      </Form>

      <Panel>
        {rows.length === 0 ? (
          <EmptyRow>Nobody matches.</EmptyRow>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-ink-soft">
                <tr>
                  <th className="pb-2 pr-3 font-medium">Who</th>
                  <th className="pb-2 pr-3 font-medium">Email / phone</th>
                  <th className="pb-2 pr-3 font-medium">Last sign-in</th>
                  <th className="pb-2 pr-3 font-medium">Joined</th>
                  <th className="pb-2 pr-3 font-medium">Signs in with</th>
                  <th className="pb-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((a) => (
                  <tr key={a.id} className="align-top">
                    <td className="py-2 pr-3">
                      <Link to={`/ops/people/${a.id}`} className="font-medium text-ink hover:underline">
                        {a.name}
                      </Link>
                      <div className="mt-0.5 flex gap-1">
                        <Badge tone={ROLE_TONE[a.role]}>{a.role === "none" ? "no profile" : a.role}</Badge>
                        {a.banned && <Badge tone="red">banned</Badge>}
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      {a.email && (
                        <p className="flex items-center gap-1.5">
                          <span className="font-mono text-xs">{a.email}</span>
                          <CopyButton value={a.email} />
                        </p>
                      )}
                      {a.phone && (
                        <p className="mt-0.5 flex items-center gap-1.5">
                          <span className="font-mono text-xs">{a.phone}</span>
                          <CopyButton value={a.phone} />
                        </p>
                      )}
                      {!a.confirmed && (
                        <p className="mt-0.5 text-xs text-ink-soft">not confirmed</p>
                      )}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <span className={a.last_sign_in_at ? "text-ink" : "text-ink-soft"}>
                        {sinceLabel(a.last_sign_in_at)}
                      </span>
                      {a.last_sign_in_at && (
                        <p className="text-xs text-ink-soft">{fmtDateShort(a.last_sign_in_at)}</p>
                      )}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap text-ink-soft">
                      {fmtDateShort(a.created_at)}
                    </td>
                    <td className="py-2 pr-3 text-ink-soft">{a.provider}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1.5">
                        <Form method="post">
                          <input type="hidden" name="intent" value="enter" />
                          <input type="hidden" name="id" value={a.id} />
                          <button
                            disabled={busy || !a.email}
                            title={
                              a.email
                                ? "Make a one-time sign-in link for this account"
                                : "No email on this account"
                            }
                            className="rounded border border-border px-2 py-0.5 text-xs text-ink hover:border-moss disabled:opacity-40"
                          >
                            Open as them
                          </button>
                        </Form>
                        <Form
                          method="post"
                          onSubmit={(e) => {
                            if (!confirm(`Replace ${a.name}'s password with a new one?`)) {
                              e.preventDefault();
                            }
                          }}
                        >
                          <input type="hidden" name="intent" value="password" />
                          <input type="hidden" name="id" value={a.id} />
                          <button
                            disabled={busy}
                            className="rounded border border-border px-2 py-0.5 text-xs text-ink hover:border-moss disabled:opacity-40"
                          >
                            New password
                          </button>
                        </Form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

/** A label, the value in mono, and a button that copies it. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
      <span className="w-20 shrink-0 text-xs text-ink-soft">{label}</span>
      <code className="min-w-0 break-all rounded bg-mist px-2 py-1 font-mono text-xs text-ink">
        {value}
      </code>
      <CopyButton value={value} />
    </p>
  );
}
