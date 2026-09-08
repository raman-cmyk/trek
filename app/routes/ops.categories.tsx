import { Form, Link, data, useNavigation } from "react-router";
import type { Route } from "./+types/ops.categories";
import { getEnv, requireOps } from "~/lib/supabase.server";
import { Badge, Panel } from "~/components/ops/ui";
import { Button } from "~/components/Button";
import { SKILLS, skillLabel } from "~/lib/guide-skills";
import {
  categoryProblems,
  membersOf,
  orderCategories,
  slugifyCategory,
  type Category,
} from "~/lib/categories";

/**
 * The homepage's rows, editable.
 *
 * They used to be a list in a source file: six rows, and a seventh needed a
 * developer and a deploy. Which guides go in front of people is a daily
 * judgement — a festival week, a route that suddenly has four good guides on
 * it — and this is where it gets made.
 *
 * One page rather than a list plus a detail screen. There will be a dozen of
 * these, not a thousand, and putting the guide list under each row means
 * assigning somebody is a tick rather than a navigation.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);

  const [{ data: categories }, { data: picks }, { data: guides }, { data: skills }] =
    await Promise.all([
      admin
        .from("categories")
        .select("id, slug, label, blurb, auto_skill, live, sort, min_guides")
        .order("sort"),
      admin.from("guide_categories").select("category_id, guide_id, sort"),
      admin
        .from("guides")
        .select("user_id, slug, status, tier, home_district, users(full_name)")
        .eq("status", "verified")
        .order("tier", { ascending: false }),
      admin.from("guide_skills").select("guide_id, skill"),
    ]);

  const skillsByGuide: Record<string, string[]> = {};
  for (const r of skills ?? []) (skillsByGuide[r.guide_id] ??= []).push(r.skill);

  const roster = (guides ?? []).map((g: any) => ({
    user_id: g.user_id,
    slug: g.slug,
    name: g.users?.full_name ?? "A guide",
    district: g.home_district,
    tier: g.tier,
  }));
  roster.sort((a, b) => a.name.localeCompare(b.name));

  const byCategory = new Map<string, Array<{ guide_id: string; sort: number }>>();
  for (const p of picks ?? []) {
    (byCategory.get(p.category_id) ?? byCategory.set(p.category_id, []).get(p.category_id))!.push(p);
  }

  return data(
    {
      categories: orderCategories((categories ?? []) as Category[]).map((c) => ({
        ...c,
        pickedIds: (byCategory.get(c.id) ?? []).map((p) => p.guide_id),
        memberCount: membersOf(c, roster, byCategory.get(c.id) ?? [], skillsByGuide).length,
      })),
      roster,
      skillsByGuide,
    },
    { headers },
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { admin, headers } = await requireOps(request, env);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const id = String(form.get("id") ?? "");

  if (intent === "create" || intent === "save") {
    const label = String(form.get("label") ?? "").trim();
    const slug = (String(form.get("slug") ?? "").trim() || slugifyCategory(label)).slice(0, 60);
    const minGuides = Number(form.get("min_guides") ?? 3);
    const problems = categoryProblems({ label, slug, min_guides: minGuides });
    if (problems.length) {
      return data({ error: problems[0].message }, { status: 400, headers });
    }
    const skill = String(form.get("auto_skill") ?? "");
    const patch = {
      label,
      slug,
      blurb: String(form.get("blurb") ?? "").trim().slice(0, 160) || null,
      auto_skill: SKILLS.some((s) => s.key === skill) ? skill : null,
      sort: Math.max(0, Math.min(999, Number(form.get("sort") ?? 100) || 100)),
      min_guides: minGuides,
      live: form.get("live") === "on",
    };
    const { error } =
      intent === "create"
        ? await admin.from("categories").insert(patch)
        : await admin.from("categories").update(patch).eq("id", id);
    if (error) {
      return data(
        {
          error:
            error.code === "23505"
              ? "That web address is taken by another category."
              : error.message,
        },
        { status: 400, headers },
      );
    }
    return data({ ok: intent === "create" ? "Made." : "Saved." }, { headers });
  }

  // One tick = one guide in or out of one category. A guide is in as many as
  // fit, which is the whole point of the table.
  if (intent === "assign") {
    const guideId = String(form.get("guide_id") ?? "");
    if (form.get("on") === "1") {
      await admin
        .from("guide_categories")
        .upsert({ category_id: id, guide_id: guideId }, { onConflict: "category_id,guide_id" });
    } else {
      await admin
        .from("guide_categories")
        .delete()
        .eq("category_id", id)
        .eq("guide_id", guideId);
    }
    return data({ ok: true }, { headers });
  }

  if (intent === "delete") {
    await admin.from("categories").delete().eq("id", id);
    return data({ ok: "Gone." }, { headers });
  }

  return data({ error: "Unknown action." }, { status: 400, headers });
}

const field =
  "mt-1 w-full rounded border border-border bg-card px-2.5 py-1.5 text-sm text-ink outline-none focus:border-primary";

export default function OpsCategories({ loaderData, actionData }: Route.ComponentProps) {
  const { categories, roster, skillsByGuide } = loaderData as any;
  const nav = useNavigation();
  const busy = nav.state !== "idle";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl text-ink">Homepage rows</h1>
        <p className="mt-0.5 text-sm text-ink-soft">
          Each live row appears on the homepage above the standing ones, in this
          order. A row waits until it has enough guides in it — a row of one
          reads as a bug rather than a choice.
        </p>
      </div>

      {actionData && "error" in (actionData as any) && (actionData as any).error && (
        <p role="alert" className="rounded border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          {(actionData as any).error}
        </p>
      )}

      {categories.map((c: any) => (
        <Panel
          key={c.id}
          title={c.label}
          actions={
            <span className="flex items-center gap-2">
              <Badge tone={c.live ? "green" : "neutral"}>{c.live ? "live" : "draft"}</Badge>
              <Badge tone={c.memberCount >= c.min_guides ? "blue" : "amber"}>
                {c.memberCount} in
              </Badge>
            </span>
          }
        >
          <Form method="post" className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="intent" value="save" />
            <input type="hidden" name="id" value={c.id} />
            <label className="block text-xs text-ink-soft sm:col-span-2">
              Heading
              <input name="label" defaultValue={c.label} className={field} />
            </label>
            <label className="block text-xs text-ink-soft sm:col-span-2">
              Line under it
              <input name="blurb" defaultValue={c.blurb ?? ""} className={field} />
            </label>
            <label className="block text-xs text-ink-soft">
              Web address
              <input name="slug" defaultValue={c.slug} className={field} />
            </label>
            <label className="block text-xs text-ink-soft">
              Everyone who ticked this skill is in too
              <select name="auto_skill" defaultValue={c.auto_skill ?? ""} className={field}>
                <option value="">Hand-picked only</option>
                {SKILLS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-ink-soft">
              Order (lower first)
              <input
                name="sort"
                type="number"
                defaultValue={c.sort}
                className={field}
              />
            </label>
            <label className="block text-xs text-ink-soft">
              Show once it has this many
              <input
                name="min_guides"
                type="number"
                min={1}
                max={12}
                defaultValue={c.min_guides}
                className={field}
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="live" defaultChecked={c.live} />
              On the homepage
            </label>
            <div className="flex items-center gap-3 sm:col-span-2">
              <Button type="submit" size="sm" loading={busy}>
                Save
              </Button>
              <Link
                to={`/guides?category=${c.slug}`}
                target="_blank"
                className="text-sm text-primary hover:underline"
              >
                See the row →
              </Link>
            </div>
          </Form>

          {/* Who is in it. A tick each, because a guide belongs to as many of
              these as fit and picking them from a dropdown one at a time is
              the thing that makes nobody bother. */}
          <details className="mt-3 border-t border-border pt-3">
            <summary className="cursor-pointer text-sm font-medium text-primary">
              Who is in it ({c.pickedIds.length} picked by hand)
            </summary>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {roster.map((g: any) => {
                const picked = c.pickedIds.includes(g.user_id);
                const swept =
                  !picked &&
                  c.auto_skill &&
                  (skillsByGuide[g.user_id] ?? []).includes(c.auto_skill);
                return (
                  <li key={g.user_id}>
                    <Form method="post" replace>
                      <input type="hidden" name="intent" value="assign" />
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="guide_id" value={g.user_id} />
                      <input type="hidden" name="on" value={picked ? "0" : "1"} />
                      <button
                        type="submit"
                        className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm ${
                          picked ? "bg-mist text-ink" : "text-ink-soft hover:bg-surface"
                        }`}
                      >
                        <span aria-hidden="true" className="w-4 shrink-0 text-primary">
                          {picked ? "✓" : swept ? "·" : ""}
                        </span>
                        <span className="min-w-0 truncate">
                          {g.name}
                          {g.district ? (
                            <span className="text-xs text-ink-soft"> · {g.district}</span>
                          ) : null}
                          {swept ? (
                            <span className="text-xs text-ink-soft">
                              {" "}
                              · in via {skillLabel(c.auto_skill)?.toLowerCase()}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </Form>
                  </li>
                );
              })}
            </ul>
          </details>

          <Form method="post" className="mt-3">
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="id" value={c.id} />
            <button className="text-xs text-ink-soft underline underline-offset-4 hover:text-danger">
              Delete this row
            </button>
          </Form>
        </Panel>
      ))}

      <Panel title="A new row">
        <Form method="post" className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="intent" value="create" />
          <label className="block text-xs text-ink-soft sm:col-span-2">
            Heading
            <input
              name="label"
              required
              placeholder="Guides who know the birds"
              className={field}
            />
          </label>
          <label className="block text-xs text-ink-soft sm:col-span-2">
            Line under it
            <input
              name="blurb"
              placeholder="They will stop, and they will know what it was."
              className={field}
            />
          </label>
          <label className="block text-xs text-ink-soft">
            Everyone who ticked this skill is in too
            <select name="auto_skill" defaultValue="" className={field}>
              <option value="">Hand-picked only</option>
              {SKILLS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-ink-soft">
            Order (lower first)
            <input name="sort" type="number" defaultValue={100} className={field} />
          </label>
          <label className="block text-xs text-ink-soft">
            Show once it has this many
            <input name="min_guides" type="number" min={1} max={12} defaultValue={3} className={field} />
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" name="live" />
            On the homepage straight away
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" size="sm" loading={busy}>
              Make the row
            </Button>
          </div>
        </Form>
      </Panel>
    </div>
  );
}
