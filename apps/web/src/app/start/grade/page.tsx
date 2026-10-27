import { GradePicker } from "@/components/grade-picker";
import { pageMetadata } from "@/lib/site";

export const metadata = {
  ...pageMetadata({
    title: "학년군 고르기",
    description:
      "처음 오면 학년군 하나만 골라요. 1~2학년은 곱셈구구, 3~4학년은 두 자리 수 곱셈·나눗셈, 5~6학년은 분수·소수 계산 문제가 끝없이 나와요.",
    path: "/start/grade",
  }),
  robots: { index: false, follow: true },
};

export default function GradePage() {
  return <GradePicker />;
}
