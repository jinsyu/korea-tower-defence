// OKLCH three-tone cel shading (spec "그리기 규칙"): shadow L-0.12, C×0.9, h-15°; light L+0.10, h+10°.

export type Tones = { b: string; s: string; h: string; d: string };
type Oklch = [number, number, number];

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

export function hexToOklch(hex: string): Oklch {
  const n = parseInt(hex.slice(1), 16);
  const r = toLinear(((n >> 16) & 255) / 255);
  const g = toLinear(((n >> 8) & 255) / 255);
  const b = toLinear((n & 255) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), (Math.atan2(B, A) * 180) / Math.PI];
}

export function oklchToHex([L, C, H]: Oklch): string {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return (
    "#" +
    rgb
      .map((c) =>
        Math.round(clamp(toSrgb(clamp(c, 0, 1)), 0, 1) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

const cache = new Map<string, Tones>();

/** Base, shadow, highlight and dark tones. minL lifts dark colours so the body reads on the navy board. */
export function tones(hex: string, minL = 0): Tones {
  const key = hex + minL;
  const hit = cache.get(key);
  if (hit) return hit;
  const [L, C, H] = hexToOklch(hex);
  const L0 = Math.max(L, minL);
  const t = {
    b: oklchToHex([L0, C, H]),
    s: oklchToHex([clamp(L0 - 0.12, 0, 1), C * 0.9, H - 15]),
    h: oklchToHex([clamp(L0 + 0.1, 0, 1), C, H + 10]),
    d: oklchToHex([clamp(L0 - 0.24, 0, 1), C * 0.8, H - 20]),
  };
  cache.set(key, t);
  return t;
}
