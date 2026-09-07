import { useEffect, useRef } from "react";
import { Link, useFetcher } from "react-router";
import { SmartImage } from "~/components/SmartImage";
import { Composer } from "./Composer";
import { MessageBody } from "./MessageBody";
import { TripPipeline } from "~/components/TripPipeline";
import { cn } from "~/lib/cn";

export interface GroupThreadMessage {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  mine: boolean;
  /** The guide's lines are marked — in a room of friends that matters. */
  fromGuide: boolean;
  system: boolean;
  text: string;
  at: string;
}

/**
 * A trip group's chat, inside the inbox.
 *
 * The group page has the same conversation next to the roster and the money,
 * and it should — that is the planning room. But a conversation you can only
 * reach by remembering a group URL is a conversation people miss, so it lives
 * here too, in the place they already check for messages.
 *
 * Unlike a guide thread this has many voices, so every line is attributed and
 * consecutive lines from one person collapse into a run.
 */
export function GroupThread({
  group,
  messages,
  people,
  canPost,
  isGuide,
  muted,
}: {
  group: {
    id: string;
    slug: string;
    name: string;
    partyLabel: string;
    kind: string | null;
    groupStatus: string;
    bookingStatus: string | null;
    coverUrl: string | null;
  };
  messages: GroupThreadMessage[];
  people: number;
  canPost: boolean;
  isGuide: boolean;
  /** Emails about this trip are off for this person. */
  muted: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_1fr_auto] bg-paper">
      <header className="flex items-center gap-3 border-b border-line bg-card px-3 py-2.5 sm:px-4">
        <Link
          to="/messages"
          aria-label="Back to messages"
          className="-ml-1 rounded-full p-1.5 text-muted hover:bg-mist hover:text-ink lg:hidden"
        >
          <BackIcon />
        </Link>
        <SmartImage
          src={group.coverUrl ?? ""}
          alt=""
          width={40}
          height={40}
          className="h-9 w-9 shrink-0 rounded-full"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-ink">{group.name}</p>
          <p className="truncate text-caption text-muted">
            {people} {people === 1 ? "person" : "people"} · {group.partyLabel}
          </p>
        </div>
        <MuteToggle muted={muted} />
        <Link
          to={`/groups/${group.slug}`}
          className="shrink-0 rounded-pill border border-line px-3 py-1.5 text-caption text-ink hover:border-sage"
        >
          Trip page
        </Link>
      </header>

      <div className="min-h-0 overflow-y-auto px-3 py-4 sm:px-4">
        <div className="mx-auto max-w-2xl">
          {/* Where the trip is. The chat is where people ask "so what now?" —
              this answers it without anybody having to. */}
          <div className="mb-4 rounded-card border border-line bg-card p-3">
            <p className="label text-muted">Where this trip is</p>
            <TripPipeline
              className="mt-2"
              kind={group.kind}
              groupStatus={group.groupStatus}
              bookingStatus={group.bookingStatus}
            />
          </div>

          {messages.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              Nothing said yet. Somebody has to go first.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {messages.map((m, i) => {
                if (m.system) {
                  return (
                    <li key={m.id} className="py-1 text-center text-caption text-muted">
                      {m.text}
                    </li>
                  );
                }
                // A run: same person, still talking. Only the first line of a
                // run carries a face and a name.
                const prev = messages[i - 1];
                const runs = prev && !prev.system && prev.authorId === m.authorId;
                return (
                  <li
                    key={m.id}
                    className={cn("flex gap-2.5", m.mine && "flex-row-reverse", runs && "-mt-1")}
                  >
                    <span className="w-7 shrink-0">
                      {!runs && (
                        <SmartImage
                          src={m.authorAvatar ?? ""}
                          alt=""
                          width={28}
                          height={28}
                          className="h-7 w-7 rounded-full"
                        />
                      )}
                    </span>
                    <div className={cn("max-w-[80%] min-w-0", m.mine && "text-right")}>
                      {!runs && (
                        <p className="text-caption text-muted">
                          {m.mine ? "You" : m.authorName}
                          {m.fromGuide && !m.mine && (
                            <span className="ml-1 rounded-pill bg-mist px-1.5 py-px font-mono text-[10px] uppercase tracking-wide text-moss">
                              Guide
                            </span>
                          )}
                        </p>
                      )}
                      {/* A div, not a p: a message can carry a picture now,
                          and an <img> inside a <p> is markup a browser will
                          quietly rearrange. */}
                      <div
                        className={cn(
                          "mt-0.5 inline-block rounded-lg px-3 py-2 text-left text-[15px] leading-relaxed",
                          m.mine
                            ? "bg-pine text-paper"
                            : m.fromGuide
                              ? "bg-mist text-ink ring-1 ring-sage/40"
                              : "bg-mist text-ink",
                        )}
                      >
                        <MessageBody body={m.text} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div ref={endRef} />
        </div>
      </div>

      {canPost ? (
        <Composer
          placeholder={isGuide ? "Answer the group…" : "Message the group…"}
          // Nothing is masked here: this is a room the group already shares,
          // and the note about hidden phone numbers would simply be false.
          masked={false}
        />
      ) : (
        <p className="border-t border-line bg-card px-4 py-3 text-caption text-muted">
          You can read this trip, but only the people going can write in it.
        </p>
      )}
    </div>
  );
}

/**
 * Emails on or off for this trip, for you alone.
 *
 * A fetcher rather than a link: muting a group in the middle of reading it
 * should not move you off the message you were reading.
 */
function MuteToggle({ muted }: { muted: boolean }) {
  const fetcher = useFetcher();
  const busy = fetcher.state !== "idle";
  // Optimistic: the button says what you just asked for, not what the server
  // has confirmed.
  const next = fetcher.formData ? fetcher.formData.get("intent") === "mute" : muted;
  return (
    <fetcher.Form method="post" className="shrink-0">
      <input type="hidden" name="intent" value={next ? "unmute" : "mute"} />
      <button
        disabled={busy}
        title={next ? "Emails about this trip are off" : "Stop emailing me about this trip"}
        className="flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-caption text-muted hover:border-sage hover:text-ink disabled:opacity-60"
      >
        {next ? <MutedIcon /> : <BellIcon />}
        <span className="hidden sm:inline">{next ? "Muted" : "Mute"}</span>
      </button>
    </fetcher.Form>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6 8a4 4 0 018 0c0 3 1.2 4.2 1.7 4.7a.5.5 0 01-.35.85H4.65a.5.5 0 01-.35-.85C4.8 12.2 6 11 6 8z" strokeLinejoin="round" />
      <path d="M8.4 16a1.7 1.7 0 003.2 0" strokeLinecap="round" />
    </svg>
  );
}

function MutedIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6 8a4 4 0 018 0c0 3 1.2 4.2 1.7 4.7a.5.5 0 01-.35.85H4.65a.5.5 0 01-.35-.85C4.8 12.2 6 11 6 8z" strokeLinejoin="round" />
      <path d="M8.4 16a1.7 1.7 0 003.2 0" strokeLinecap="round" />
      <path d="M3.5 3.5l13 13" strokeLinecap="round" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M12 4l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
