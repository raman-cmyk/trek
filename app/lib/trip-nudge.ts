import type { Readiness, ReadinessStep } from "~/lib/trip-readiness";

/**
 * The one thing a trekker has to do next, said to them.
 *
 * "After every pending step for the client during the booking process, the
 * client needs to get a notification as a reminder. So after the deposit is
 * paid, a notification saying 'document needed' needs to appear."
 *
 * The model already existed and nobody was ever told. `tripReadiness` has
 * computed the client's steps — pay, name everyone, passports, insurance —
 * since 0099, and it is rendered on exactly one screen: the office's booking
 * page. A trekker who paid a deposit got "Deposit received — you're booked"
 * with the words "Next: upload documents" buried in a sentence, and then
 * silence until the trek.
 *
 * One nudge at a time, not four. A bell that fires four times the moment a
 * deposit clears is a bell somebody turns off, and the steps are sequential
 * anyway: nothing can be verified before it is uploaded, and nothing is asked
 * for before the money moves. So this picks the first thing that is actually
 * theirs to do and says only that.
 *
 * Pure. The server half decides when to look; this decides what to say.
 */

export interface Nudge {
  /** Also the idempotency key, with the booking: one nudge per step, ever. */
  kind: string;
  title: string;
  body: string;
  href: string;
}

/**
 * What each client step sounds like when it is the thing standing in the way.
 *
 * Plain words and no jargon — the same bar the guide-facing screens are held
 * to, for the same reason: this reaches somebody in Berlin at their phone, not
 * an operator at a desk. `detail` comes from `tripReadiness` and already says
 * the specific number ("2 still to upload"), so the body does not repeat it.
 */
const SAY: Record<string, { title: string; body: (step: ReadinessStep) => string }> = {
  paid: {
    title: "Payment still to come",
    body: (s) => `${s.detail} Your dates are held until it is in.`,
  },
  roster: {
    title: "We need everyone's name",
    body: (s) => `${s.detail} The permit counter reads these names, so they have to match the passports.`,
  },
  passport: {
    title: "Passport needed",
    body: (s) => `${s.detail} A photo of the picture page is enough — one for each person going.`,
  },
  insurance: {
    title: "Insurance certificate needed",
    body: (s) =>
      `${s.detail} It has to cover trekking at altitude and helicopter evacuation.`,
  },
};

/** The steps this asks about, in the order they come up. */
export const NUDGEABLE = Object.keys(SAY);

/** Is this step one the trekker can act on right now? */
export function isClientTodo(step: ReadinessStep): boolean {
  return (
    step.owner === "client" &&
    (step.state === "open" || step.state === "overdue") &&
    step.key in SAY
  );
}

/**
 * The next thing to tell this trekker, or nothing.
 *
 * Nothing is the normal answer: a step that is done needs no bell, a blocked
 * step is not theirs yet, and a trip with nothing outstanding should be quiet.
 * An overdue step jumps the queue — it is the only one where the date has
 * already gone.
 */
export function nextNudge(readiness: Readiness, bookingId: string): Nudge | null {
  const todo = readiness.steps.filter(isClientTodo);
  if (todo.length === 0) return null;
  const step = todo.find((s) => s.state === "overdue") ?? todo[0];
  const say = SAY[step.key];
  return {
    kind: `todo_${step.key}`,
    title: step.state === "overdue" ? `${say.title} — overdue` : say.title,
    body: say.body(step),
    href: step.key === "paid" ? `/checkout/${bookingId}` : `/trips/${bookingId}`,
  };
}
