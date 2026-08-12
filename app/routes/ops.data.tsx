import { Form, Link, data } from "react-router";
import type { Route } from "./+types/ops.data";
import { getEnv, requireOps } from "~/lib/supabase.server";
import { cn } from "~/lib/cn";

/**
 * The data browser: every table, readable, without opening the Supabase
 * dashboard.
 *
 * Read-only by construction — there is no action on this route, so nothing
 * here can write. The founder's rule is that all schema changes go through
 * migrations; this page exists so that *looking* stops requiring a browser
 * tab, a login, and a vendor UI. Sort any column, page through, and follow a
 * row's id into the app page that owns it where one exists.
 *
 * The table list is an allowlist, written down rather than introspected: a
 * future table with something sensitive in it should have to be added here
 * deliberately, not appear by default.
 */
const TABLES: Record<string, string[]> = {
  People: ["users", "guides", "guide_languages", "guide_verifications", "guide_change_requests", "guide_strikes"],
  Catalogue: ["routes", "offerings", "offering_photos", "permits", "availability"],
  Bookings: ["enquiries", "bookings", "payments", "instalments", "payouts", "contracts", "tims_cards", "permit_applications", "booking_documents", "checkins"],
  Groups: ["trip_groups", "trip_group_members", "trip_group_messages", "events", "event_signups", "departures", "departure_members"],
  Content: ["journals", "journal_entries", "journal_comments", "journal_tags", "guide_questions", "guide_question_votes", "reviews", "recaps", "guide_photos"],
  Messaging: ["conversations", "messages", "thread_reads", "canned_replies"],
  Safety: ["incidents", "document_access_log"],
};

const ALL = Object.values(TABLES).flat();
const PAGE = 50;

/** Columns hidden everywhere: bulky payloads and things nobody scans. */
const HIDDEN = new Set(["embedding", "search_tsv"]);

/** Where a row's id leads inside the app, when the app has a page for it. */
const ROW_LINKS: Record<string, (row: any) => string | null> = {
  bookings: (r) => `/ops/bookings/${r.id}`,
  journals: (r) => `/ops/journals/${r.id}`,
  guides: (r) => `/ops/verifications/${r.user_id}`,
  events: () => `/ops/events`,
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  const p = new URL(request.url).searchParams;

  const table = ALL.includes(p.get("table") ?? "") ? p.get("table")! : "bookings";
  const page = Math.max(0, Number(p.get("page")) || 0);
  const dir = p.get("dir") === "asc" ? "asc" : "desc";
  const sortRaw = p.get("sort") ?? "";

  // Count first, so the sort column can be validated against real columns
  // even on an empty page.
  const { count } = await admin.from(table).select("*", { count: "exact", head: true });

  // Default order: newest first where the table records time, primary key
  // otherwise. The sort param is only trusted if it names a column that
  // actually comes back — a made-up ?sort= must not turn into SQL.
  const probe = await admin.from(table).select("*").limit(1);
  const columns = Object.keys(probe.data?.[0] ?? {}).filter((c) => !HIDDEN.has(c));
  const fallback = columns.includes("created_at") ? "created_at" : columns[0] ?? "id";
  const sort = columns.includes(sortRaw) ? sortRaw : fallback;

  const { data: rows, error } = await admin
    .from(table)
    .select("*")
    .order(sort, { ascending: dir === "asc" })
    .range(page * PAGE, page * PAGE + PAGE - 1);

  return data(
    {
      table,
      columns,
      rows: (rows ?? []) as Record<string, unknown>[],
      count: count ?? 0,
      page,
      sort,
      dir,
      error: error?.message ?? null,
    },
    { headers },
  );
}

export default function OpsData({ loaderData }: Route.ComponentProps) {
  const { table, columns, rows, count, page, sort, dir, error } = loaderData as any;
  const pages = Math.max(1, Math.ceil(count / PAGE));

  const qs = (patch: Record<string, string | number>) => {
    const p = new URLSearchParams({ table, sort, dir, page: String(page), ...Object.fromEntries(
      Object.entries(patch).map(([k, v]) => [k, String(v)]),
    ) });
    return `/ops/data?${p}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-ink">Data</h1>
        <p className="text-sm text-ink-soft">
          Read-only. Changes go through the app, or through a migration.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Form method="get" action="/ops/data">
          <select
            name="table"
            defaultValue={table}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="rounded border border-line bg-card px-3 py-1.5 text-sm"
          >
            {Object.entries(TABLES).map(([group, names]) => (
              <optgroup key={group} label={group}>
                {names.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Form>
        <p className="text-sm text-ink-soft">
          <span className="font-mono text-ink">{count.toLocaleString("en-US")}</span>{" "}
          {count === 1 ? "row" : "rows"}
        </p>
      </div>

      {error && (
        <p className="rounded bg-ember/10 px-3 py-2 text-sm text-ember">{error}</p>
      )}

      {rows.length === 0 ? (
        <p className="rounded-md border border-line bg-card p-4 text-sm text-ink-soft">
          The table is empty.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-line bg-card">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                {columns.map((c: string) => (
                  <th key={c} className="whitespace-nowrap px-3 py-2 font-medium">
                    <Link
                      to={qs({ sort: c, dir: sort === c && dir === "desc" ? "asc" : "desc", page: 0 })}
                      className={cn(
                        "hover:text-primary",
                        sort === c ? "text-primary" : "text-ink-soft",
                      )}
                    >
                      {c}
                      {sort === c && (dir === "desc" ? " ↓" : " ↑")}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r: any, i: number) => {
                const href = ROW_LINKS[table]?.(r) ?? null;
                return (
                  <tr key={r.id ?? i} className="align-top hover:bg-mist/40">
                    {columns.map((c: string, j: number) => (
                      <td key={c} className="max-w-[26rem] px-3 py-1.5">
                        {j === 0 && href ? (
                          <Link to={href} className="text-primary hover:underline">
                            <Cell v={r[c]} />
                          </Link>
                        ) : (
                          <Cell v={r[c]} />
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center gap-3 text-sm">
          {page > 0 && (
            <Link to={qs({ page: page - 1 })} className="text-primary hover:underline">
              ← Newer
            </Link>
          )}
          <span className="text-ink-soft">
            page <span className="font-mono">{page + 1}</span> of{" "}
            <span className="font-mono">{pages}</span>
          </span>
          {page + 1 < pages && (
            <Link to={qs({ page: page + 1 })} className="text-primary hover:underline">
              Older →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * One value, rendered to be scanned.
 *
 * Uuids shorten to their first block with the whole thing on hover; json
 * collapses to one line; long text truncates. The full value is always in
 * the title attribute, so nothing is unreachable — just quiet.
 */
function Cell({ v }: { v: unknown }) {
  if (v === null || v === undefined) return <span className="text-ink-soft/50">—</span>;
  if (typeof v === "boolean")
    return <span className="font-mono text-xs">{v ? "true" : "false"}</span>;
  if (typeof v === "number")
    return <span className="font-mono text-xs">{v.toLocaleString("en-US")}</span>;
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuid.test(s))
    return (
      <span title={s} className="font-mono text-xs text-ink-soft">
        {s.slice(0, 8)}…
      </span>
    );
  // Timestamps: date and minute, seconds are noise here.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s))
    return (
      <span title={s} className="whitespace-nowrap font-mono text-xs">
        {s.slice(0, 16).replace("T", " ")}
      </span>
    );
  const shown = s.length > 90 ? s.slice(0, 87) + "…" : s;
  return (
    <span title={s.length > 90 ? s : undefined} className={cn(typeof v === "object" && "font-mono text-xs")}>
      {shown}
    </span>
  );
}
