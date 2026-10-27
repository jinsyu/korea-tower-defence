/**
 * A fraction written stacked (분수 세로꼴): numerator over a rule over the denominator. `w` is the whole part of a
 * mixed number, written before it at the surrounding size; the two stay one unit so a flex gap never splits them.
 * Sizes come from `.fr` in globals.css (20px or more on the problem panel) or from `className`.
 * Decorative; callers give the spoken form.
 */
export function Fraction({ n, d, w, className = "" }: { n: number; d: number; w?: number; className?: string }) {
  const stacked = (
    <span className={`fr ${className}`}>
      <span>{n}</span>
      <span>{d}</span>
    </span>
  );
  if (w === undefined) return stacked;
  return (
    <span className="whitespace-nowrap">
      {w}
      {stacked}
    </span>
  );
}
