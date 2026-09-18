import { Form, Link, NavLink, Outlet, data } from "react-router";
import type { Route } from "./+types/g";
import { cn } from "~/lib/cn";
import { checkinIsDue, needsClosing, trekDay } from "~/lib/checkin";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { countUnread } from "~/lib/unread.server";
import { badgeLabel } from "~/lib/inapp";
import { supportLink } from "~/lib/handover";

export function meta() {
  return [{ title: "Guide dashboard" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, profile, admin, headers } = await requireUser(request, env, "guide");
  // The unread count used to run after this batch rather than inside it,
  // which put a whole extra round trip on the critical path of every page in
  // the guide area. It depends on nothing above it.
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: guide }, { count: enquiryCount }, { unreadTotal }, { data: running }, { count: news }] =
    await Promise.all([
    admin.from("guides").select("status, slug").eq("user_id", user.id).single(),
    admin
      .from("enquiries")
      .select("id", { count: "exact", head: true })
      .eq("guide_id", user.id)
      .eq("status", "open"),
    countUnread(admin, user.id),
    // A trek on the trail today, so the tab can say there is an update owed.
    admin
      .from("bookings")
      .select("id, status, start_date, end_date")
      .eq("guide_id", user.id)
      .eq("status", "active"),
    // The bell. Guides get told things too — a booking cancelled, a listing
    // paused, a payout sent — and until now the only channel for any of it
    // was an email the platform could not send.
    admin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null),
  ]);

  // One number: treks needing today's safety update, plus finished ones
  // nobody has closed. Both are things only this guide can clear.
  let checkinDue = 0;
  const live = running ?? [];
  if (live.length) {
    const { data: sentToday } = await admin
      .from("checkins")
      .select("booking_id")
      .in("booking_id", live.map((b: any) => b.id))
      .eq("day", today);
    const sent = new Set((sentToday ?? []).map((c: any) => c.booking_id));
    for (const b of live) {
      const w = trekDay(b.start_date, b.end_date, today);
      if (checkinIsDue(w, sent.has(b.id)) || needsClosing(w, b.status)) checkinDue++;
    }
  }
  return data(
    {
      name: profile.full_name,
      status: guide?.status ?? "applied",
      enquiryCount: enquiryCount ?? 0,
      unreadTotal,
      checkinDue,
      news: news ?? 0,
      // A way to reach a person, on every screen. Composed on the server so
      // the number never reaches a browser that is not signed in as a guide.
      support: supportLink(env.SUPPORT_WHATSAPP, { name: profile.full_name }),
    },
    { headers },
  );
}

// The sign-out action used to live here, and nothing could reach it: a
// pathless layout is never the target of a form post. It is /g/logout now.

/**
 * Five tabs is the 360px ceiling — Earnings lives as a quick link on Home.
 *
 * The bar used to appear only once a guide was verified, which meant a guide
 * who had just applied had no navigation at all: the one screen they could
 * reach told them to list their trips, and there was no way to get to the
 * page that lists them. Waiting on us is not the same as having nothing to
 * do — an unverified guide can build everything, and publishing is gated by
 * ops anyway, so the bar is now always there. Requests and Calendar are
 * simply empty until the first booking, which reads as "nothing yet" rather
 * than as a locked door.
 *
 * Each carries an icon as well as a word. A row of five words in the same
 * weight and size is not a tab bar; it is a sentence you have to read every
 * time, and at a glance nothing tells you where you are. The icon is what
 * makes a tab findable by shape, which is how a bar like this is actually
 * used — thumb first, eyes second.
 */
const TABS = [
  { to: "/g", label: "Home", end: true, badge: 0, icon: IconHome },
  { to: "/g/enquiries", label: "Requests", badge: "enquiryCount" as const, icon: IconInbox },
  { to: "/g/messages", label: "Messages", badge: "unreadTotal" as const, icon: IconChat },
  { to: "/g/experiences", label: "Experiences", badge: 0, icon: IconBoot },
  { to: "/g/calendar", label: "Calendar", badge: 0, icon: IconCalendar },
  { to: "/g/checkin", label: "Safety", badge: "checkinDue" as const, icon: IconShield },
];

/** WhatsApp's mark, drawn rather than fetched — no third-party asset. */
function IconWhatsApp() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.87 9.87 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2Zm0 18.02h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.17 8.17 0 0 1-1.26-4.35c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.83 2.41a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.2-8.24 8.2Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.15.16-.29.18-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.71-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.87.85-.87 2.07 0 1.22.89 2.4 1.02 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.23-.16-.48-.28Z" />
    </svg>
  );
}

export default function GuideLayout({ loaderData }: Route.ComponentProps) {
  const { enquiryCount, unreadTotal, checkinDue, news, support } = loaderData;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-surface">
      <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <span className="font-display text-lg">Guides of Nepal</span>
        <div className="flex items-center gap-3">
          <Link
            to="/notifications"
            aria-label={news ? `Notifications, ${news} new` : "Notifications"}
            className="relative rounded-full p-1.5 text-ink-soft hover:bg-mist hover:text-ink"
          >
            <IconBell />
            {!!news && (
              <span className="absolute -right-0.5 -top-0.5 min-w-[1rem] rounded-full bg-ember px-1 text-center text-[10px] font-medium leading-4 text-white">
                {badgeLabel(news)}
              </span>
            )}
          </Link>
          {/* A guide at 4am before a Lukla flight does not want a form. The
              number is configured, so if nobody has set one this is not drawn
              at all — a help button that opens nothing is worse than none. */}
          {support && (
            <a
              href={support}
              target="_blank"
              rel="noreferrer"
              aria-label="Message the office on WhatsApp"
              title="Message the office on WhatsApp"
              className="rounded-full p-1.5 text-ink-soft hover:bg-mist hover:text-ink"
            >
              <IconWhatsApp />
            </a>
          )}
          {/* Explicit action: a Form with none posts to whichever page is on
              screen, which was a 405 on some tabs and a silent no-op on others. */}
          <Form method="post" action="/g/logout">
            <button className="text-xs text-primary">Sign out</button>
          </Form>
        </div>
      </header>

      <div className="flex-1 p-4 pb-24">
        <Outlet />
      </div>

      <nav
        className="glass fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-md border-t border-line"
        // The home-indicator strip on an iPhone sits over the bottom of the
        // screen; without this the last row of a tab bar is under it.
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {TABS.map((t) => {
          const badge =
            t.badge === "enquiryCount"
              ? enquiryCount
              : t.badge === "unreadTotal"
                ? unreadTotal
                : t.badge === "checkinDue"
                  ? checkinDue
                  : 0;
          const Icon = t.icon;
          return (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              prefetch="intent"
              className={({ isActive }) =>
                cn(
                  "group relative flex flex-1 flex-col items-center gap-1 pb-2 pt-2.5 text-[11px] transition-colors",
                  isActive ? "text-moss" : "text-muted hover:text-ink",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      "relative grid h-7 w-12 place-items-center rounded-full transition-colors",
                      isActive && "bg-mist",
                    )}
                  >
                    <Icon active={isActive} />
                    {badge > 0 && (
                      <span
                        aria-label={`${badge} waiting`}
                        className="absolute -right-0.5 -top-0.5 min-w-[16px] rounded-full bg-ember px-1 text-center font-mono text-[10px] leading-4 text-white ring-2 ring-paper"
                      >
                        {badge > 9 ? "9+" : badge}
                      </span>
                    )}
                  </span>
                  <span className={cn(isActive && "font-medium")}>{t.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}


/* ── Tab icons ──────────────────────────────────────────────────────────────
   Drawn here rather than pulled from a set: five glyphs is not worth a
   dependency, and "Trips" wants a boot, which no icon library ships. Stroke
   only, 1.6px, filled softly when active so the change reads at a glance. */

type IconProps = { active?: boolean };
const S = (active?: boolean) => ({
  fill: "none",
  stroke: "currentColor",
  strokeWidth: active ? 1.9 : 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

function IconHome({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" {...S(active)}>
      <path d="M3.5 8.6L10 3.5l6.5 5.1V16a.9.9 0 0 1-.9.9h-3.3v-4.4H7.7v4.4H4.4a.9.9 0 0 1-.9-.9z" />
    </svg>
  );
}

function IconInbox({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" {...S(active)}>
      <path d="M3 11.5 5.2 4.4A1 1 0 0 1 6.1 3.7h7.8a1 1 0 0 1 .95.7L17 11.5" />
      <path d="M3 11.5h3.4l.9 1.9h5.4l.9-1.9H17v3.8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
    </svg>
  );
}

function IconChat({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" {...S(active)}>
      <path d="M17 10.2c0 3-3.1 5.4-7 5.4a8.6 8.6 0 0 1-2.2-.27L4 16.5l1.1-2.6A5 5 0 0 1 3 10.2C3 7.3 6.1 4.8 10 4.8s7 2.5 7 5.4Z" />
    </svg>
  );
}

/** Trips: a boot. Nothing else on the bar says "you are walking somewhere". */
function IconBoot({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" {...S(active)}>
      <path d="M6.4 3.2h2.4v6.1l4.6 2.2a2.6 2.6 0 0 1 1.5 2.3v1.4a.8.8 0 0 1-.8.8H5.3a.8.8 0 0 1-.8-.8V4a.8.8 0 0 1 .8-.8Z" />
      <path d="M4.5 13.4h10.4" />
    </svg>
  );
}

function IconShield({ active }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.5 5.5 6v5.5c0 4 2.8 7.3 6.5 8.5 3.7-1.2 6.5-4.5 6.5-8.5V6L12 3.5Z" />
      <path d="m9.2 12 2 2 3.6-3.8" />
    </svg>
  );
}

function IconCalendar({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" {...S(active)}>
      <rect x="3.2" y="4.8" width="13.6" height="12" rx="1.6" />
      <path d="M3.2 8.4h13.6M7 3.2v3M13 3.2v3" />
    </svg>
  );
}

function IconBell() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 3a4.5 4.5 0 0 0-4.5 4.5c0 3-1.2 4.2-1.7 4.7a.5.5 0 0 0 .35.85h11.7a.5.5 0 0 0 .35-.85c-.5-.5-1.7-1.7-1.7-4.7A4.5 4.5 0 0 0 10 3Z" />
      <path d="M8.3 16a1.9 1.9 0 0 0 3.4 0" />
    </svg>
  );
}
