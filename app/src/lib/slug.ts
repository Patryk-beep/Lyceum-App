/** TS mirror of the Rust `service::slugify` (lowercase ASCII alnum; runs of any
 *  other chars collapse to a single `-`; trim leading/trailing `-`). The wizard
 *  needs the slug BEFORE `create_subject` returns, to subscribe its run. Kept in
 *  parity by `slug.test.ts`; a mismatch only stalls the stepper (never data). */
export function slugify(subject: string): string {
  let out = "";
  let prevDash = false;
  for (const c of subject) {
    if (/[a-zA-Z0-9]/.test(c)) {
      out += c.toLowerCase();
      prevDash = false;
    } else if (out.length > 0 && !prevDash) {
      out += "-";
      prevDash = true;
    }
  }
  return out.replace(/^-+/, "").replace(/-+$/, "");
}
