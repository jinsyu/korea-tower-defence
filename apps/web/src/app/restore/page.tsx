import { RestorePad } from "@/components/restore-pad";
import { pageMetadata } from "@/lib/site";

export const metadata = {
  ...pageMetadata({
    title: "복구 코드로 이어 하기",
    description:
      "다른 기기에서 받은 복구 코드를 넣으면 같은 지킴이로 이어서 해요. 글자를 쓰지 않고, 자음을 고른 뒤 낱말 네 개와 숫자 두 자리를 눌러 넣어요.",
    path: "/restore",
  }),
  robots: { index: false, follow: true },
};

export default function RestorePage() {
  return <RestorePad />;
}
