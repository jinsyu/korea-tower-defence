"use client";

import type { RecoveryCode } from "@ktd/core";
import Link from "next/link";
import { useState } from "react";
import { broadcastButton } from "@/components/broadcast";
import { CodeTiles } from "@/components/code-tiles";
import { nextDeleteStep, type DeleteStep } from "@/lib/delete-record";
import { clearDeviceKey } from "@/lib/device-key";
import { callAsGuardian, NO_GUARDIAN_TEXT, OFFLINE_TEXT } from "@/lib/game-server";

const ERROR_TEXT = "text-sm font-black text-[#FF8A80]";

async function withKey<T>(path: string, method: string): Promise<{ ok: true; data: T } | { ok: false; text: string }> {
  const res = await callAsGuardian<T>(path, { method });
  if (res.ok) return { ok: true, data: res.data };
  if (res.status === 401) return { ok: false, text: NO_GUARDIAN_TEXT };
  return { ok: false, text: res.status === 0 ? OFFLINE_TEXT : "지금은 할 수 없어요. 잠시 뒤에 다시 해 주세요." };
}

/** "새 복구 코드 만들기": the server makes a new code and the old one stops working (D4). Shown once. */
export function NewRecoveryCode() {
  const [code, setCode] = useState<RecoveryCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const make = async () => {
    const res = await withKey<{ code: RecoveryCode }>("/me/code", "POST");
    if (res.ok) setCode(res.data.code);
    else setError(res.text);
  };
  if (code) {
    return (
      <div className="grid gap-2">
        <CodeTiles code={code} />
        <p className="text-sm font-bold text-[#dfe7ff]">
          <b className="text-yellow">새 코드는 지금 한 번만 보여요.</b> 부모님께 보여 주거나 적어 두세요. 옛 코드는 이제 쓸 수 없어요.
        </p>
      </div>
    );
  }
  return (
    <div className="grid justify-items-start gap-2">
      <p className="text-sm text-[#dfe7ff]">코드를 잃어버렸으면 새로 만들어요. 새 코드를 만들면 옛 코드는 쓸 수 없어요.</p>
      <button type="button" onClick={() => void make()} className={`${broadcastButton} bg-white`}>
        새 복구 코드 만들기
      </button>
      {error && (
        <p role="status" className={ERROR_TEXT}>
          {error}
        </p>
      )}
    </div>
  );
}

const ASK: Record<"first" | "second", { text: string; yes: string }> = {
  first: { text: "정말 지울까요? 레벨·포인트·타워가 모두 사라져요.", yes: "지울래요" },
  second: { text: "마지막으로 한 번 더 물어요. 지우면 되돌릴 수 없고, 복구 코드도 쓸 수 없어요.", yes: "완전히 지우기" },
};

/** "내 기록 지우기": asks twice, and only the second yes reaches the server (D8). */
export function DeleteRecord() {
  const [step, setStep] = useState<DeleteStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const answer = async (action: "confirm" | "cancel") => {
    const next = nextDeleteStep(step, action);
    if (next !== "deleted") return setStep(next);
    const res = await withKey<unknown>("/me", "DELETE");
    if (!res.ok) {
      setError(res.text);
      return setStep("idle");
    }
    clearDeviceKey();
    setStep("deleted");
  };

  if (step === "deleted") {
    return (
      <div role="status" className="grid justify-items-start gap-2">
        <p className="font-black">기록을 지웠어요. 고마웠어요, 지킴이!</p>
        <Link href="/" className={`${broadcastButton} bg-white`}>
          첫 화면으로
        </Link>
      </div>
    );
  }
  if (step === "idle") {
    return (
      <div className="grid justify-items-start gap-2">
        <p className="text-sm text-[#dfe7ff]">
          서버에 있는 내 지킴이 기록을 바로 지워요. 내 타워 힘도 우리 지역 화력에서 빠져요.
        </p>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setStep(nextDeleteStep(step, "start"));
          }}
          className={`${broadcastButton} bg-red text-white`}
        >
          내 기록 지우기
        </button>
        {error && (
          <p role="status" className={ERROR_TEXT}>
            {error}
          </p>
        )}
      </div>
    );
  }
  const ask = ASK[step];
  return (
    <div role="alertdialog" aria-label="기록 지우기 확인" className="grid justify-items-start gap-2 border-t-4 border-red bg-navy2 p-3">
      <p className="font-black">{ask.text}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          autoFocus
          onClick={() => void answer("cancel")}
          className={`${broadcastButton} bg-white`}
        >
          그만둘래요
        </button>
        <button
          type="button"
          onClick={() => void answer("confirm")}
          className={`${broadcastButton} bg-red text-white`}
        >
          {ask.yes}
        </button>
      </div>
    </div>
  );
}
