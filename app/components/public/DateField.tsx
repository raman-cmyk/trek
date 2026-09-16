import { useState } from "react";
import { cn } from "~/lib/cn";

/**
 * A date field that is empty rather than shouting "dd/mm/yyyy".
 *
 * Chrome prints the format inside an empty `<input type="date">`, in the same
 * grey as a placeholder, which next to a real label reads as broken
 * scaffolding — "Setting off: dd/mm/yyyy". Pratik flagged it, and he is right
 * that it looks unfinished; every one of these sits under its own label, so
 * the format hint is redundant as well as ugly.
 *
 * What it is NOT is a custom date picker. A guide on an Android phone and a
 * trekker on an iPhone both get a far better calendar from their own
 * operating system than anything we would ship, and it costs nothing to
 * download. So the native input stays and only its empty state is hidden —
 * until it is focused or has a value, at which point the real editor is
 * exactly what you want to see.
 *
 * `data-empty` is set on the server from the initial value and kept up to
 * date on input, because a stale attribute would hide a date the visitor had
 * actually chosen.
 */
export function DateField({
  id,
  name,
  defaultValue,
  min,
  max,
  className,
  placeholder = "Any date",
  required,
  onChange,
}: {
  id?: string;
  name: string;
  defaultValue?: string;
  min?: string;
  max?: string;
  className?: string;
  /** Shown in place of dd/mm/yyyy while the field is empty and unfocused. */
  placeholder?: string;
  required?: boolean;
  onChange?: (v: string) => void;
}) {
  const [empty, setEmpty] = useState(!defaultValue);

  return (
    <span className="relative block">
      <input
        id={id}
        name={name}
        type="date"
        defaultValue={defaultValue}
        min={min}
        max={max}
        required={required}
        data-empty={empty ? "true" : undefined}
        onInput={(e) => {
          const v = (e.target as HTMLInputElement).value;
          setEmpty(!v);
          onChange?.(v);
        }}
        className={cn("date-quiet", className)}
      />
      {/* Sits behind the input, so a tap still opens the native calendar. */}
      {empty && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted/70"
        >
          {placeholder}
        </span>
      )}
    </span>
  );
}
