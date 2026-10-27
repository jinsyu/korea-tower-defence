// Korean big numbers (spec D61): 12,345 -> "1.2만", 345,000,000 -> "3.4억"; past 경, "1.2 × 10²⁰".
// Digits are cut, not rounded, so a number never reads bigger than it is (3.45억 -> "3.4억").
// The cutting is done on the exact integer (BigInt): float division would push values just under a unit over it.
// BigInt() calls instead of 10n literals: the web app compiles for ES2017.
const pow10 = (e: number): bigint => BigInt(10) ** BigInt(e);

const UNITS = [
  [pow10(16), "경"],
  [pow10(12), "조"],
  [pow10(8), "억"],
  [pow10(4), "만"],
] as const;
const PAST_GYEONG = pow10(20);
const TEN = BigInt(10);
const THOUSAND = BigInt(1000);

const SUPERSCRIPT = "⁰¹²³⁴⁵⁶⁷⁸⁹";

const withCommas = (digits: string): string => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** One decimal under 1,000 of a unit ("999.9만"), whole numbers above ("1,234만"). */
function inUnit(b: bigint, unit: bigint): string {
  const whole = b / unit;
  if (whole >= THOUSAND) return withCommas(String(whole));
  const tenth = ((b * TEN) / unit) % TEN;
  return tenth > BigInt(0) ? `${whole}.${tenth}` : String(whole);
}

function scientific(b: bigint): string {
  const digits = String(b);
  const sup = [...String(digits.length - 1)].map((d) => SUPERSCRIPT[Number(d)]).join("");
  const mantissa = digits[1] === "0" ? digits[0] : `${digits[0]}.${digits[1]}`;
  return `${mantissa} × 10${sup}`;
}

export function formatBig(n: number): string {
  // Every double from 2⁵³ up is a whole number, so BigInt(floor) is exact.
  const b = BigInt(Math.floor(n));
  if (b >= PAST_GYEONG) return scientific(b);
  const unit = UNITS.find(([u]) => b >= u);
  return unit ? `${inUnit(b, unit[0])}${unit[1]}` : withCommas(String(b));
}
