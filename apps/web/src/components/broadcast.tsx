import type { ReactNode } from "react";

// Slanted broadcast-graphics button from mockup B (.btn). Shared by links and buttons.
export const broadcastButton =
  "inline-flex min-h-13 items-center justify-center px-[22px] font-heading text-xl whitespace-nowrap text-navy transition-[filter] duration-100 [clip-path:polygon(10px_0,100%_0,calc(100%-10px)_100%,0_100%)] active:brightness-85 focus-visible:outline-3 focus-visible:-outline-offset-[6px] focus-visible:outline-navy";

/** Red LIVE-style tag plus a white caption (mockup .bug-tag). */
export function BugTag({ live, children }: { live: ReactNode; children: ReactNode }) {
  return (
    <div className="flex max-w-full min-w-0 items-stretch text-sm">
      <span className="inline-flex items-center gap-1.5 bg-red px-2.5 py-0.5 font-heading tracking-[0.5px] whitespace-nowrap text-white before:size-2 before:animate-blink before:rounded-full before:bg-white before:content-['']">
        {live}
      </span>
      <span className="min-w-0 truncate bg-white px-2.5 py-0.5 font-black text-navy">{children}</span>
    </div>
  );
}
