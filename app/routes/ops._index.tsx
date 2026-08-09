import { redirect } from "react-router";

// /ops → the verification queue (the first thing ops works, docs/01 F1).
export function loader() {
  return redirect("/ops/verifications");
}
