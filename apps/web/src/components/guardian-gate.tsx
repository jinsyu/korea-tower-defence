"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { BugTag, broadcastButton } from "@/components/broadcast";
import { OFFLINE_TEXT } from "@/lib/game-server";
import { useMyGuardian } from "./use-my-guardian";

/**
 * Screens that need my guardian. Without a working device key they go to the first screen with no error (D6);
 * when the server cannot be reached they wait with a retry button.
 */
export function GuardianGate({ children }: { children: ReactNode }) {
  const { guardian, reload } = useMyGuardian();
  const router = useRouter();

  useEffect(() => {
    if (guardian.status === "none") router.replace("/");
  }, [guardian.status, router]);

  if (guardian.status === "ready" || guardian.status === "demo") return children;
  return (
    <div className="grid h-full min-h-dvh place-items-center p-4">
      <div className="grid justify-items-start gap-3">
        <BugTag live="중계 준비">우리 지역에 연결하는 중</BugTag>
        <p role="status" className="text-base font-bold text-mut">
          {guardian.status === "offline" ? OFFLINE_TEXT : "내 지킴이를 불러오는 중이에요…"}
        </p>
        {guardian.status === "offline" && (
          <button type="button" onClick={reload} className={`${broadcastButton} bg-yellow`}>
            다시 잇기
          </button>
        )}
      </div>
    </div>
  );
}
