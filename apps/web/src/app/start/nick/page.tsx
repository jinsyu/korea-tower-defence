import { NickPicker } from "@/components/nick-picker";
import { pageMetadata } from "@/lib/site";

export const metadata = {
  ...pageMetadata({
    title: "내 타워 만들기",
    description:
      "별명 후보 세 개 가운데 하나를 고르고, 스피드건·물대포·끈끈 테이프 가운데 타워 계열을 골라요. 이름은 묻지 않아요.",
    path: "/start/nick",
  }),
  robots: { index: false, follow: true },
};

export default function NickPage() {
  return <NickPicker />;
}
