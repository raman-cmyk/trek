import { createContext, useContext, useEffect, useState } from "react";
import { type CurrencyCode, money, toMinor, fmtMinor } from "~/lib/currency";

interface CurrencyCtx {
  code: CurrencyCode;
  setCode: (c: CurrencyCode) => void;
  /** Convert + format a USD-cent amount in the active display currency. */
  m: (usdCents: number) => string;
  toMinor: (usdCents: number) => number;
  fmtMinor: (minor: number) => string;
}

const Ctx = createContext<CurrencyCtx | null>(null);
const STORAGE_KEY = "trek_currency";

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  // Default USD on both server and first client render (no hydration mismatch);
  // adopt the stored choice after mount.
  const [code, setCodeState] = useState<CurrencyCode>("USD");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as CurrencyCode | null;
    if (saved && saved !== code) setCodeState(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setCode = (c: CurrencyCode) => {
    setCodeState(c);
    try {
      localStorage.setItem(STORAGE_KEY, c);
    } catch {
      /* private mode */
    }
  };

  const value: CurrencyCtx = {
    code,
    setCode,
    m: (usdCents) => money(usdCents, code),
    toMinor: (usdCents) => toMinor(usdCents, code),
    fmtMinor: (minor) => fmtMinor(minor, code),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Money formatter bound to the active display currency. Falls back to USD if
 *  used outside the provider (e.g. ops screens) so it never crashes. */
export function useMoney(): CurrencyCtx {
  return (
    useContext(Ctx) ?? {
      code: "USD",
      setCode: () => {},
      m: (c) => money(c, "USD"),
      toMinor: (c) => toMinor(c, "USD"),
      fmtMinor: (mn) => fmtMinor(mn, "USD"),
    }
  );
}
