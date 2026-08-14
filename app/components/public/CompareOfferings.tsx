import { Link } from "react-router";
import { useMoney } from "~/lib/currency-context";
import { SmartImage } from "~/components/SmartImage";
import {
  offeringFromUsdCents,
  offeringPath,
  type PublicOffering,
} from "~/components/public/cards";

/**
 * Everything one guide sells, side by side — the compare-packages table.
 *
 * A rail of cards makes a reader thumb back and forth holding numbers in their
 * head. A table puts the numbers in a column so the comparison happens with
 * the eye instead of the memory, which is why every marketplace that sells
 * more than one thing per seller ends up with this block.
 *
 * Where we part company with the marketplaces: their columns are tiers of one
 * product, so a feature either is or is not in each tier and a grid of ticks
 * tells the truth. A guide's offerings are different products — a momo crawl
 * and a fourteen-day walk to Base Camp — so a tick grid would be almost all
 * blanks and would imply the momo crawl is the stingy tier. Each column
 * therefore carries its own inclusions, as a list.
 *
 * Below two offerings there is nothing to compare, so the caller keeps cards.
 */
export function CompareOfferings({
  offerings,
  first,
}: {
  offerings: PublicOffering[];
  first: string;
}) {
  const { mr } = useMoney();

  return (
    <section className="mt-12">
      <h2 className="font-display text-2xl text-ink">
        Everything {first} runs
      </h2>
      <p className="mt-1 text-[15px] text-ink-soft">
        {offerings.length} trips, side by side. Every price is per person.
      </p>

      {/* Scrolls sideways on a phone with the labels pinned, which is how a
          table survives 360px without becoming a stack of repeated headings. */}
      <div className="no-scrollbar mt-5 overflow-x-auto rounded-md border border-line bg-card">
        {/* Fixed layout, or the widest title steals width and the cover
            photos come out three different sizes. */}
        <table className="w-full min-w-[560px] table-fixed border-collapse text-left align-top">
          <colgroup>
            <col className="w-[104px]" />
            {offerings.map((o) => (
              <col key={o.id} style={{ width: `${(100 - 14) / offerings.length}%` }} />
            ))}
          </colgroup>
          <caption className="sr-only">
            {first}&rsquo;s trips compared by length, group size, what is
            included and price per person.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 w-[104px] bg-card p-3" />
              {offerings.map((o) => (
                <th
                  key={o.id}
                  scope="col"
                  className="border-l border-line p-3 font-normal"
                >
                  <Link to={offeringPath(o)} prefetch="intent" className="group block">
                    <SmartImage
                      src={o.cover_photo_url ?? ""}
                      alt={o.title}
                      width={320}
                      height={214}
                      cover
                      className="aspect-[3/2] w-full rounded-sm"
                    />
                    <span className="mt-2 block text-[15px] font-medium leading-snug text-ink group-hover:text-moss">
                      {o.title}
                    </span>
                  </Link>
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="text-[14px]">
            <Row label="Price" offerings={offerings}>
              {(o) => {
                const from = offeringFromUsdCents(o);
                return from ? (
                  <>
                    <span className="font-display text-xl text-ink">{mr(from)}</span>
                    <span className="block text-caption text-muted">per person</span>
                  </>
                ) : (
                  <span className="text-muted">Ask {first}</span>
                );
              }}
            </Row>

            <Row label="How long" offerings={offerings}>
              {(o) =>
                o.kind === "trek" ? (
                  <>
                    <span className="font-mono text-ink">{o.days}</span> days
                  </>
                ) : (
                  <>One day</>
                )
              }
            </Row>

            {/* A trek's answer is its route; a day out has no route, so it
                answers with where you meet — which is the same question a
                reader is actually asking. */}
            <Row label="Where" offerings={offerings}>
              {(o) =>
                o.route_slug ? (
                  <Link
                    to={`/routes/${o.route_slug}`}
                    prefetch="intent"
                    className="text-moss underline decoration-sage underline-offset-2 hover:decoration-moss"
                  >
                    {o.route_name}
                  </Link>
                ) : o.meeting_point ? (
                  <>{o.meeting_point}</>
                ) : (
                  <span className="text-muted">&mdash;</span>
                )
              }
            </Row>

            <Row label="Group size" offerings={offerings}>
              {(o) => (
                <>
                  Up to <span className="font-mono text-ink">{o.max_party ?? 8}</span>
                </>
              )}
            </Row>

            <Row label="Included" offerings={offerings}>
              {(o) =>
                o.included?.length ? (
                  <ul className="space-y-1">
                    {o.included.map((i) => (
                      <li key={i} className="flex gap-1.5">
                        <Tick />
                        <span>{i}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-muted">&mdash;</span>
                )
              }
            </Row>
          </tbody>

          <tfoot>
            <tr>
              <th scope="row" className="sticky left-0 z-10 bg-card p-3" />
              {offerings.map((o) => (
                <td key={o.id} className="border-l border-t border-line p-3">
                  <Link
                    to={offeringPath(o)}
                    prefetch="intent"
                    className="block rounded-sm bg-pine px-3 py-2 text-center text-[14px] font-medium text-paper transition-colors duration-instant hover:bg-moss"
                  >
                    {o.kind === "trek" ? "See the days" : "See the day"}
                  </Link>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

/** One labelled row, rendered per column by the child function. */
function Row({
  label,
  offerings,
  children,
}: {
  label: string;
  offerings: PublicOffering[];
  children: (o: PublicOffering) => React.ReactNode;
}) {
  return (
    <tr className="border-t border-line">
      <th
        scope="row"
        className="sticky left-0 z-10 bg-card p-3 text-caption font-medium uppercase tracking-wide text-muted"
      >
        {label}
      </th>
      {offerings.map((o) => (
        <td key={o.id} className="border-l border-line p-3 text-ink-soft">
          {children(o)}
        </td>
      ))}
    </tr>
  );
}

function Tick() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="mt-[3px] size-3.5 shrink-0 text-moss"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M3 8.5l3.5 3.5L13 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
