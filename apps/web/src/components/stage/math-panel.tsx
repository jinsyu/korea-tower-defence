"use client";

import type { MathText as MathTextValue } from "@ktd/core";
import type { Header, PanelView } from "@/lib/stage/math-panel";
import { spoken } from "@/lib/stage/spoken";

const HEADER_TONE: Record<Header["tone"], string> = {
  plain: "bg-white text-navy",
  warn: "bg-red text-white",
  info: "bg-cyan text-navy",
};

const OPT_BASE =
  "mq-opt relative flex min-h-0 min-w-0 items-center justify-center gap-1.5 overflow-hidden px-2.5 py-1 font-heading text-(length:--opt) whitespace-nowrap text-navy [clip-path:polygon(8px_0,100%_0,calc(100%-8px)_100%,0_100%)] focus-visible:outline-3 focus-visible:-outline-offset-4 focus-visible:outline-navy disabled:text-navy";
const OPT_LABEL = "absolute top-[3px] left-3 bg-navy px-1.5 font-sans text-[11px] leading-[1.4] font-black";

/** Text with the answer blank. Decorative; callers give the spoken form. */
export function MathText({ text }: { text: MathTextValue }) {
  return text.map((t, i) => {
    if (typeof t === "string") return <span key={i}>{t}</span>;
    return (
      <em key={i} className="inline-block min-w-[.9em] border-b-4 border-yellow leading-none text-yellow not-italic">
        ?
      </em>
    );
  });
}

type Props = {
  state: PanelView;
  header: Header;
  /** Connection lost, or no problem to answer yet (loading, waiting after many skips): choices are locked. */
  offline: boolean;
  onPick: (index: number) => void;
  onNext: () => void;
};

/**
 * Problem panel: header "곱셈구구", expression, 2×2 choices, skip.
 * A wrong answer keeps my pick and the right answer in the first row and puts the solution in the second,
 * so the panel (and the board above it) never changes height.
 */
export function MathPanel({ state, header, offline, onPick, onNext }: Props) {
  const { problem: p, answered } = state;
  const wrong = answered !== null && !answered.correct;
  const live = answered
    ? answered.correct
      ? `정답! ${answered.points}포인트${answered.note ? `. ${answered.note}` : ""}`
      : `내가 고른 답은 ${spoken(p.choices[answered.pick]!)}, 정답은 ${spoken(p.choices[answered.answer]!)}예요.`
    : "";

  return (
    <section
      data-slot="math"
      aria-label="수학 문제"
      data-problem={state.id}
      className="mq relative grid min-w-0 gap-1 border-t-4 border-yellow bg-navy pb-1.5"
    >
      <div className="flex h-11 min-w-0 items-stretch">
        <span className="flex flex-none items-center bg-red px-2.5 font-heading text-[15px]">문제</span>
        <p data-slot="math-header" className={`min-w-0 flex-auto truncate px-2.5 text-sm leading-11 font-black ${HEADER_TONE[header.tone]}`}>
          {header.text}
        </p>
        <button
          type="button"
          onClick={onNext}
          disabled={offline || (answered?.correct ?? false)}
          className={`h-11 min-w-22 flex-none px-2 whitespace-nowrap disabled:opacity-60 ${
            wrong ? "bg-yellow font-heading text-[17px] text-navy" : "bg-black text-sm font-black text-white"
          }`}
        >
          {wrong ? "다음 문제" : "건너뛰기"}
        </button>
      </div>
      <div className="grid min-w-0 gap-1 px-2">
        <div
          data-slot="math-expr"
          className="mq-expr relative flex h-(--expr-row) min-w-0 items-center justify-center overflow-hidden font-heading text-(length:--expr) leading-(--expr-lh) whitespace-nowrap"
        >
          <span className="sr-only">{spoken(p.expr)}</span>
          <span aria-hidden="true" className="truncate">
            <MathText text={p.expr} />
          </span>
          {answered?.correct && (
            <div className="pointer-events-none absolute inset-0 flex animate-snap items-center justify-center gap-2.5 bg-navy text-2xl text-[#3DDC84] wide-or-landscape:text-[32px]">
              <span className="inline-grid size-10 flex-none -rotate-12 place-items-center rounded-full border-4 border-red text-xs text-red">
                정답!
              </span>
              +{answered.points}P
              {answered.note && <small className="font-sans text-xs font-black text-white">{answered.note}</small>}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 grid-rows-[repeat(2,var(--oh))] gap-1.5">
          {p.choices.map((c, i) => {
            const picked = answered?.pick === i;
            const isAnswer = i === answered?.answer;
            if (wrong && !picked && !isAnswer) return null;
            const look = !answered
              ? "bg-white"
              : picked && answered.correct
                ? "animate-snap bg-[#3DDC84]"
                : picked
                  ? "animate-shake bg-[#C9D2E6] pt-4 line-through decoration-navy decoration-3"
                  : wrong && isAnswer
                    ? "bg-[#3DDC84] pt-4"
                    : "bg-white";
            return (
              <button
                key={i}
                type="button"
                data-choice={i}
                aria-label={spoken(c)}
                disabled={offline || answered !== null}
                onClick={() => onPick(i)}
                className={`${OPT_BASE} ${look} ${offline ? "opacity-40" : ""}`}
              >
                {wrong && picked && <span className={`${OPT_LABEL} text-white`}>✕ 내가 고른 답</span>}
                {wrong && isAnswer && <span className={`${OPT_LABEL} text-[#3DDC84]`}>정답</span>}
                <MathText text={c} />
              </button>
            );
          })}
          {wrong && answered && (
            <div
              data-slot="math-solution"
              className="order-1 col-span-2 flex min-h-0 animate-lower-in overflow-y-auto border-l-4 border-cyan bg-black px-2.5 py-1"
            >
              {/* my-auto centres the solution when it fits and lets it scroll from the top when it does not. */}
              <p className="mq-sol my-auto text-[13px] leading-[1.45] break-keep text-[#dfe7ff] wide-or-landscape:text-sm">
                <MathText text={answered.solution.text} />
                <b className="text-white">
                  <MathText text={answered.solution.result} />
                </b>
              </p>
            </div>
          )}
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {live}
      </p>
    </section>
  );
}
