import { DefenceScreen } from "@/components/stage/defence-screen";
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

// Defence screen. The board is the Pyeongchang test stage with fake region data until T13 and T16.
export default function PlayPage() {
  return (
    <main className="h-dvh min-h-0 overflow-hidden">
      <DefenceScreen />
    </main>
  );
}
