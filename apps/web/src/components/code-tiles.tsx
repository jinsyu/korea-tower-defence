import type { CSSProperties } from "react";
import type { RecoveryCode } from "@ktd/core";

// Five code tiles side by side (mockup .cd-tile). Long words shrink so a 3-syllable word fits a 360px phone.
export const fitTileText = (n: number): CSSProperties => ({
  fontSize: `min(var(--tile-max), calc((100cqw - 24px) / 5 / ${n + 0.5}))`,
});

export function CodeTiles({ code }: { code: RecoveryCode }) {
  const tiles = [...code.words.map((text, i) => ({ label: `낱말 ${i + 1}`, text })), { label: "숫자", text: code.digits }];
  return (
    <ol aria-label="복구 코드" className="@container grid grid-cols-5 gap-1.5 [--tile-max:clamp(20px,5.4vw,52px)]">
      {tiles.map((t) => (
        <li
          key={t.label}
          className="grid min-h-18 min-w-0 place-items-center content-center bg-white font-heading whitespace-nowrap text-navy [clip-path:polygon(6px_0,100%_0,calc(100%-6px)_100%,0_100%)] last:bg-yellow wide:min-h-30"
        >
          <small className="font-sans text-[11px] font-black text-[#4a5a80]">{t.label}</small>
          <span style={fitTileText(t.text.length)}>{t.text}</span>
        </li>
      ))}
    </ol>
  );
}
