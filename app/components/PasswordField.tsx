import { useId, useState } from "react";
import { cn } from "~/lib/cn";

/**
 * A password box you can look at.
 *
 * Typing a password you cannot see is hard on a phone keyboard in any
 * language, and it is much harder in a second one — which is most of the
 * people signing in here. It is harder again when somebody has just read the
 * password to you over WhatsApp: the only way to know you typed it right was
 * to submit and find out.
 *
 * It is off by default, because the commonest place a password is typed is in
 * public.
 *
 * The control was an 18px grey eye at the right edge of the box, and the
 * founder's report on a phone was "client signin maa aaye naa show password"
 * — there is no show-password on the client sign-in. There was; he could not
 * see it. So it says the word now, in the colour every other control on the
 * site uses for "this does something". A word survives a small screen, a
 * cheap panel and a second language; a glyph the size of a full stop does
 * none of those.
 */
export function PasswordField({
  name,
  id,
  label,
  autoComplete = "current-password",
  required = true,
  minLength,
  defaultValue,
  placeholder,
  className,
  hint,
}: {
  name: string;
  id?: string;
  label?: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  defaultValue?: string;
  placeholder?: string;
  className?: string;
  hint?: React.ReactNode;
}) {
  const auto = useId();
  const fieldId = id ?? `pw-${auto}`;
  const [shown, setShown] = useState(false);

  return (
    <div>
      {label && (
        <label htmlFor={fieldId} className="mb-1 block text-sm text-ink-soft">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          id={fieldId}
          name={name}
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          defaultValue={defaultValue}
          placeholder={placeholder}
          className={cn(
            "w-full rounded-button border border-border bg-card px-3 py-2 pr-16 text-ink outline-none focus:border-primary",
            className,
          )}
        />
        <RevealButton shown={shown} onToggle={() => setShown((v) => !v)} />
      </div>
      {hint}
    </div>
  );
}

/**
 * The eye on its own, for the two forms that own their input already — the
 * application and the sign-up both keep the password in React state, and
 * wrapping them would mean a controlled/uncontrolled component that is two
 * things at once.
 */
export function useReveal() {
  const [shown, setShown] = useState(false);
  return {
    type: shown ? ("text" as const) : ("password" as const),
    button: <RevealButton shown={shown} onToggle={() => setShown((v) => !v)} />,
  };
}

/**
 * The word, not a glyph.
 *
 * `pr-16` on the input it sits in, so the last characters of a long password
 * do not run underneath it.
 */
function RevealButton({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      // The visible word already says what it does; `aria-pressed` carries the
      // state, so a screen reader is not told the same thing twice.
      aria-pressed={shown}
      className="absolute inset-y-0 right-0 flex items-center px-3 text-sm font-medium text-moss underline-offset-4 hover:underline"
    >
      {shown ? "Hide" : "Show"}
    </button>
  );
}
