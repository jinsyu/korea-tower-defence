"use client";

import { TOWER_TYPES } from "@ktd/core";
import { useRouter } from "next/navigation";
import { TowerCanvas } from "@/components/art/painted-canvas";
import { BugTag, broadcastButton } from "@/components/broadcast";
import { useStartFlow } from "@/components/start-flow";
import { nicknameCandidates } from "@/lib/fake-nicknames";
import { TOWER_TYPE_INFO } from "@/lib/tower-types";

const labelClass = "min-w-0 truncate font-heading text-lg text-yellow";

export function NickPicker() {
  const { region, nickSeed, setNickSeed, nickname, setNickname, towerType, setTowerType } = useStartFlow();
  const router = useRouter();
  const candidates = nicknameCandidates(nickSeed);
  const picked = nickname ?? candidates[0];

  const reroll = () => {
    const next = nickSeed + 1;
    setNickSeed(next);
    setNickname(nicknameCandidates(next)[0]);
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
        <div role="group" aria-label="별명 후보" className="grid grid-cols-1 gap-1.5 wide:grid-cols-3">
          {candidates.map((c) => {
            const pressed = c.nick === picked.nick && c.tag === picked.tag;
            return (
              <button
                key={`${c.nick}#${c.tag}`}
                type="button"
                aria-pressed={pressed}
                onClick={() => setNickname(c)}
                className="group min-h-13 min-w-0 truncate border-l-6 border-navy3 bg-navy2 px-3 text-left font-heading text-[22px] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-yellow aria-pressed:border-red aria-pressed:bg-yellow aria-pressed:text-navy"
              >
                {c.nick}
                <small className="ml-1.5 font-sans text-[13px] font-black text-mut group-aria-pressed:text-navy">
                  #{c.tag}
                </small>
              </button>
            );
          })}
        </div>

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
          <button type="button" className={`${broadcastButton} bg-yellow`} onClick={() => {
              setNickname(picked);
              router.push("/start/code");
            }}>
            다음 · 복구 코드 받기
          </button>
        </div>
      </div>
    </main>
  );
}
