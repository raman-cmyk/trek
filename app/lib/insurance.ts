/**
 * Insurance qualification (2026 rule): before a TIMS card or restricted-area
 * permit is issued, a trekker must show insurance covering **high-altitude
 * trekking** and **emergency helicopter evacuation**. Those two are the hard
 * gate; the rest are strongly recommended. Pure + unit-tested.
 */

export interface PolicyAnswers {
  altitude: boolean; // covers trekking to the trek's max altitude
  helicopter: boolean; // covers emergency heli evacuation / mountain rescue
  medical: boolean; // medical expenses (≥ recommended minimum)
  repatriation: boolean; // repatriation home
  datesCovered: boolean; // valid for the whole trip
}

export interface Requirement {
  key: keyof PolicyAnswers;
  label: string;
  hint: string;
  ok: boolean;
  required: boolean;
}

export interface PolicyVerdict {
  qualifies: boolean;
  requirements: Requirement[];
  missingRequired: string[];
}

/** Recommended minimum medical cover (USD). */
export const RECOMMENDED_MEDICAL_USD = 100_000;

/** Altitude the policy must cover — the trek's max, or a sensible default. */
export function altitudeThresholdM(maxAltitudeM?: number | null): number {
  return maxAltitudeM && maxAltitudeM > 0 ? maxAltitudeM : 4000;
}

export function evaluatePolicy(
  a: PolicyAnswers,
  opts: { maxAltitudeM?: number | null } = {},
): PolicyVerdict {
  const alt = altitudeThresholdM(opts.maxAltitudeM);
  const reqs: Requirement[] = [
    {
      key: "altitude",
      label: `High-altitude trekking (to ${alt.toLocaleString()}m)`,
      hint: "Many standard travel policies cap at 2,500–3,000m. Yours must reach your trek's altitude.",
      ok: a.altitude,
      required: true,
    },
    {
      key: "helicopter",
      label: "Emergency helicopter evacuation",
      hint: "Mountain rescue / heli-evac from remote altitude. This is the one people miss.",
      ok: a.helicopter,
      required: true,
    },
    {
      key: "medical",
      label: `Medical expenses (≥ $${RECOMMENDED_MEDICAL_USD.toLocaleString()})`,
      hint: "Treatment and hospitalisation abroad.",
      ok: a.medical,
      required: false,
    },
    {
      key: "repatriation",
      label: "Repatriation",
      hint: "Getting you home if needed.",
      ok: a.repatriation,
      required: false,
    },
    {
      key: "datesCovered",
      label: "Valid for your whole trip",
      hint: "Policy dates cover every day you're in Nepal.",
      ok: a.datesCovered,
      required: false,
    },
  ];
  const missingRequired = reqs.filter((r) => r.required && !r.ok).map((r) => r.label);
  return { qualifies: missingRequired.length === 0, requirements: reqs, missingRequired };
}
