import { NationalBoard } from "@/components/korea-map/national-board";
import { pageMetadata } from "@/lib/site";

export const metadata = {
  ...pageMetadata({
    title: "전국 상황판",
    description:
      "전국 185개 시·군·구가 얼마나 높은 웨이브까지 막아 냈는지 색으로 보여 줘요. 최고 웨이브 순위와 오늘 1인당 정답 순위, 지역 카드를 볼 수 있어요.",
    path: "/board",
  }),
  robots: { index: false, follow: true },
};

// National board with fake numbers until the board API (T17).
export default function BoardPage() {
  return (
    <main className="h-dvh overflow-hidden">
      <NationalBoard />
    </main>
  );
}
