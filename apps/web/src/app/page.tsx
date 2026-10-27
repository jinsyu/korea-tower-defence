import Link from "next/link";
import { BugTag, broadcastButton } from "@/components/broadcast";
import { HomeMap } from "@/components/home-map";
import { FAKE_NATION_ONLINE } from "@/lib/fake-region-stats";
import { SITE_DESCRIPTION, pageMetadata } from "@/lib/site";

export const metadata = pageMetadata({ description: SITE_DESCRIPTION, path: "/" });

// "복구 코드로 이어 하기" gets wired up in T5 (restore screen).
export default function Home() {
  return (
    <main className="grid flex-1 place-items-center bg-[radial-gradient(ellipse_at_70%_40%,rgb(27_63_134/0.6),transparent_60%)] px-3.5 py-5 short-phone:py-3">
      <div className="grid w-full max-w-[1100px] min-w-0 justify-items-start gap-3.5 short-phone:gap-2.5 wide:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] wide:items-center wide:gap-x-10">
        <BugTag live="LIVE">전국 185곳 · 지금 {FAKE_NATION_ONLINE.toLocaleString("ko-KR")}명 지키는 중</BugTag>
        <h1 className="font-heading text-[clamp(40px,7vw,96px)] leading-none">
          전국 지킴이
          <br />
          <em className="text-yellow not-italic">생중계</em>
        </h1>
        <p className="max-w-[34em] text-[clamp(15px,1.5vw,20px)] text-mut">
          우리 지역을 골라 친구들과 함께 24시간 지켜요. 계산 문제를 맞힐 때마다 내 타워가 자라고, 우리 지역 화력이 세져요.
        </p>
        <HomeMap />
        <div className="flex flex-wrap gap-2.5">
          <Link href="/start/grade" className={`${broadcastButton} bg-yellow`}>
            처음 하기
          </Link>
          <button type="button" className={`${broadcastButton} bg-white`}>
            복구 코드로 이어 하기
          </button>
        </div>
        <p className="text-[13px] font-bold text-mut">가입도, 이름도 없어요. 별명은 목록에서 골라요.</p>
      </div>
    </main>
  );
}
