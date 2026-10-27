"use client";

import { CODE_INITIALS, codeWordsByInitial, type CodeInitial } from "@ktd/core";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BugTag, broadcastButton } from "@/components/broadcast";
import { fitTileText } from "@/components/code-tiles";
import { saveDeviceKey } from "@/lib/device-key";
import { callServer, OFFLINE_TEXT, type ServerMe } from "@/lib/game-server";
import {
  DIGIT_SLOT,
  EMPTY_RESTORE_INPUT,
  clearOne,
  enterDigit,
  enterWord,
  selectSlot,
  toRecoveryCode,
} from "@/lib/restore-input";

/** The server's limit per address (spec D5). */
const RESTORE_TRIES_PER_HOUR = 10;
const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
const focusRing = "focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-yellow";
const keyClass = `min-h-11 min-w-0 truncate px-0.5 ${focusRing}`;

type Message = { text: string; kind: "ok" | "bad" | "lock" } | null;

const messageClass = {
  ok: "text-yellow",
  bad: "text-[#FF8A80]",
  lock: "bg-red px-2.5 py-1.5 text-white",
};

const sortedWords = (c: CodeInitial) => [...codeWordsByInitial(c)].sort((a, b) => a.localeCompare(b, "ko"));

export function RestorePad() {
  const router = useRouter();
  const [input, setInput] = useState(EMPTY_RESTORE_INPUT);
  const [initial, setInitial] = useState<CodeInitial>("ㄱ");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [shakes, setShakes] = useState(0);
  const leaveTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  const code = toRecoveryCode(input);
  const edit = (next: typeof input) => {
    setInput(next);
    setMessage(null);
  };

  const submit = async () => {
    if (!code || busy) return;
    setBusy(true);
    const res = await callServer<{ key: string; me: ServerMe }>("/restore", { method: "POST", body: code });
    setBusy(false);
    if (res.ok) {
      saveDeviceKey(res.data.key);
      setMessage({ text: `다시 만나서 반가워요, ${res.data.me.name} #${res.data.me.tag}!`, kind: "ok" });
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      leaveTimer.current = window.setTimeout(() => router.push("/play"), reduced ? 100 : 900);
      return;
    }
    setShakes((n) => n + 1);
    if (res.status === 401) {
      const left = Number(res.data.triesLeft ?? 0);
      setMessage({
        text: `코드가 맞지 않아요. 낱말 순서를 확인해 주세요 (1시간에 ${RESTORE_TRIES_PER_HOUR}번까지, 남은 ${left}번)`,
        kind: "bad",
      });
    } else if (res.status === 429) {
      setMessage({ text: `잠시 뒤에 다시 해요 · ${Number(res.data.minutesLeft ?? 60)}분 남았어요`, kind: "lock" });
    } else {
      setMessage({ text: OFFLINE_TEXT, kind: "bad" });
    }
  };

  const slots = [...input.words, input.digits];

  return (
    <main className="grid flex-1 items-start justify-items-center p-2.5">
      <div className="grid w-[min(900px,100%)] min-w-0 gap-2">
        <BugTag live="이어 하기">낱말 4개 + 숫자 2자리</BugTag>
        <h1 className="font-heading text-[clamp(28px,4.4vw,64px)] leading-[1.05]">복구 코드로 이어 하기</h1>

        <div
          key={shakes}
          role="group"
          aria-label="복구 코드 칸"
          className={`@container grid grid-cols-5 gap-1 [--tile-max:clamp(16px,4.4vw,30px)] ${shakes ? "animate-shake" : ""}`}
        >
          {slots.map((value, i) => {
            const label = i < DIGIT_SLOT ? `낱말 ${i + 1}` : "숫자 2자리";
            const on = i === input.cur;
            return (
              <button
                key={label}
                type="button"
                aria-label={value ? `${label}: ${value}` : `${label} (비어 있음)`}
                aria-current={on ? "step" : undefined}
                onClick={() => edit(selectSlot(input, i))}
                className={`min-h-13 min-w-0 overflow-hidden px-0.5 font-heading whitespace-nowrap wide:min-h-18 ${focusRing} ${
                  value ? "border-2 border-solid bg-white text-navy" : "border-2 border-dashed border-white/40 bg-white/5"
                } ${on ? (value ? "outline-3 -outline-offset-5 outline-yellow" : "border-solid border-yellow bg-navy3") : ""}`}
              >
                <span style={fitTileText(Math.max(2, (value || label).length))}>{value || (i < DIGIT_SLOT ? label : "숫자")}</span>
              </button>
            );
          })}
        </div>

        {input.cur < DIGIT_SLOT ? (
          <div className="grid min-w-0 gap-1">
            <p className="text-xs font-black text-mut">첫 글자 자음을 고르고, 낱말을 눌러요</p>
            <div role="group" aria-label="첫 글자 자음" className="grid grid-cols-7 gap-1 wide:grid-cols-14">
              {CODE_INITIALS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={c === initial}
                  onClick={() => setInitial(c)}
                  className={`${keyClass} bg-navy2 text-[17px] font-black aria-pressed:bg-yellow aria-pressed:text-navy`}
                >
                  {c}
                </button>
              ))}
            </div>
            <div
              key={initial}
              role="group"
              aria-label={`${initial} 낱말`}
              className="grid max-h-[min(38dvh,340px)] grid-cols-3 gap-1 overflow-y-auto overscroll-contain wide:grid-cols-4"
            >
              {sortedWords(initial).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => edit(enterWord(input, w))}
                  className={`${keyClass} bg-white font-heading text-[19px] text-navy`}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid min-w-0 gap-1">
            <p className="text-xs font-black text-mut">숫자 2자리를 눌러요</p>
            <div role="group" aria-label="숫자" className="grid grid-cols-5 gap-1">
              {DIGITS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => edit(enterDigit(input, d))}
                  className={`${keyClass} bg-navy2 font-heading text-[22px]`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        )}

        <p role="status" className={`m-0 min-h-5 text-sm font-black ${message ? messageClass[message.kind] : ""}`}>
          {message?.text}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => edit(clearOne(input))} className={`${broadcastButton} bg-white`}>
            한 칸 지우기
          </button>
          <button
            type="button"
            disabled={!code || busy}
            onClick={() => void submit()}
            className={`${broadcastButton} bg-yellow disabled:bg-[#3a4566] disabled:text-mut`}
          >
            이어 하기
          </button>
        </div>
      </div>
    </main>
  );
}
