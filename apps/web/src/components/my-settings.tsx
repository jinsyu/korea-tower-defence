"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { NickChoices, useNickCandidates } from "@/components/nick-choices";
import { callAsGuardian, dayLabel, NO_GUARDIAN_TEXT, OFFLINE_TEXT, type Nick, type ServerMe } from "@/lib/game-server";
import { regionName } from "@/lib/region-names";
import { useMyGuardian } from "./use-my-guardian";

const rowClass = "grid min-w-0 gap-2 bg-navy2 px-3 py-2.5";
const smallButton =
  "min-h-11 px-3 text-sm font-black whitespace-nowrap focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-yellow";

function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={rowClass}>
      <h3 className="font-black text-white">{title}</h3>
      {children}
    </div>
  );
}

const Note = ({ children }: { children: ReactNode }) => <p className="text-[13px] text-mut">{children}</p>;

/** "내 지킴이 바꾸기" on the info screen: region and nickname, saved on the server (D7). */
export function MySettings() {
  const { guardian, update, reload } = useMyGuardian();
  const [message, setMessage] = useState<string | null>(null);

  const save = async (path: string, body: unknown, done: string) => {
    if (guardian.status !== "ready") return;
    const res = await callAsGuardian<{ me: ServerMe }>(path, { method: "POST", body });
    if (res.ok) {
      update(res.data.me);
      setMessage(done);
    } else if (res.status === 401) {
      // The key was dropped; reloading finds no guardian and shows the "no guardian here" note.
      setMessage(NO_GUARDIAN_TEXT);
      reload();
    } else {
      setMessage(res.status === 0 ? OFFLINE_TEXT : "바꾸지 못했어요. 다시 해 주세요.");
    }
  };

  if (guardian.status !== "ready") {
    return (
      <div className={rowClass}>
        <p className="text-sm text-[#dfe7ff]" role="status">
          {guardian.status === "loading"
            ? "내 지킴이를 불러오는 중이에요…"
            : guardian.status === "offline"
              ? OFFLINE_TEXT
              : (message ?? "처음 하기나 복구 코드로 이어 하기를 마친 기기에서 바꿀 수 있어요.")}
        </p>
      </div>
    );
  }
  const me = guardian.me;

  return (
    <div className="grid gap-1.5">
      <Row title="지역 바꾸기">
        <Note>
          지금 지키는 지역: <b className="text-white">{regionName(me.region)}</b>. 처음 고른 뒤 24시간 안에는 한 번 바로 바꿀 수
          있고, 그 뒤로는 30일에 한 번이에요. 바꿔도 내 레벨·포인트·타워는 그대로 따라가요.
        </Note>
        {me.regionChange.allowed ? (
          <Link href="/info/region" className={`${smallButton} inline-flex w-fit items-center bg-white text-navy`}>
            지역 바꾸기
          </Link>
        ) : (
          <p className="font-black text-yellow">다음에 바꿀 수 있는 날: {dayLabel(me.regionChange.nextOn)}</p>
        )}
      </Row>
      <NickRow me={me} onPick={(nick) => void save("/me/nick", { nick }, "별명을 바꿨어요.")} />
      <p role="status" className="min-h-5 text-sm font-black text-yellow">
        {message}
      </p>
    </div>
  );
}

function NickRow({ me, onPick }: { me: ServerMe; onPick: (nick: Nick) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Row title="별명 바꾸기">
      <Note>
        지금 별명: <b className="text-white">{`${me.name} #${me.tag}`}</b>. 목록에서 새 별명을 골라요. 뒤에 붙는 꼬리표 숫자는 새로
        정해져요.
      </Note>
      {open ? (
        <NickPicking
          onPick={(nick) => {
            setOpen(false);
            onPick(nick);
          }}
        />
      ) : (
        <button type="button" onClick={() => setOpen(true)} className={`${smallButton} w-fit bg-white text-navy`}>
          새 별명 고르기
        </button>
      )}
    </Row>
  );
}

function NickPicking({ onPick }: { onPick: (nick: Nick) => void }) {
  const { candidates, reroll, failed } = useNickCandidates();
  return (
    <div className="grid gap-1.5">
      <NickChoices candidates={candidates} picked={null} onPick={onPick} />
      <button type="button" onClick={reroll} className={`${smallButton} w-fit bg-white text-navy`}>
        다시 뽑기
      </button>
      {failed && <p className="text-sm font-black text-[#FF8A80]">{OFFLINE_TEXT}</p>}
    </div>
  );
}
