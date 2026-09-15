import { groupBriefing, type BriefingSection } from "~/lib/route-briefing";

/**
 * Before you go, as a briefing rather than a filing cabinet.
 *
 * What this replaced: twelve identical accordion rows, each with an icon
 * chosen from whatever the design system had spare — a tick for insurance and
 * again for money, a spark for rescue and again for food and again for
 * charging — so the icons carried no meaning, every row looked the same, and
 * eight thousand characters of route-specific answers sat behind twelve clicks
 * nobody makes. On a page whose whole claim is that it gives honest answers,
 * hiding them was the wrong instinct.
 *
 * So: the answers are open, grouped by when they matter — before you leave, on
 * the trail, the people with you, if it goes wrong — and the group heading does
 * the work the icons were failing to do. The reader gets a briefing sheet they
 * can skim or read, the way a guide would actually talk them through it.
 *
 * Nothing here imports the design system, so it drops into either branch.
 */
export function RouteBriefing({
  sections,
  maxAltitudeM,
}: {
  sections: BriefingSection[];
  /** The through-line of the whole section: these answers are for this height. */
  maxAltitudeM?: number | null;
}) {
  const groups = groupBriefing(sections);
  if (groups.length === 0) return null;

  return (
    <section className="mt-14">
      <p className="text-caption uppercase tracking-[0.08em] text-muted">Before you go</p>
      <h2 className="mt-2 max-w-[24ch] font-display text-3xl text-ink">
        {sections.length} honest answers
        {maxAltitudeM ? (
          <>
            , for a walk to{" "}
            <span className="font-mono tabular-nums">
              {maxAltitudeM.toLocaleString("en-US")}m
            </span>
          </>
        ) : (
          ", for this route"
        )}
        .
      </h2>
      <p className="mt-3 max-w-[62ch] text-ink-soft">
        Nothing here is hidden behind a click. Ask your guide anything that is
        not answered — they reply on their own profile, in public, with their
        name on it.
      </p>

      {/* One column per moment on a wide screen, stacked below. A moment is a
          run of answers under a shared heading, not a card: a border and a
          radius on each of twelve blocks is what made the old version read as
          twelve of the same thing. */}
      <div className="mt-8 grid gap-x-12 gap-y-10 lg:grid-cols-2">
        {groups.map((g) => (
          <div key={g.moment.key} className="min-w-0">
            {/* The heading is the anchor — a rule above it, the way a printed
                briefing separates its parts. */}
            <div className="border-t-2 border-ink pt-3">
              <h3 className="font-display text-xl text-ink">{g.moment.label}</h3>
              <p className="mt-0.5 text-sm text-muted">{g.moment.blurb}</p>
            </div>

            <div className="mt-5 space-y-6">
              {g.sections.map((s) => (
                <div key={s.id} className="min-w-0">
                  <h4 className="text-[15px] font-medium text-ink">{s.title}</h4>
                  {s.body.map((p, i) => (
                    <p key={i} className="mt-1.5 max-w-[58ch] text-sm leading-relaxed text-ink-soft">
                      {p}
                    </p>
                  ))}
                  {s.bullets && s.bullets.length > 0 && (
                    <ul className="mt-2.5 space-y-1.5">
                      {s.bullets.map((b, i) => (
                        <li key={i} className="flex gap-2.5 text-sm text-ink-soft">
                          {/* A hairline, not a bullet. Twelve lists of round
                              dots is a lot of dots. */}
                          <span
                            aria-hidden
                            className="mt-[0.62rem] h-px w-3 shrink-0 bg-sage"
                          />
                          <span className="min-w-0">{b}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
