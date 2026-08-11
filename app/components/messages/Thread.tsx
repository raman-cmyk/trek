import { useEffect, useRef, useState } from "react";
import { Form, Link } from "react-router";
import { SmartImage } from "~/components/SmartImage";
import { TierBadge } from "~/components/public/bits";
import { Composer } from "./Composer";
import { cn } from "~/lib/cn";

export interface ThreadMessage {
  id: string;
  mine: boolean;
  text: string;
  at: string;
  /** Server-side read receipt; only meaningful on your own messages. */
  readAt?: string | null;
}

export interface ThreadPartner {
  name: string;
  slug?: string | null;
  avatarUrl?: string | null;
  tier?: number | null;
  district?: string | null;
  responseMins?: number | null;
  lastSeenAt?: string | null;
  onlyWithMe?: string | null;
  dayRateLabel?: string | null;
  offerings?: { slug: string; kind: string; title: string; days: number }[];
}

export interface ThreadBooking {
  id: string;
  title: string;
  startDate: string;
  endDate?: string | null;
  partySize: number;
  statusLabel: string;
  href: string;
}

/** Traveller-side openers. Deliberately the four things people actually ask. */
const STARTERS = [
  "Am I fit enough for this?",
  "What are the dates you're free?",
  "What's included in the price?",
  "What happens if I get altitude sickness?",
];

export function Thread({
  messages,
  partner,
  booking,
  backTo,
  bookHref,
  isGuide,
  cannedReplies,
  action,
  masked = true,
}: {
  messages: ThreadMessage[];
  partner: ThreadPartner;
  booking?: ThreadBooking | null;
  backTo: string;
  bookHref?: string | null;
  isGuide: boolean;
  cannedReplies?: { id: string; label: string; body: string }[];
  action?: string;
  /** False once the deposit is paid and contact details flow freely. */
  masked?: boolean;
}) {
  const [prefill, setPrefill] = useState<string | null>(null);
  // Optimistic tail: what you just sent, before the server has answered.
  const [pending, setPending] = useState<{ id: string; text: string }[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  // Server rows arriving clears anything optimistic they now cover.
  useEffect(() => {
    setPending((p) => p.slice(messages.length ? 0 : p.length));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);
  useEffect(() => {
    if (pending.length) setPending([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, pending.length]);

  const empty = messages.length === 0 && pending.length === 0;

  return (
    // Three rows: header / scrollable log / composer. min-h-0 on the middle row
    // is what actually makes the log scroll instead of the page.
    <div className="grid h-full min-h-0 grid-rows-[auto_1fr_auto] bg-paper">
      <ThreadHeader partner={partner} backTo={backTo} bookHref={bookHref} isGuide={isGuide} />

      <div className="min-h-0 overflow-y-auto px-3 py-4 sm:px-4">
        {booking && <BookingBanner booking={booking} />}

        {empty ? (
          <EmptyThread
            partner={partner}
            isGuide={isGuide}
            onPick={(t) => setPrefill(t)}
          />
        ) : (
          <ul className="mx-auto flex max-w-2xl flex-col gap-2">
            {messages.map((m, i) => (
              <Bubble key={m.id} m={m} showStatus={m.mine && i === lastMineIndex(messages)} />
            ))}
            {pending.map((p) => (
              <Bubble
                key={p.id}
                m={{ id: p.id, mine: true, text: p.text, at: "" }}
                pendingLabel="sending…"
                showStatus
              />
            ))}
          </ul>
        )}
        <div ref={endRef} />
      </div>

      <Composer
        action={action}
        masked={masked}
        prefill={prefill}
        onPrefillConsumed={() => setPrefill(null)}
        cannedReplies={isGuide ? cannedReplies : undefined}
        placeholder={
          isGuide ? "Reply to " + partner.name.split(" ")[0] + "…" : "Ask " + partner.name.split(" ")[0] + " anything…"
        }
        onOptimistic={(text) =>
          setPending((p) => [...p, { id: "tmp-" + p.length + "-" + text.length, text }])
        }
      />
    </div>
  );
}

function lastMineIndex(messages: ThreadMessage[]) {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].mine) return i;
  return -1;
}

function ThreadHeader({
  partner,
  backTo,
  bookHref,
  isGuide,
}: {
  partner: ThreadPartner;
  backTo: string;
  bookHref?: string | null;
  isGuide: boolean;
}) {
  const inner = (
    <>
      <SmartImage
        src={partner.avatarUrl ?? ""}
        alt=""
        width={44}
        height={44}
        className="h-10 w-10 shrink-0 rounded-full"
      />
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="truncate font-medium text-ink">{partner.name}</span>
          {partner.tier ? <TierBadge tier={partner.tier} static /> : null}
        </span>
        {/* District + tier, not "Trekking in Nepal" — that told you nothing. */}
        <span className="block truncate text-caption text-muted">
          {[partner.district, presence(partner.lastSeenAt)].filter(Boolean).join(" · ")}
        </span>
      </span>
    </>
  );

  return (
    <header className="flex items-center gap-3 border-b border-line bg-card px-3 py-2.5 sm:px-4">
      <Link
        to={backTo}
        aria-label="Back to messages"
        className="-ml-1 rounded p-1.5 text-muted hover:bg-mist hover:text-ink lg:hidden"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 19l-7-7 7-7" />
        </svg>
      </Link>

      {partner.slug ? (
        <Link to={`/guides/${partner.slug}`} className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-80">
          {inner}
        </Link>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-3">{inner}</span>
      )}

      {partner.responseMins ? (
        <span className="hidden shrink-0 font-mono text-caption text-muted sm:inline">
          replies in ~{fmtMins(partner.responseMins)}
        </span>
      ) : null}

      {/* Secondary, not a second green primary — messaging is the model. */}
      {!isGuide && bookHref && (
        <Link
          to={bookHref}
          className="shrink-0 rounded border border-line px-3 py-1.5 text-sm font-medium text-ink hover:border-sage hover:bg-mist"
        >
          Request to book
        </Link>
      )}
    </header>
  );
}

/** "active now" only inside a short window — a stale green dot is a lie. */
function presence(lastSeenAt?: string | null): string {
  if (!lastSeenAt) return "";
  const mins = Math.round((Date.now() - Date.parse(lastSeenAt)) / 60000);
  if (!Number.isFinite(mins) || mins < 0) return "";
  if (mins < 3) return "active now";
  if (mins < 60) return `active ${mins}m ago`;
  if (mins < 60 * 24) return `active ${Math.round(mins / 60)}h ago`;
  const d = Math.round(mins / (60 * 24));
  return d === 1 ? "active yesterday" : `active ${d}d ago`;
}

function fmtMins(mins: number) {
  return mins < 60 ? `${mins} min` : `${Math.round(mins / 60)} hour${Math.round(mins / 60) > 1 ? "s" : ""}`;
}

function Bubble({
  m,
  pendingLabel,
  showStatus,
}: {
  m: ThreadMessage;
  pendingLabel?: string;
  showStatus?: boolean;
}) {
  const isPhoto = /^https?:\/\/\S+\.(jpe?g|png|webp)(\?|$)/i.test(m.text.trim());
  return (
    <li className={cn("flex flex-col", m.mine ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2 text-body leading-relaxed sm:max-w-[75%]",
          m.mine
            ? "rounded-br-sm bg-moss text-white"
            : "rounded-bl-sm border border-line bg-card text-ink",
          pendingLabel && "opacity-70",
        )}
      >
        {isPhoto ? (
          <img
            src={m.text.trim()}
            alt="Shared photo"
            className="max-h-72 rounded-lg"
            loading="lazy"
          />
        ) : (
          <p className="whitespace-pre-wrap break-words">{m.text}</p>
        )}
      </div>
      <span className="mt-0.5 px-1 font-mono text-[10px] text-muted">
        {pendingLabel ? (
          pendingLabel
        ) : (
          <>
            <time dateTime={m.at} suppressHydrationWarning>
              {new Date(m.at).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </time>
            {showStatus && m.mine && (m.readAt ? " · read" : " · sent")}
          </>
        )}
      </span>
    </li>
  );
}

function BookingBanner({ booking }: { booking: ThreadBooking }) {
  return (
    <Link
      to={booking.href}
      className="mx-auto mb-4 flex max-w-2xl items-center justify-between gap-3 rounded-lg border border-line bg-mist px-3.5 py-2.5 hover:border-sage"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-ink">{booking.title}</span>
        <span className="block font-mono text-caption text-muted">
          {fmtDay(booking.startDate)}
          {booking.endDate ? ` – ${fmtDay(booking.endDate)}` : ""} · {booking.partySize}{" "}
          {booking.partySize === 1 ? "person" : "people"}
        </span>
      </span>
      <span className="shrink-0 rounded-pill bg-paper px-2.5 py-1 text-caption text-ink">
        {booking.statusLabel}
      </span>
    </Link>
  );
}

function fmtDay(iso: string) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * The empty thread. Was one grey sentence in a void; now it keeps the person
 * you are deciding about on screen and gives you four ways in — because the
 * hard part of messaging a stranger is the first line, not the input box.
 */
function EmptyThread({
  partner,
  isGuide,
  onPick,
}: {
  partner: ThreadPartner;
  isGuide: boolean;
  onPick: (t: string) => void;
}) {
  const first = partner.name.split(" ")[0];
  return (
    <div className="mx-auto max-w-2xl">
      {!isGuide && (
        <section className="rounded-lg border border-line bg-card p-4">
          <div className="flex gap-3.5">
            <SmartImage
              src={partner.avatarUrl ?? ""}
              alt={partner.name}
              width={128}
              height={160}
              className="h-24 w-[4.5rem] shrink-0 rounded-md"
            />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2">
                {partner.slug ? (
                  <Link to={`/guides/${partner.slug}`} className="font-medium text-ink hover:underline">
                    {partner.name}
                  </Link>
                ) : (
                  <span className="font-medium text-ink">{partner.name}</span>
                )}
                {partner.tier ? <TierBadge tier={partner.tier} static /> : null}
              </p>
              {partner.onlyWithMe && (
                <p className="mt-1.5 border-l-2 border-chartreuse pl-2.5 font-display text-sm leading-snug text-ink">
                  {partner.onlyWithMe}
                </p>
              )}
              <p className="mt-2 font-mono text-caption text-muted">
                {[partner.district, partner.dayRateLabel].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>

          {partner.offerings && partner.offerings.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-line pt-3">
              {partner.offerings.slice(0, 3).map((o) => (
                <li key={o.slug}>
                  <Link
                    to={`/${o.kind === "trek" ? "treks" : "experiences"}/${o.slug}`}
                    className="flex items-baseline justify-between gap-3 text-sm text-ink hover:text-moss"
                  >
                    <span className="truncate">{o.title}</span>
                    <span className="shrink-0 font-mono text-caption text-muted">
                      {o.days}d
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <p className="mt-6 text-sm text-muted">
        {isGuide
          ? `${first} hasn't written yet. Say hello — you answer faster than most, and it shows on your profile.`
          : `Messaging is free and ${first} answers himself. Not sure where to start?`}
      </p>

      {!isGuide && (
        <div className="mt-3 flex flex-wrap gap-2">
          {STARTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onPick(s)}
              className="rounded-pill border border-line bg-card px-3.5 py-2 text-sm text-ink transition-colors hover:border-sage hover:bg-mist"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
