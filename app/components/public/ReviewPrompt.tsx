import { useEffect, useState } from "react";
import { useFetcher, useLocation, useNavigate } from "react-router";
import { Sheet } from "~/components/Sheet";
import { Button } from "~/components/Button";
import { promptLines, type FinishedTrip } from "~/lib/review-prompt";

/**
 * Asking for the review nobody was ever asked for.
 *
 * A guide is paid in money and in reputation, and the platform had no way of
 * collecting the second. The only nudge that existed was an email sent once
 * when a trip is marked complete, on a channel that has never delivered
 * anything — so the review form sat at the bottom of a page nobody had a
 * reason to scroll.
 *
 * Built on the same bones as `TripIntentDialog`: one `<Sheet>` (bottom sheet
 * on a phone, centred modal on a desktop, reduced motion honoured), a delay,
 * and a dismissal kept in localStorage. The differences are deliberate:
 *
 *  - it is for people who ARE signed in, which is the opposite audience;
 *  - `/trips` is a quiet page for the trip-intent popup and is the best page
 *    for this one, so the quiet list is nearly the mirror image;
 *  - dismissal is per trip rather than forever. Waving away the Langtang trip
 *    should not mean never being asked about Everest.
 */
const SEEN_KEY = "gon.review-ask.v1";
const DELAY_MS = 4000;

/** Pages where being interrupted would be rude, or where money is moving. */
const QUIET_PREFIXES = [
  "/checkout",
  "/pay",
  "/login",
  "/signup",
  "/g/",
  "/ops",
  "/apply",
  "/reset",
  "/forgot",
  "/suspended",
];

function dismissedTrips(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    // Private mode, blocked storage, or somebody else's JSON. Treating it as
    // "nothing dismissed" would ask again on every page of the visit, so an
    // unreadable list means do not ask at all.
    return [];
  }
}

export function ReviewPrompt({ signedIn }: { signedIn: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const fetcher = useFetcher<{ trip: FinishedTrip | null }>();
  const [open, setOpen] = useState(false);
  const [asked, setAsked] = useState(false);

  const quiet = QUIET_PREFIXES.some((p) => location.pathname.startsWith(p));
  // Already writing one. Asking somebody to do the thing they are doing is
  // the most irritating version of this feature.
  const onTheForm = location.hash === "#review";

  useEffect(() => {
    if (!signedIn || quiet || onTheForm || asked) return;
    let storageWorks = true;
    try {
      localStorage.getItem(SEEN_KEY);
    } catch {
      storageWorks = false;
    }
    // With no storage there is no way to remember a dismissal, and a popup
    // that cannot be dismissed is worse than no popup.
    if (!storageWorks) return;

    const t = setTimeout(() => {
      setAsked(true);
      const params = new URLSearchParams();
      for (const id of dismissedTrips()) params.append("skip", id);
      // Only now does the server get asked. Nobody who has waved every trip
      // away, and nobody on a quiet page, costs a query.
      fetcher.load(`/api/review-ask?${params.toString()}`);
    }, DELAY_MS);
    return () => clearTimeout(t);
    // fetcher is stable enough for this; re-running on its state would refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, quiet, onTheForm, asked]);

  const trip = fetcher.data?.trip ?? null;

  useEffect(() => {
    if (trip) setOpen(true);
  }, [trip]);

  const remember = (bookingId: string) => {
    try {
      const next = [...new Set([...dismissedTrips(), bookingId])].slice(-50);
      localStorage.setItem(SEEN_KEY, JSON.stringify(next));
    } catch {
      /* Worst case they are asked once more on another device. */
    }
  };

  const close = () => {
    if (trip) remember(trip.bookingId);
    setOpen(false);
  };

  if (!trip) return null;
  const { title, body } = promptLines(trip);

  return (
    <Sheet open={open} onClose={close} title={title}>
      <div className="space-y-4 p-5">
        <p className="text-sm text-ink-soft">{body}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              // Remembered either way: they have been asked, and the form
              // itself disappears once the review is in.
              remember(trip.bookingId);
              setOpen(false);
              navigate(`/trips/${trip.bookingId}#review`);
            }}
          >
            Write it now
          </Button>
          <Button variant="secondary" onClick={close}>
            Not this time
          </Button>
        </div>
        <p className="text-xs text-ink-soft">
          It takes about a minute, and you can add a photograph.
        </p>
      </div>
    </Sheet>
  );
}
