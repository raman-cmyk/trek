import { useState } from "react";
import { MAX_SKILLS, SKILL_GROUPS } from "~/lib/guide-skills";

/**
 * What a guide is interesting for, as chips.
 *
 * There are thirty-nine of these now. As a column of checkboxes that is a
 * scroll of a screen and a half on a 360px phone, and a guide gives up before
 * the group that describes them. So: chips that wrap, a box to narrow them
 * when you already know the word you are looking for, and a live count,
 * because the cap is the one rule here and finding out about it by having a
 * tick refused is a bad way to learn it.
 *
 * The chips are `has-[:checked]:` on a visually hidden checkbox, the same
 * pattern as the regions picker — the whole thing renders on the server and
 * submits with no JavaScript. Search and the count are the only parts that
 * need it, and without them every chip is simply visible, which is the state
 * this replaced.
 */
export function GuideSkills({
  name = "skill",
  selected,
}: {
  name?: string;
  selected?: readonly string[];
}) {
  const [chosen, setChosen] = useState<string[]>(() => [...(selected ?? [])]);
  const [q, setQ] = useState("");

  const needle = q.trim().toLowerCase();
  const full = chosen.length >= MAX_SKILLS;

  const groups = SKILL_GROUPS.map((g) => ({
    ...g,
    // A chosen chip never hides: it is the one you most need to be able to
    // untick, and losing it behind a search term looks like the tick was lost.
    skills: g.skills.filter(
      (s) =>
        !needle ||
        chosen.includes(s.key) ||
        s.label.toLowerCase().includes(needle) ||
        g.label.toLowerCase().includes(needle),
    ),
  })).filter((g) => g.skills.length > 0);

  // The checkbox owns its own tick — `defaultChecked`, not `checked` — so the
  // ticks still work on a phone whose JavaScript never arrives. State here only
  // mirrors it, for the count and the cap.
  const toggle = (key: string, on: boolean) =>
    setChosen((prev) => (on ? [...new Set([...prev, key])] : prev.filter((k) => k !== key)));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search — birds, camera, families…"
          aria-label="Search what you are good at"
          className="min-w-0 flex-1 basis-40 rounded-button border border-border bg-card px-3 py-2 text-base text-ink outline-none focus:border-primary"
        />
        <p
          className={`shrink-0 text-sm ${full ? "font-medium text-primary" : "text-ink-soft"}`}
          aria-live="polite"
        >
          {chosen.length} of {MAX_SKILLS} chosen
        </p>
      </div>

      {full && (
        <p className="-mt-1 text-xs text-ink-soft">
          That is the limit. Untick one to put another in its place — eight
          honest ones beat twenty hopeful.
        </p>
      )}

      {groups.map((group) => (
        <fieldset key={group.key}>
          <legend className="text-xs font-medium uppercase tracking-wide text-ink-soft">
            {group.label}
          </legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {group.skills.map((sk) => {
              const on = chosen.includes(sk.key);
              // Full and not ticked: still shown, still readable, just not
              // takeable. Hiding them would make the list jump about.
              const locked = full && !on;
              return (
                <label
                  key={sk.key}
                  className={`select-none rounded-full border px-3 py-1.5 text-sm ${
                    on
                      ? "cursor-pointer border-primary bg-mist font-medium text-primary"
                      : locked
                        ? "cursor-not-allowed border-border bg-paper text-ink-soft/50"
                        : "cursor-pointer border-border bg-paper text-ink"
                  }`}
                >
                  <input
                    type="checkbox"
                    name={name}
                    value={sk.key}
                    defaultChecked={on}
                    disabled={locked}
                    onChange={(e) => toggle(sk.key, e.currentTarget.checked)}
                    className="sr-only"
                  />
                  {sk.label}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}

      {groups.length === 0 && (
        <p className="text-sm text-ink-soft">Nothing matches “{q.trim()}”.</p>
      )}
    </div>
  );
}
