/**
 * Telling two guides apart in a list.
 *
 * The group-trip picker showed first names — "Pemba · Solukhumbu · $45/day" —
 * which is friendly and, in Nepal, not an identifier. Pemba, Mingma, Dawa and
 * Sonam are common given names, and a Sherpa surname is shared by a whole
 * region: two Pemba Sherpas from Solukhumbu is an ordinary thing, not an edge
 * case. Picking the wrong human is the one mistake this product cannot make.
 *
 * A surname is not the answer, because on the public site there is not one:
 * `public_guides` publishes first names on purpose and keeps the family name
 * on the private row. So a label is built from what a stranger is allowed to
 * know — where they are from, what they charge — and when two people would
 * still read the same it earns more, ending at their profile's own address,
 * which is public and unique by construction.
 *
 * Everyone in a colliding group gets the extra fact, not just the second one:
 * "Pemba" beside "Pemba · 12 years guiding" reads as though the first has no
 * experience at all.
 */

export interface LabelledGuide {
  id: string;
  /** Whatever name this surface is allowed to show — a first name in public. */
  name: string | null | undefined;
  district?: string | null;
  dayRateUsdCents?: number | null;
  yearsExperience?: number | null;
  /** Unique by construction — the last resort when nothing human separates them. */
  slug?: string | null;
}

/** The parts everyone gets, in the order a person reads them. */
function base(g: LabelledGuide, money: (cents: number) => string): string {
  const bits = [(g.name ?? "").trim() || "A guide"];
  if (g.district) bits.push(g.district);
  if (g.dayRateUsdCents) bits.push(`${money(g.dayRateUsdCents)}/day`);
  return bits.join(" · ");
}

function withYears(g: LabelledGuide, label: string): string {
  const y = g.yearsExperience ?? 0;
  if (y <= 0) return label;
  return `${label} · ${y} ${y === 1 ? "year" : "years"} guiding`;
}

/**
 * A label per guide, unique within this list.
 *
 * Escalates only where it has to: the whole name and where they are from for
 * everybody, then years guiding for a group that still collides, then their
 * profile's own address for the pair that somehow matches on all of it.
 */
export function labelGuides(
  guides: LabelledGuide[],
  money: (cents: number) => string,
): Map<string, string> {
  const out = new Map<string, string>();
  const byLabel = new Map<string, LabelledGuide[]>();

  for (const g of guides) {
    const label = base(g, money);
    byLabel.set(label, [...(byLabel.get(label) ?? []), g]);
  }

  for (const [label, group] of byLabel) {
    if (group.length === 1) {
      out.set(group[0].id, label);
      continue;
    }

    // Same name, same district, same rate. Years apart is the most human thing
    // left to say about them.
    const byYears = new Map<string, LabelledGuide[]>();
    for (const g of group) {
      const next = withYears(g, label);
      byYears.set(next, [...(byYears.get(next) ?? []), g]);
    }

    for (const [yearLabel, stillTogether] of byYears) {
      if (stillTogether.length === 1) {
        out.set(stillTogether[0].id, yearLabel);
        continue;
      }
      // Nothing human separates them. Their profile address does, and it is at
      // least a thing the office can look up.
      for (const g of stillTogether) {
        out.set(g.id, g.slug ? `${yearLabel} · /${g.slug}` : yearLabel);
      }
    }
  }

  return out;
}

/** Convenience for a list that is being rendered in order. */
export function labelledInOrder(
  guides: LabelledGuide[],
  money: (cents: number) => string,
): Array<{ id: string; label: string }> {
  const labels = labelGuides(guides, money);
  return guides.map((g) => ({ id: g.id, label: labels.get(g.id) ?? (g.name ?? "A guide") }));
}
