/** The Lyceum sigil — a laurel-ringed gilt monogram (inlined SVG). Colour comes
 * from `currentColor` (the `.sigil` rule sets it to `var(--gold)`), so it gilds
 * correctly in every theme. */
export function Sigil({ size = 120 }: { size?: number }) {
  const leaves = (sign: number) =>
    [73, 66, 59, 52].map((cy, i) => (
      <ellipse
        key={`${sign}-${i}`}
        cx={50 + sign * (15 - i * 1.5)}
        cy={cy}
        rx={2.7}
        ry={1.3}
        transform={`rotate(${sign * (52 - i * 13)} ${50 + sign * (15 - i * 1.5)} ${cy})`}
      />
    ));

  return (
    <span
      className="sigil"
      data-testid="sigil"
      style={{ width: size, height: size, display: "inline-block" }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100" width="100%" height="100%" fill="none">
        <circle cx="50" cy="50" r="48" stroke="currentColor" strokeWidth="0.5" opacity="0.55" />
        <circle cx="50" cy="50" r="34" stroke="currentColor" strokeWidth="0.9" />
        <circle cx="50" cy="50" r="31.5" stroke="currentColor" strokeWidth="0.4" opacity="0.5" />
        <g stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
          <path d="M50 82 C35 79 27 66 29 49" />
          <path d="M50 82 C65 79 73 66 71 49" />
        </g>
        <g fill="currentColor" opacity="0.85">
          {leaves(-1)}
          {leaves(1)}
        </g>
        <path d="M50 11 l1.9 3.7 4.1 .6 -3 2.9 .7 4.1 -3.7 -2 -3.7 2 .7 -4.1 -3 -2.9 4.1 -.6 z" fill="currentColor" />
        <text
          x="50"
          y="60"
          textAnchor="middle"
          fontFamily="var(--font-serif)"
          fontSize="34"
          fontWeight="600"
          fill="currentColor"
        >
          L
        </text>
      </svg>
    </span>
  );
}
