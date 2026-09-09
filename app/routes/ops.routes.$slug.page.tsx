import { Form, Link, data, useNavigation } from "react-router";
import type { Route } from "./+types/ops.routes.$slug.page";
import { getEnv, requireOps } from "~/lib/supabase.server";
import { Badge, Panel } from "~/components/ops/ui";
import { Button } from "~/components/Button";
import {
  BLOCKS,
  blockDef,
  blockIsEmpty,
  normaliseBlock,
  orderBlocks,
  pairsToText,
  parsePairs,
  swapSorts,
  type RouteBlock,
} from "~/lib/route-blocks";

/**
 * Building a route page, block by block.
 *
 * The Langtang page is the best thing on this site and it exists as a
 * TypeScript constant, so a second route getting it means a developer and a
 * deploy. Here it is a list: add a block, fill it in, move it up, publish it.
 *
 * The form for every block is generated from the field definitions rather than
 * written ten times, so a kind that gains a field gains it in the console, on
 * the page, and in the tests at once.
 */
export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);

  const { data: route } = await admin
    .from("routes")
    .select("id, slug, name, region, day_stops")
    .eq("slug", params.slug)
    .maybeSingle();
  if (!route) throw new Response("Not found", { status: 404 });

  const { data: rows } = await admin
    .from("route_blocks")
    .select("id, kind, sort, live, data")
    .eq("route_id", route.id)
    .order("sort");

  const blocks = orderBlocks((rows ?? []) as RouteBlock[]).map((b) => ({
    ...b,
    data: normaliseBlock(b.kind, b.data),
    known: !!blockDef(b.kind),
    empty: blockIsEmpty(b.kind, normaliseBlock(b.kind, b.data)),
  }));

  return data({ route, blocks, kinds: BLOCKS }, { headers });
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const id = String(form.get("id") ?? "");

  const { data: route } = await admin
    .from("routes")
    .select("id")
    .eq("slug", params.slug)
    .maybeSingle();
  if (!route) throw new Response("Not found", { status: 404 });

  if (intent === "add") {
    const kind = String(form.get("kind") ?? "");
    const def = blockDef(kind);
    if (!def) return data({ error: "No such block." }, { status: 400, headers });
    // Goes to the bottom: a new block is a draft, and a draft that lands in
    // the middle of a live page is a surprise.
    const { data: last } = await admin
      .from("route_blocks")
      .select("sort")
      .eq("route_id", route.id)
      .order("sort", { ascending: false })
      .limit(1)
      .maybeSingle();
    await admin.from("route_blocks").insert({
      route_id: route.id,
      kind,
      sort: (last?.sort ?? 0) + 10,
      data: def.empty,
      live: false,
    });
    return data({ ok: `${def.label} added — fill it in below.` }, { headers });
  }

  if (intent === "save") {
    const kind = String(form.get("kind") ?? "");
    const def = blockDef(kind);
    if (!def) return data({ error: "No such block." }, { status: 400, headers });
    const next: Record<string, unknown> = {};
    for (const f of def.fields) {
      const raw = form.get(f.key);
      next[f.key] =
        f.type === "number"
          ? Number(raw) || 0
          : f.type === "pairs" || f.type === "list"
            ? parsePairs(raw)
            : String(raw ?? "").slice(0, f.max ?? 4000);
    }
    await admin
      .from("route_blocks")
      .update({ data: next, live: form.get("live") === "on" })
      .eq("id", id)
      .eq("route_id", route.id);
    return data({ ok: "Saved." }, { headers });
  }

  if (intent === "move") {
    const { data: rows } = await admin
      .from("route_blocks")
      .select("id, kind, sort, live, data")
      .eq("route_id", route.id);
    const moves = swapSorts(
      (rows ?? []) as RouteBlock[],
      id,
      String(form.get("direction")) === "up" ? "up" : "down",
    );
    for (const m of moves) {
      await admin.from("route_blocks").update({ sort: m.sort }).eq("id", m.id);
    }
    return data({ ok: true }, { headers });
  }

  if (intent === "delete") {
    await admin.from("route_blocks").delete().eq("id", id).eq("route_id", route.id);
    return data({ ok: "Deleted." }, { headers });
  }

  return data({ error: "Unknown action." }, { status: 400, headers });
}

const field =
  "mt-1 w-full rounded border border-border bg-card px-2.5 py-1.5 text-sm text-ink outline-none focus:border-primary";

export default function OpsRoutePage({ loaderData, actionData }: Route.ComponentProps) {
  const { route, blocks, kinds } = loaderData as any;
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const liveCount = blocks.filter((b: any) => b.live && !b.empty).length;

  return (
    <div className="space-y-4">
      <div>
        <Link to="/ops/routes" className="text-sm text-primary">
          ← Routes
        </Link>
        <h1 className="mt-1 font-display text-2xl text-ink">{route.name}</h1>
        <p className="mt-0.5 text-sm text-ink-soft">
          The page, in order, top to bottom.{" "}
          {liveCount > 0 ? (
            <>
              {liveCount} live {liveCount === 1 ? "block" : "blocks"} — this route
              uses the built page.
            </>
          ) : (
            <>Nothing live yet, so the route still shows the standard layout.</>
          )}{" "}
          <a
            href={`/routes/${route.slug}`}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            See it →
          </a>
        </p>
      </div>

      {actionData && "ok" in (actionData as any) && typeof (actionData as any).ok === "string" && (
        <p className="rounded border border-accent/40 bg-accent/5 p-3 text-sm text-ink">
          {(actionData as any).ok}
        </p>
      )}
      {actionData && "error" in (actionData as any) && (
        <p role="alert" className="rounded border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          {(actionData as any).error}
        </p>
      )}

      {blocks.map((b: any, i: number) => {
        const def = kinds.find((k: any) => k.kind === b.kind);
        if (!def) return null;
        return (
          <Panel
            key={b.id}
            title={`${i + 1}. ${def.label}`}
            actions={
              <span className="flex items-center gap-2">
                <Badge tone={b.live && !b.empty ? "green" : "neutral"}>
                  {b.empty ? "empty" : b.live ? "live" : "draft"}
                </Badge>
                {/* Up and down rather than drag: this gets edited on a phone
                    as often as at a desk, and a drag handle on a phone is a
                    scroll that goes wrong. */}
                {[
                  ["up", "↑", i === 0],
                  ["down", "↓", i === blocks.length - 1],
                ].map(([dir, glyph, disabled]) => (
                  <Form method="post" key={dir as string} replace>
                    <input type="hidden" name="intent" value="move" />
                    <input type="hidden" name="id" value={b.id} />
                    <input type="hidden" name="direction" value={dir as string} />
                    <button
                      disabled={disabled as boolean}
                      aria-label={`Move ${dir}`}
                      className="rounded border border-border px-2 py-0.5 text-sm text-ink disabled:opacity-30"
                    >
                      {glyph as string}
                    </button>
                  </Form>
                ))}
              </span>
            }
          >
            <p className="mb-3 text-xs text-ink-soft">{def.blurb}</p>
            <Form method="post" className="space-y-3">
              <input type="hidden" name="intent" value="save" />
              <input type="hidden" name="id" value={b.id} />
              <input type="hidden" name="kind" value={b.kind} />

              {def.fields.map((f: any) => (
                <label key={f.key} className="block text-xs text-ink-soft">
                  {f.label}
                  {f.hint && <span className="ml-1.5 text-ink-soft/70">{f.hint}</span>}
                  {f.type === "long" || f.type === "pairs" || f.type === "list" ? (
                    <textarea
                      name={f.key}
                      rows={f.type === "long" ? 5 : 4}
                      defaultValue={
                        f.type === "long" ? b.data[f.key] : pairsToText(b.data[f.key])
                      }
                      className={`${field} font-mono`}
                    />
                  ) : (
                    <input
                      name={f.key}
                      type={f.type === "number" ? "number" : "text"}
                      defaultValue={b.data[f.key]}
                      placeholder={f.type === "image" ? "/img/climb/langtang/day-1.jpg" : undefined}
                      className={field}
                    />
                  )}
                </label>
              ))}

              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" name="live" defaultChecked={b.live} />
                  On the page
                </label>
                <Button type="submit" size="sm" loading={busy}>
                  Save
                </Button>
              </div>
            </Form>

            <Form method="post" className="mt-3 border-t border-border pt-3">
              <input type="hidden" name="intent" value="delete" />
              <input type="hidden" name="id" value={b.id} />
              <button className="text-xs text-ink-soft underline underline-offset-4 hover:text-danger">
                Delete this block
              </button>
            </Form>
          </Panel>
        );
      })}

      <Panel title="Add a block">
        <ul className="grid gap-2 sm:grid-cols-2">
          {kinds.map((k: any) => (
            <li key={k.kind}>
              <Form method="post" replace>
                <input type="hidden" name="intent" value="add" />
                <input type="hidden" name="kind" value={k.kind} />
                <button className="w-full rounded border border-border bg-card p-3 text-left hover:border-moss">
                  <span className="block text-sm font-medium text-ink">{k.label}</span>
                  <span className="block text-xs text-ink-soft">{k.blurb}</span>
                </button>
              </Form>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
