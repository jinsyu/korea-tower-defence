import { ChangeRegion } from "@/components/change-region";
import { pageMetadata } from "@/lib/site";

export const metadata = {
  ...pageMetadata({
    title: "지킬 지역 바꾸기",
    description:
      "지킬 지역을 바꿔요. 처음 고른 뒤 24시간 안에는 한 번 바로 바꿀 수 있고, 그 뒤로는 30일에 한 번이에요. 내 레벨·포인트·타워는 그대로 따라가요.",
    path: "/info/region",
  }),
  robots: { index: false, follow: true },
};

export default function ChangeRegionPage() {
  return (
    <main className="h-dvh overflow-hidden">
      <ChangeRegion />
    </main>
  );
}
