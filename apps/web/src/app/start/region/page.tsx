import { StartRegionPicker } from "@/components/start-flow";
import { pageMetadata } from "@/lib/site";

export const metadata = {
  ...pageMetadata({
    title: "지킬 지역 고르기",
    description:
      "전국 185개 시·군·구 가운데 지킬 지역을 하나 골라요. 시·도를 누르면 크게 보이고, 지역마다 지킴이 수와 최고 웨이브가 나와요. 지역은 30일에 한 번 바꿀 수 있어요.",
    path: "/start/region",
  }),
  robots: { index: false, follow: true },
};

export default function RegionPage() {
  return (
    <main className="h-dvh overflow-hidden">
      <StartRegionPicker />
    </main>
  );
}
