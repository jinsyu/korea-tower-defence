"use client";

import { useRouter } from "next/navigation";
import { BugTag, broadcastButton } from "@/components/broadcast";
import { Fraction } from "@/components/fraction";
import { useStartFlow } from "@/components/start-flow";
import { GRADE_BANDS, type GradeBand } from "@/lib/grade-bands";

function Example({ band }: { band: GradeBand }) {
  const ex = band.example;
  return (
    <>
      <span aria-hidden="true">
        {"text" in ex ? (
          ex.text
        ) : (
          <>
            <Fraction n={ex.fractions[0][0]} d={ex.fractions[0][1]} className="text-[0.66em]" /> {ex.op}{" "}
            <Fraction n={ex.fractions[1][0]} d={ex.fractions[1][1]} className="text-[0.66em]" />
          </>
        )}
      </span>
      <span className="sr-only">{band.exampleSpoken}</span>
    </>
  );
}

export function GradePicker() {
  const { band, setBand } = useStartFlow();
  const router = useRouter();

  return (
    <main className="grid flex-1 items-center justify-items-center bg-[radial-gradient(ellipse_at_30%_30%,rgb(27_63_134/0.55),transparent_60%)] p-3.5">
      <div className="grid w-[min(1200px,100%)] min-w-0 gap-3">
        <BugTag live="방송 준비 1/4">학년은 묻지 않아요</BugTag>
        <h1 className="font-heading text-[clamp(28px,4.4vw,64px)] leading-[1.05]">몇 학년이에요?</h1>
        <p className="text-[clamp(13px,1.3vw,19px)] font-bold text-mut">계산 문제가 끝없이 나와요. 맞히면 포인트!</p>
        <div role="group" aria-label="학년군 고르기" className="grid grid-cols-1 gap-2 wide:grid-cols-3 wide:gap-3.5">
          {GRADE_BANDS.map((b) => {
            const pressed = b.id === band;
            return (
              <button
                key={b.id}
                type="button"
                aria-pressed={pressed}
                onClick={() => setBand(b.id)}
                className="group grid min-h-22 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-0.5 border-l-6 border-navy3 bg-navy2 px-3 py-2 text-left [grid-template-areas:'band_ex'_'topic_ex'] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-yellow aria-pressed:border-red aria-pressed:bg-yellow aria-pressed:text-navy wide:min-h-[clamp(220px,28vh,340px)] wide:grid-cols-1 wide:content-center wide:justify-items-start wide:gap-y-3 wide:border-t-8 wide:border-l-0 wide:px-[22px] wide:py-5 wide:[grid-template-areas:'band'_'topic'_'ex']"
              >
                <span className="font-heading text-[clamp(26px,3vw,40px)] leading-[1.1] whitespace-nowrap [grid-area:band]">
                  {b.label}
                </span>
                <span className="min-w-0 truncate text-[13px] font-bold text-mut [grid-area:topic] group-aria-pressed:text-navy wide:max-w-full wide:text-[clamp(14px,1.2vw,20px)]">
                  {b.topic}
                </span>
                <span className="bg-white px-3 py-1 font-heading text-[clamp(24px,2.6vw,40px)] leading-[1.2] whitespace-nowrap text-navy [grid-area:ex] group-aria-pressed:bg-navy group-aria-pressed:text-yellow wide:text-[clamp(32px,3.2vw,64px)]">
                  <Example band={b} />
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button type="button" className={`${broadcastButton} bg-yellow`} onClick={() => router.push("/start/region")}>
            다음 · 우리 지역 고르기
          </button>
        </div>
      </div>
    </main>
  );
}
