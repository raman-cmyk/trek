import { Link } from "react-router";
import { cn } from "~/lib/cn";
import type { TrailStop } from "~/lib/trail";
import { Eyebrow } from "./Eyebrow";
import { FactStrip, type Fact } from "./FactStrip";
import { TrailScene } from "./TrailScene";

export interface AuthScene {
  photo: string;
  alt: string;
  title: string;
  eyebrow: string;
  stops: TrailStop[];
  facts: Fact[];
  /** Where the picture leads, for the one link on it. */
  to?: string;
}

/**
 * The sign-in card (docs/07, from reference 2 — "voyger"): one white card
 * with the form on the left and a trail on the right, over a softened
 * photograph of the mountains.
 *
 * Every sign-in page used to be a form floating in cream with nothing around
 * it — the one screen a returning trekker sees most, and the one that looked
 * least like the place they were coming back to. The trail on the right is a
 * real route with its real day stops; it changes nothing about the form.
 *
 * On a phone the picture is a short band above the form rather than beside
 * it, so the first field is still on the first screen.
 */
export function AuthSplit({
  scene,
  children,
  wide = false,
  className,
}: {
  scene: AuthScene;
  children: React.ReactNode;
  /** A longer form (an application) wants the width; the picture narrows. */
  wide?: boolean;
  className?: string;
}) {
  return (
    <main className={cn("relative isolate flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-8 sm:py-14", className)}>
      {/* The mountains behind the card: the same photo, blurred and tinted
          pine, so the card reads as the sharp thing. */}
      <div aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden">
        <img src={scene.photo} alt="" className="h-full w-full scale-110 object-cover blur-2xl" loading="eager" />
        <div className="absolute inset-0 bg-pine/55" />
      </div>

      <div
        className={cn(
          "grid w-full overflow-hidden rounded-[28px] bg-card shadow-lift",
          wide ? "max-w-6xl md:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]" : "max-w-5xl md:grid-cols-2",
        )}
      >
        <div className="order-2 flex flex-col justify-center px-6 py-8 sm:px-10 sm:py-12 md:order-1">
          {children}
        </div>

        <div className="order-1 md:order-2 md:p-3">
          <TrailScene
            photo={scene.photo}
            alt={scene.alt}
            stops={scene.stops}
            pins={3}
            eager
            height="aspect-[16/7] md:aspect-auto md:h-full md:min-h-[560px]"
            className="rounded-none md:rounded-[20px]"
          >
            <div className="absolute inset-x-0 bottom-0 hidden p-5 md:block">
              <Eyebrow tone="chartreuse">{scene.eyebrow}</Eyebrow>
              <p className="mt-1 font-display text-2xl text-paper">
                {scene.to ? (
                  <Link to={scene.to} className="hover:underline">
                    {scene.title}
                  </Link>
                ) : (
                  scene.title
                )}
              </p>
              <div className="mt-2">
                <FactStrip onPhoto facts={scene.facts} />
              </div>
            </div>
          </TrailScene>
        </div>
      </div>
    </main>
  );
}
