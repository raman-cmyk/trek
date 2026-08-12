import { Link, data } from "react-router";
import type { Route } from "./+types/g.experiences";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { Badge } from "~/components/ops/ui";
import { formatUsd } from "~/lib/pricing";

/**
 * Everything a guide sells, in one list they control.
 *
 * Until now an experience could only be created by the office — a guide who
 * wanted to add the day hike he runs on rest weeks had no button to press.
 * Now he lists it himself; it goes to the office as `pending`, and it sells
 * the moment they approve it. His page, his trips, his prices.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  const { data: offerings } = await admin
    .from("offerings")
    .select("id, kind, title, status, days, price_usd_cents, cover_photo_url")
    .eq("guide_id", user.id)
    .order("status")
    .order("title");
  return data({ offerings: offerings ?? [] }, { headers });
}

const STATUS_LABEL: Record<string, { label: string; tone: any }> = {
  live: { label: "Live — people can book it", tone: "green" },
  pending: { label: "With the office", tone: "amber" },
  draft: { label: "Draft — only you see it", tone: "neutral" },
  paused: { label: "Paused", tone: "neutral" },
};

export default function GuideExperiences({ loaderData }: Route.ComponentProps) {
  const { offerings } = loaderData as any;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl text-ink">Your experiences</h1>
        <p className="mt-1 max-w-[46ch] text-sm text-ink-soft">
          The treks and trips you sell. Add anything you run — a day hike, a
          food walk — the office checks it once, then it is live on your page.
        </p>
      </div>

      <Link
        to="/g/experiences/new"
        className="block rounded-card border border-moss/50 bg-mist p-4 text-center font-medium text-ink hover:bg-sage/40"
      >
        + Add an experience
      </Link>

      {offerings.length === 0 ? (
        <p className="text-sm text-ink-soft">
          Nothing listed yet. Your first experience is the thing people book —
          start with the trek you run most.
        </p>
      ) : (
        <ul className="space-y-3">
          {offerings.map((o: any) => {
            const st = STATUS_LABEL[o.status] ?? { label: o.status, tone: "neutral" };
            return (
              <li key={o.id}>
                <Link
                  to={`/g/experiences/${o.id}`}
                  className="flex gap-3 rounded-card border border-border bg-card p-3 hover:border-sage"
                >
                  {o.cover_photo_url ? (
                    <img src={o.cover_photo_url} alt="" className="h-16 w-24 shrink-0 rounded object-cover" />
                  ) : (
                    <div className="h-16 w-24 shrink-0 rounded bg-wheat/40" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{o.title}</p>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      {o.days} {o.days === 1 ? "day" : "days"}
                      {o.price_usd_cents ? ` · from ${formatUsd(o.price_usd_cents)}` : ""}
                    </p>
                    <div className="mt-1.5">
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </div>
                  </div>
                  <span className="self-center text-primary">→</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
