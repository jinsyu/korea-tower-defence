import { MeScreen } from "@/components/me/me-screen";
import { pageMetadata } from "@/lib/site";

export const metadata = {
  ...pageMetadata({
    title: "내 지킴이",
    description:
      "내 레벨과 스탯, 타워 단계를 보고 성향·타워 계열·색을 바꿔요. 앞으로 열릴 타워 모양과 다음 모양의 그림자도 미리 볼 수 있어요.",
    path: "/me",
  }),
  robots: { index: false, follow: true },
};

// My guardian. Reads the same store as the defence screen (fake guardian until T11–T12).
export default function MePage() {
  return (
    <main className="min-h-dvh">
      <MeScreen />
    </main>
  );
}
