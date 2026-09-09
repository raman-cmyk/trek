/**
 * The super admin: one person who can see every account and step into any of
 * them.
 *
 * Ops is a role in the database and there are several of them. This is
 * narrower than ops and deliberately not a column — a flag that ops can set
 * is a flag ops can set on themselves. The list lives in code, changes with a
 * deploy, and is short enough to read.
 */
export const SUPER_ADMIN_EMAILS = ["raman@greyemails.com"] as const;

export function isSuperAdmin(email: string | null | undefined): boolean {
  return !!email && SUPER_ADMIN_EMAILS.includes(email.trim().toLowerCase() as any);
}

/** One row on the logins page: the auth record and the app profile, joined. */
export interface Account {
  id: string;
  email: string | null;
  phone: string | null;
  name: string;
  role: "guide" | "trekker" | "ops" | "none";
  provider: string;
  confirmed: boolean;
  banned: boolean;
  created_at: string;
  last_sign_in_at: string | null;
}

/** What Supabase hands back for each auth user; only the fields we read. */
export interface AuthRecord {
  id: string;
  email?: string | null;
  phone?: string | null;
  created_at: string;
  last_sign_in_at?: string | null;
  email_confirmed_at?: string | null;
  phone_confirmed_at?: string | null;
  banned_until?: string | null;
  app_metadata?: { provider?: string; providers?: string[] };
}

export interface ProfileRecord {
  id: string;
  role: string | null;
  full_name: string | null;
}

/**
 * Every auth record, joined to its profile, newest sign-in first. A record
 * with no profile is still listed — it is exactly the kind of account
 * (signed up, never finished) the founder wants to be able to see.
 */
export function accountRows(auth: AuthRecord[], profiles: ProfileRecord[]): Account[] {
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const rows = auth.map((u): Account => {
    const p = byId.get(u.id);
    const role = p?.role;
    return {
      id: u.id,
      email: u.email ?? null,
      phone: u.phone ?? null,
      name: p?.full_name?.trim() || u.email?.split("@")[0] || u.phone || "—",
      role: role === "guide" || role === "trekker" || role === "ops" ? role : "none",
      provider: u.app_metadata?.providers?.join(", ") || u.app_metadata?.provider || "email",
      confirmed: !!(u.email_confirmed_at || u.phone_confirmed_at),
      banned: !!u.banned_until && new Date(u.banned_until).getTime() > Date.now(),
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
    };
  });
  return rows.sort((a, b) => {
    const at = a.last_sign_in_at ? Date.parse(a.last_sign_in_at) : -1;
    const bt = b.last_sign_in_at ? Date.parse(b.last_sign_in_at) : -1;
    return bt - at || Date.parse(b.created_at) - Date.parse(a.created_at);
  });
}

/** Name, email or phone containing the query. Empty query keeps everything. */
export function matchesAccount(a: Account, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return [a.name, a.email ?? "", a.phone ?? ""].some((v) => v.toLowerCase().includes(s));
}

/** "Never", "just now", "3h ago", "12 days ago" — relative, for a list. */
export function sinceLabel(iso: string | null, now = Date.now()): string {
  if (!iso) return "Never";
  const mins = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (mins < 2) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 45) return `${days} ${days === 1 ? "day" : "days"} ago`;
  const months = Math.round(days / 30);
  return `${months} ${months === 1 ? "month" : "months"} ago`;
}

/** Where a person of this role signs in — the page to open with their email. */
export function loginPathFor(role: Account["role"], email: string | null): string {
  const base = role === "guide" ? "/g/login" : role === "ops" ? "/ops/login" : "/login";
  return email ? `${base}?email=${encodeURIComponent(email)}` : base;
}

/** Where a person of this role lands once they are in. */
export function homePathFor(role: string | null | undefined): string {
  return role === "guide" ? "/g" : role === "ops" ? "/ops" : "/";
}

// Readable on a phone screen, typeable from one: three words and a number,
// no ambiguous glyphs. ~2^40 combinations, and it is set once and shown once.
const WORDS = [
  "yak", "gompa", "ridge", "khola", "lodge", "pass", "juniper", "prayer", "stupa",
  "glacier", "monsoon", "rhododendron", "cairn", "trail", "dawn", "summit", "valley",
  "bridge", "dal", "bhat", "chai", "porter", "snow", "moraine", "lake", "mani",
  "kharka", "himal", "tea", "stone", "cloud", "wind",
];

export function newPassword(rand: () => number = Math.random): string {
  const pick = () => WORDS[Math.floor(rand() * WORDS.length)];
  const n = 1000 + Math.floor(rand() * 9000);
  return `${pick()}-${pick()}-${pick()}-${n}`;
}
