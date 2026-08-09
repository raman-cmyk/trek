import { useFetcher } from "react-router";
import { cn } from "~/lib/cn";

/**
 * The daily check-in button (docs/04): one giant tap, usable with gloves at
 * altitude (min 64px). Full wiring (SMS path, missed-checkin alerts) is M8;
 * here it records an app check-in and shows the reassuring success moment.
 */
export function CheckinButton({
  bookingId,
  dayNumber,
  alreadyToday,
}: {
  bookingId: string;
  dayNumber: number;
  alreadyToday: boolean;
}) {
  const fetcher = useFetcher();
  const done =
    alreadyToday || fetcher.data?.ok || fetcher.state !== "idle";

  return (
    <fetcher.Form method="post" className="w-full">
      <input type="hidden" name="intent" value="checkin" />
      <input type="hidden" name="booking_id" value={bookingId} />
      <button
        type="submit"
        disabled={done}
        className={cn(
          "flex min-h-[96px] w-full flex-col items-center justify-center rounded-card text-center transition-colors duration-base",
          done
            ? "bg-accent text-white"
            : "bg-primary text-white active:scale-[0.99]",
        )}
      >
        {done ? (
          <>
            <span className="text-2xl">✓</span>
            <span className="mt-1 font-medium">
              You’re checked in — see you tomorrow
            </span>
          </>
        ) : (
          <span className="text-xl font-medium">I’m safe — Day {dayNumber}</span>
        )}
      </button>
    </fetcher.Form>
  );
}
