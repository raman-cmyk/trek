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
 * The eye is off by default, because the commonest place a password is typed
 * is in public.
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
            "w-full rounded-button border border-border bg-card px-3 py-2 pr-11 text-ink outline-none focus:border-primary",
            className,
          )}
        />
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          // Not a label change on the same control: a screen reader should
          // hear what the button does, and the state is announced separately.
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-ink-soft hover:text-ink"
        >
          {shown ? <IconEyeOff /> : <IconEye />}
        </button>
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
    button: (
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-ink-soft hover:text-ink"
      >
        {shown ? <IconEyeOff /> : <IconEye />}
      </button>
    ),
  };
}

function IconEye() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  );
}

function IconEyeOff() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M2 12s3.6-6.5 10-6.5c1.7 0 3.2.5 4.5 1.1M22 12s-3.6 6.5-10 6.5c-1.7 0-3.2-.5-4.5-1.1" />
      <path d="M9.6 9.6a3 3 0 0 0 4.2 4.2" />
      <path d="m3 3 18 18" />
    </svg>
  );
}
