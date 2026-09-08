import { Form, Link, data } from "react-router";
import type { Route } from "./+types/trips._index";
import { fmtDate, fmtDateRange, statusLabel } from "~/lib/format";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { firstName } from "~/lib/names";
import { SmartImage } from "~/components/SmartImage";
import { Badge } from "~/components/ops/ui";

const TONE: Record<string, "amber" | "blue" | "teal" | "green" | "neutral" | "red"> = {
  pending_deposit: "amber",
  deposit_paid: "amber",
  docs_pending: "amber",
  confirmed: "blue",
  active: "teal",
  completed: "green",
};

export function meta() {
  return [{ title: "My trips" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "trekker");
  const { data: bookings } = await admin
    .from("bookings")
    .select(
      "id, status, start_date, end_date, hold_expires_at, deposit_usd_cents, offering:offerings(title, cover_photo_url), guide:guides(users(full_name))",
    )
    .eq("trekker_id", user.id)
    .order("start_date", { ascending: false });
  // A plan waiting on you is the most important thing on this page — it is
  // the one thing here that stops if nobody looks at it.
  const { data: proposals } = await admin
    .from("package_proposals")
    .select("id, days, party_size, start_date, total_usd_cents, deposit_usd_cents, guide_id")
    .eq("trekker_id", user.id)
    .eq("status", "proposed")
    .order("created_at", { ascending: false });

  // Requests still waiting on a guide. Until now these were invisible here:
  // a trekker sent one, saw nothing on this page or anywhere else, and had no
  // way to tell a request that was sitting in a guide's list from one that had
  // never been sent — which is what makes a second request to the same guide
  // feel impossible.
  const { data: requests } = await admin
    .from("enquiries")
    .select(
      "id, start_date, party_size, status, expires_at, created_at, guide_id, offering:offerings(title, slug, kind)",
    )
    .eq("trekker_id", user.id)
    .in("status", ["open", "quoted"])
    .order("created_at", { ascending: false });

  // Named with a second query rather than an embed: guide_id points at
  // guides(user_id), so "users" is two hops away and the shorthand would
  // silently return nothing.
  const guideIds = [
    ...new Set([
      ...(proposals ?? []).map((p: any) => p.guide_id),
      ...(requests ?? []).map((r: any) => r.guide_id),
    ]),
  ];
  const { data: guideUsers } = guideIds.length
    ? await admin.from("users").select("id, full_name").in("id", guideIds)
    : { data: [] as any[] };
  const nameOf = new Map((guideUsers ?? []).map((u: any) => [u.id, u.full_name]));

  return data(
    {
      userId: user.id,
      bookings: bookings ?? [],
      requests: (requests ?? []).map((r: any) => ({
        ...r,
        guideName: nameOf.get(r.guide_id) ?? null,
      })),
      proposals: (proposals ?? []).map((p: any) => ({
        ...p,
        guideName: nameOf.get(p.guide_id) ?? null,
      })),
    },
    { headers },
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "trekker");
  const form = await request.formData();
  if (String(form.get("intent")) !== "withdraw") {
    return data({ error: "Unknown action." }, { status: 400, headers });
  }
  // Only your own, and only one still waiting — a request the guide already
  // answered is theirs to have answered.
  await admin
    .from("enquiries")
    .update({ status: "withdrawn" })
    .eq("id", String(form.get("enquiry_id")))
    .eq("trekker_id", user.id)
    .in("status", ["open", "quoted"]);
  return data({ ok: true }, { headers });
}

export default function MyTrips({ loaderData }: Route.ComponentProps) {
  const bookings = loaderData.bookings as any[];
  const proposals = (loaderData as any).proposals as any[];
  const requests = (loaderData as any).requests as any[];
  const userId = (loaderData as any).userId as string;
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-3xl text-ink">My trips</h1>
        {/* The other half of the profile idea: guides can now read who is
            asking them, so you should be able to read what they read. */}
        <Link
          to={`/trekkers/${userId}`}
          className="text-sm font-medium text-primary hover:underline"
        >
          How guides see you →
        </Link>
      </div>

      {proposals.length > 0 && (
        <ul className="mt-6 space-y-3">
          {proposals.map((p) => (
            <li key={p.id}>
              <Link
                to={`/proposals/${p.id}`}
                prefetch="intent"
                className="block rounded-card border border-moss/50 bg-mist p-4 hover:border-moss"
              >
                <p className="label text-moss">Waiting for you</p>
                <p className="mt-1 font-medium text-ink">
                  {firstName(p.guideName) || "Your guide"} suggested a plan —{" "}
                  {p.days} {p.days === 1 ? "day" : "days"} for {p.party_size}, starting{" "}
                  {p.start_date}
                </p>
                <p className="mt-0.5 text-sm text-ink-soft">
                  See what changed and approve it →
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {requests.length > 0 && (
        <section className="mt-6">
          <h2 className="label text-ink-soft">Waiting on a guide</h2>
          <ul className="mt-2 space-y-3">
            {requests.map((r) => (
              <li
                key={r.id}
                className="rounded-card border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{r.offering?.title}</p>
                    <p className="mt-0.5 text-sm text-ink-soft">
                      {firstName(r.guideName) || "Your guide"} · {r.start_date} ·{" "}
                      {r.party_size} {r.party_size === 1 ? "person" : "people"}
                    </p>
                  </div>
                  <Badge tone={r.status === "quoted" ? "blue" : "amber"}>
                    {r.status === "quoted" ? "replied" : "sent"}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-ink-soft">
                  {r.status === "quoted"
                    ? "They have suggested something — look for their plan above or in your messages."
                    : `Sent ${fmtDate(r.created_at)}. Guides have 24 hours to reply; after that it lapses and you can ask again or ask somebody else.`}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Link
                    to={`/messages`}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Message {firstName(r.guideName) || "them"}
                  </Link>
                  <Form method="post">
                    <input type="hidden" name="intent" value="withdraw" />
                    <input type="hidden" name="enquiry_id" value={r.id} />
                    <button
                      type="submit"
                      className="text-sm text-ink-soft underline underline-offset-4 hover:text-danger"
                    >
                      Take it back
                    </button>
                  </Form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {bookings.length === 0 && requests.length === 0 ? (
        <div className="mt-8 rounded-card border border-border bg-card p-8 text-center">
          <p className="text-ink-soft">No trips yet.</p>
          <Link to="/guides" className="mt-3 inline-block font-medium text-primary">
            Find your guide →
          </Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {bookings.map((b) => (
            <li key={b.id}>
              <Link
                to={`/trips/${b.id}`}
                prefetch="intent"
                className="flex gap-3 rounded-card border border-border bg-card p-3 hover:shadow-card"
              >
                <SmartImage
                  src={b.offering?.cover_photo_url ?? ""}
                  alt={b.offering?.title ?? ""}
                  width={96}
                  height={96}

                  className="h-20 w-20 shrink-0 rounded-lg"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-medium text-ink">
                      {b.offering?.title}
                    </p>
                    <Badge tone={TONE[b.status] ?? "neutral"}>
                      {statusLabel(b.status)}
                    </Badge>
                  </div>
                  <p className="text-sm text-ink-soft">
                    {firstName(b.guide?.users?.full_name)}
                  </p>
                  <p className="text-sm text-ink-soft">
                    {fmtDateRange(b.start_date, b.end_date)}
                  </p>
                  {/* An accepted booking holds the guide's calendar for 24
                      hours and then lets it go. That deadline was only ever
                      visible inside the booking, which is one click too far
                      from the list somebody actually opens. */}
                  {b.status === "pending_deposit" && (
                    <p className="mt-0.5 text-sm font-medium text-primary">
                      Pay the deposit to keep these dates
                      {b.hold_expires_at ? ` — held until ${fmtDate(b.hold_expires_at)}` : ""}
                    </p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
