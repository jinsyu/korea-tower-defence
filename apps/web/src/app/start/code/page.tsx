import Link from "next/link";
import { BugTag, broadcastButton } from "@/components/broadcast";
import { CodeTiles } from "@/components/code-tiles";
import { FAKE_RECOVERY_CODE } from "@/lib/fake-restore";
import { pageMetadata } from "@/lib/site";

export const metadata = {
  ...pageMetadata({
    title: "내 복구 코드",
    description:
      "처음 한 번만 보여 주는 복구 코드예요. 쉬운 낱말 네 개와 숫자 두 자리로, 다른 기기에서 이 코드를 넣으면 레벨·포인트·타워가 그대로 이어져요.",
    path: "/start/code",
  }),
  robots: { index: false, follow: true },
};

// The code is fake until T11: the server makes it, shows it once and keeps only its hash.
export default function CodePage() {
  return (
    <main className="grid flex-1 place-items-center p-3.5">
      <div className="grid w-[min(900px,100%)] min-w-0 gap-3">
        <BugTag live="방송 준비 4/4">이 코드는 지금 한 번만 보여요</BugTag>
        <h1 className="font-heading text-[clamp(28px,4.4vw,64px)] leading-[1.05]">내 복구 코드예요</h1>
        <CodeTiles code={FAKE_RECOVERY_CODE} />
        <ul className="list-disc border-l-4 border-cyan bg-navy py-2.5 pr-3 pl-7 text-sm leading-[1.6] text-[#dfe7ff]">
          <li>
            <b>부모님께 보여 주거나 종이에 적어 두세요.</b>
          </li>
          <li>다른 기기에서 이 코드를 넣으면 레벨·포인트·타워가 그대로 이어져요.</li>
          <li>잃어버리면 이 기기에서 &quot;새 복구 코드 만들기&quot;로 바꿀 수 있어요.</li>
        </ul>
        <div className="flex flex-wrap gap-2.5">
          <Link href="/play" className={`${broadcastButton} bg-yellow`}>
            적어 두었어요 · 중계 시작
          </Link>
        </div>
      </div>
    </main>
  );
}
