import { Button } from "@/components/ui/button";
import { SITE_DESCRIPTION, pageMetadata } from "@/lib/site";

export const metadata = pageMetadata({ description: SITE_DESCRIPTION, path: "/" });

const broadcastButton =
  "min-h-13 rounded-none px-6 font-heading text-xl [clip-path:polygon(10px_0,100%_0,calc(100%-10px)_100%,0_100%)]";

// Empty frame of mockup B's home screen; the buttons get wired up in T3 (start) and T5 (restore).
export default function Home() {
  return (
    <main className="grid flex-1 place-items-center bg-[radial-gradient(ellipse_at_70%_40%,rgb(27_63_134/0.6),transparent_60%)] px-4 py-5">
      <div className="grid w-full max-w-[1100px] min-w-0 justify-items-start gap-3.5">
        <h1 className="font-heading text-[clamp(40px,7vw,96px)] leading-none">
          전국 지킴이
          <br />
          <em className="text-yellow not-italic">생중계</em>
        </h1>
        <div className="flex flex-wrap gap-2.5">
          <Button className={`${broadcastButton} bg-yellow text-navy hover:bg-yellow/90`}>
            처음 하기
          </Button>
          <Button className={`${broadcastButton} bg-white text-navy hover:bg-white/90`}>
            복구 코드로 이어 하기
          </Button>
        </div>
      </div>
    </main>
  );
}
