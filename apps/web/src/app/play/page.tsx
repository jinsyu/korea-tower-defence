import Link from "next/link";
import { BugTag, broadcastButton } from "@/components/broadcast";
import { pageMetadata } from "@/lib/site";

export const metadata = {
  ...pageMetadata({
    title: "우리 지역 중계",
    description:
      "우리 지역 방어판이 생중계되고, 아래에서 계산 문제가 끝없이 나오는 방어 화면이에요. 문제를 맞힐 때마다 내 타워가 자라고 지역 화력이 세져요.",
    path: "/play",
  }),
  robots: { index: false, follow: true },
};

// Placeholder where the defence screen lands in T6-T7; the first-entry flow and restore end here.
export default function PlayPage() {
  return (
    <main className="grid flex-1 place-items-center p-3.5">
      <div className="grid w-[min(900px,100%)] min-w-0 justify-items-start gap-3">
        <BugTag live="LIVE">중계 준비 중</BugTag>
        <h1 className="font-heading text-[clamp(28px,4.4vw,64px)] leading-[1.05]">방어 화면을 준비하고 있어요</h1>
        <p className="text-[clamp(15px,1.5vw,20px)] text-mut">우리 지역 방어판과 계산 문제가 곧 여기에 열려요.</p>
        <div className="flex flex-wrap gap-2.5">
          <Link href="/" className={`${broadcastButton} bg-white`}>
            첫 화면으로
          </Link>
          <Link href="/info" className={`${broadcastButton} bg-yellow`}>
            정보
          </Link>
        </div>
      </div>
    </main>
  );
}
