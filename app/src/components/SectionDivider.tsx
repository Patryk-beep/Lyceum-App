/** Gilded section divider — gold gradient rules either side of an uppercase label.
 * Token-only (colour from `var(--gold)`), so it reads in every theme. */
export function SectionDivider({ label }: { label: string }) {
  return (
    <div className="section-divider" data-testid="section-divider">
      <span className="section-divider__rule" />
      <span className="section-divider__label">{label}</span>
      <span className="section-divider__rule section-divider__rule--r" />
    </div>
  );
}
