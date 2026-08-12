/**
 * Pronouns from the guides table, never guessed from a name.
 *
 * The profile copy used a hardcoded "he" — which read "He answers in his own
 * words" on Pasang Lhamu's page. The gender column has existed since 0029
 * (it powers the browse filter); this is the other thing it is for. Unset
 * falls back to they/them, which is never wrong the way a wrong guess is.
 */
export interface Pronouns {
  subject: string; // she / he / they
  object: string; // her / him / them
  possessive: string; // her / his / their
  /** "answers" vs "answer" — they conjugates as plural. */
  s: string;
}

export function pronounsFor(gender: string | null | undefined): Pronouns {
  if (gender === "female") return { subject: "she", object: "her", possessive: "her", s: "s" };
  if (gender === "male") return { subject: "he", object: "him", possessive: "his", s: "s" };
  return { subject: "they", object: "them", possessive: "their", s: "" };
}
