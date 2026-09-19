import { useEffect, useRef, useState } from "react";
import { Button } from "~/components/Button";
import { cardStepProblem, payErrorMessage } from "~/lib/card-payment";

/**
 * The card field — the half of checkout that was never built.
 *
 * Sits inside the existing `<Form method="post">` and deliberately does not
 * replace it. The form keeps every hidden input it had, and when the card
 * clears, this asks the form to submit itself exactly as the button used to.
 * So the server action is unchanged in what it receives, and it still re-reads
 * the intent from Stripe before it fulfils anything: the browser saying "paid"
 * is a claim, not a fact, and money should never move on a claim.
 *
 * Stripe.js is imported inside an effect, the same way the maps are, because
 * it touches `window` and these pages render on the server first.
 *
 * Mobile-first per CLAUDE.md §6: the Payment Element is one column, the button
 * stays full width, and nothing here needs a second tap that a 360px screen
 * would hide below the fold.
 */
export function CardPayment({
  publishableKey,
  clientSecret,
  isMock,
  label,
  disabled,
}: {
  publishableKey: string | null;
  clientSecret: string | null;
  isMock: boolean;
  /** What the button says, including the amount. */
  label: string;
  disabled?: boolean;
}) {
  const mount = useRef<HTMLDivElement | null>(null);
  const stripeRef = useRef<any>(null);
  const elementsRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problem = cardStepProblem({ isMock, publishableKey, clientSecret });

  useEffect(() => {
    if (problem || !mount.current) return;
    let cancelled = false;

    (async () => {
      try {
        const { loadStripe } = await import("@stripe/stripe-js");
        const stripe = await loadStripe(publishableKey!);
        if (cancelled || !stripe || !mount.current) return;

        const elements = stripe.elements({
          clientSecret: clientSecret!,
          appearance: {
            theme: "stripe",
            variables: {
              // Close enough to the design system that the field does not read
              // as a third-party box dropped into the page.
              fontFamily: "Inter, system-ui, sans-serif",
              borderRadius: "10px",
              colorDanger: "#b3261e",
            },
          },
        });
        const payment = elements.create("payment", { layout: "tabs" });
        payment.mount(mount.current);

        stripeRef.current = stripe;
        elementsRef.current = elements;
        payment.on("ready", () => {
          if (!cancelled) setReady(true);
        });
      } catch {
        if (!cancelled) {
          setError(
            "The card form could not be loaded. Check your connection and reload — nobody has been billed.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // The intent is what this is mounted against; a new one needs a new field.
  }, [problem, publishableKey, clientSecret]);

  if (problem) {
    return (
      <p className="mb-2 rounded-button border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        {problem}
      </p>
    );
  }

  async function pay(e: React.MouseEvent<HTMLButtonElement>) {
    const form = e.currentTarget.closest("form");
    const stripe = stripeRef.current;
    const elements = elementsRef.current;
    if (!stripe || !elements || !form) return;

    setBusy(true);
    setError(null);
    // `if_required` keeps a plain card on this page and still allows the 3-D
    // Secure step, which opens over it and resolves back here. Without it
    // Stripe insists on a return_url and every payment leaves the site.
    const { error: err } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });
    if (err) {
      setBusy(false);
      setError(payErrorMessage(err));
      return;
    }
    // Paid. Hand it to the server, which will confirm it with Stripe itself
    // before it books anything. `busy` stays on: the navigation follows.
    form.requestSubmit();
  }

  return (
    <div className="mt-2">
      <div ref={mount} />
      {!ready && (
        <p className="py-3 text-center text-sm text-ink-soft">Loading the card form…</p>
      )}
      {error && (
        <p role="alert" className="mt-2 rounded-button bg-ember/10 px-3 py-2 text-sm text-ember">
          {error}
        </p>
      )}
      <Button
        type="button"
        size="lg"
        onClick={pay}
        loading={busy}
        loadingText="Paying…"
        disabled={disabled || !ready}
        className="mt-3 w-full"
      >
        {label}
      </Button>
    </div>
  );
}
