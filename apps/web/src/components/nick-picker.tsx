"use client";

import { TOWER_TYPES } from "@ktd/core";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TowerCanvas } from "@/components/art/painted-canvas";
import { BugTag, broadcastButton } from "@/components/broadcast";
import { NickChoices, sameNick, useNickCandidates } from "@/components/nick-choices";
import { useStartFlow } from "@/components/start-flow";
import { saveDeviceKey } from "@/lib/device-key";
import { callServer, OFFLINE_TEXT, type Created } from "@/lib/game-server";
import { TOWER_TYPE_INFO } from "@/lib/tower-types";

const labelClass = "min-w-0 truncate font-heading text-lg text-yellow";

/** Step 3: nickname from the server's candidates and a tower type. "다음" makes the guardian on the server. */
export function NickPicker() {
  const { band, region, nickname, setNickname, towerType, setTowerType, issueCode } = useStartFlow();
  const router = useRouter();
  const { candidates, reroll, failed } = useNickCandidates();
  // After "다시 뽑기" the old pick is gone from the list, so the first new candidate is picked.
  const picked = candidates?.find((c) => sameNick(nickname, c)) ?? candidates?.[0] ?? null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!region) return router.push("/start/region");
    if (!picked || busy) return;
    setBusy(true);
    setError(null);
    const res = await callServer<Created>("/guardians", {
      method: "POST",
      body: { band, region: region.code, nick: picked, towerType },
    });
    setBusy(false);
    if (res.ok) {
      saveDeviceKey(res.data.key);
      issueCode(res.data.code);
      router.push("/start/code");
    } else if (res.status === 429) {
      setError("이곳에서 지킴이를 너무 많이 만들었어요. 잠시 뒤에 다시 해요.");
    } else {
      setError(res.status === 0 ? OFFLINE_TEXT : "지킴이를 만들지 못했어요. 처음부터 다시 골라 주세요.");
    }
  };

  return (
    <main className="grid flex-1 items-center justify-items-center bg-[radial-gradient(ellipse_at_70%_20%,rgb(27_63_134/0.5),transparent_60%)] p-3">
      <div className="grid w-[min(1100px,100%)] min-w-0 gap-2">
        <BugTag live="방송 준비 3/4">{region ? `${region.name} 지킴이 등록` : "지킴이 등록"}</BugTag>
        <h1 className="font-heading text-[clamp(28px,4.4vw,64px)] leading-[1.05]">내 타워 만들기</h1>

        <div className="flex min-w-0 items-center justify-between gap-2">
          <h2 className={labelClass}>별명 고르기</h2>
          <button
            type="button"
            onClick={reroll}
            className="min-h-11 flex-none bg-white px-3 text-sm font-black whitespace-nowrap text-navy focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-yellow"
          >
            다시 뽑기
          </button>
        </div>
        <NickChoices candidates={candidates} picked={picked} onPick={setNickname} />

        <h2 className={labelClass}>타워 계열 (언제든 바꿀 수 있어요)</h2>
        <div role="group" aria-label="타워 계열" className="grid grid-cols-3 gap-1.5">
          {TOWER_TYPES.map((t) => {
            const info = TOWER_TYPE_INFO[t];
            return (
              <button
                key={t}
                type="button"
                aria-pressed={t === towerType}
                onClick={() => setTowerType(t)}
                className="grid min-h-28 min-w-0 content-center justify-items-center gap-0.5 border-t-6 border-navy3 bg-navy2 px-1 py-1.5 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-yellow aria-pressed:border-yellow aria-pressed:bg-navy3 wide:min-h-50"
              >
                <TowerCanvas type={t} step={1} pal={0} badge={false} className="block size-14 wide:size-28" />
                <b className="max-w-full truncate font-heading text-[17px] font-normal wide:text-2xl">{info.name}</b>
                <small className="max-w-full truncate text-[11px] font-bold text-mut wide:text-sm">{info.desc}</small>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            disabled={!picked || busy}
            className={`${broadcastButton} bg-yellow disabled:bg-[#3a4566] disabled:text-mut`}
            onClick={() => void create()}
          >
            다음 · 복구 코드 받기
          </button>
        </div>
        <p role="status" className="min-h-5 text-sm font-black text-[#FF8A80]">
          {error ?? (failed ? OFFLINE_TEXT : "")}
        </p>
      </div>
    </main>
  );
}
