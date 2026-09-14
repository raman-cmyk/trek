import { Link } from "react-router";
import type { Route } from "./+types/cancellation";
import { BRAND } from "~/lib/brand";
import {
  alwaysRefundedRows,
  depositFacts,
  refundRows,
} from "~/lib/policy-copy";

/**
 * What happens if you cannot come.
 *
 * A trekker in Berlin sending money to a stranger in Nepal has one question
 * underneath all the others, and this is it. The policy existed — as a refund
 * matrix in code — and was invisible to anybody deciding whether to book.
 *
 * Every number on this page is produced by running the real refund engine, so
 * the page cannot promise 50% while the code pays 25%. That kind of drift is
 * worse than publishing nothing: it is a promise broken on the day it matters
 * most.
 */
export function meta() {
  return [
    { title: `Cancellations and deposits · ${BRAND}` },
    {
      name: "description",
      content:
        "What you get back if you cancel, what your guide is paid, and how the deposit works. The same rules the system applies.",
    },
  ];
}

export function loader() {
  return { rows: refundRows(), always: alwaysRefundedRows(), deposit: depositFacts() };
}

export default function Cancellation({ loaderData }: Route.ComponentProps) {
  const { rows, always, deposit } = loaderData;

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-display text-3xl text-ink">Cancellations and deposits</h1>
      <p className="mt-2 text-ink-soft">
        The rules below are the ones the system actually applies. They are not
        a summary of something longer.
      </p>

      <section id="deposit" className="mt-10 scroll-mt-20">
        <h2 className="font-display text-xl text-ink">Book with a deposit</h2>
        <p className="mt-2 text-ink">
          You pay <strong>{deposit.depositPct}%</strong> to hold your dates.
          The rest is due <strong>{deposit.balanceDaysBefore} days</strong>{" "}
          before you leave, on the card you used.
        </p>
        <ul className="mt-3 space-y-2 text-ink-soft">
          <li>
            Nothing is charged while you are still talking to a guide. The
            deposit is asked for once you have both agreed the trip.
          </li>
          <li>
            Booking inside {deposit.fullPaymentWindowDays} days of departure is
            paid in full at once — there is no time left for a balance.
          </li>
          <li>
            If the balance is not paid by{" "}
            {deposit.autoCancelDaysBefore} days before departure the booking is
            cancelled, under the same refund rules as any other cancellation.
            We would rather tell you that now than surprise you with it.
          </li>
        </ul>
      </section>

      <section id="refunds" className="mt-10 scroll-mt-20">
        <h2 className="font-display text-xl text-ink">If you cancel</h2>
        <p className="mt-2 text-ink-soft">
          Counted from the day your trip starts. The percentage is of what you
          have paid so far.
        </p>
        <div className="mt-4 overflow-hidden rounded-card border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-mist/60 text-ink-soft">
              <tr>
                <th className="px-4 py-2.5 font-medium">When</th>
                <th className="px-4 py-2.5 font-medium">You get</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.when}>
                  <td className="px-4 py-3 text-ink">{r.when}</td>
                  <td className="px-4 py-3">
                    <span className="text-ink">{r.youGet}</span>
                    {r.guideGets && (
                      <span className="mt-0.5 block text-caption text-muted">
                        {r.guideGets}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Said plainly rather than buried: it is the part people find unfair
            when it is sprung on them, and reasonable when it is explained. */}
        <p className="mt-3 text-sm text-ink-soft">
          Your guide is paid a share close to departure because by then they
          have turned other work down. That money goes to them, not to us.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl text-ink">When it is not your doing</h2>
        <div className="mt-4 divide-y divide-line rounded-card border border-line">
          {always.map((r) => (
            <div key={r.when} className="px-4 py-3">
              <p className="text-ink">{r.when}</p>
              <p className="mt-0.5 text-sm text-ink-soft">{r.youGet}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-ink-soft">
          A guide who cancels on you also answers for it with us. That is the
          point of booking a named person through a platform rather than a
          stranger over WhatsApp.
        </p>
      </section>

      <p className="mt-10 text-sm text-ink-soft">
        Something here not fitting your situation?{" "}
        <Link to="/trust" className="text-moss underline underline-offset-4">
          How we handle money and trust
        </Link>{" "}
        has the rest, and a real person reads what you send us.
      </p>
    </main>
  );
}
