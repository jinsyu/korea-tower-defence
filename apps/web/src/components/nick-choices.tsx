"use client";

import { useEffect, useState } from "react";
import { callServer, nickName, nickTag, type Nick } from "@/lib/game-server";

/** Three nickname candidates from the server; `reroll` asks for three new ones ("다시 뽑기"). */
export function useNickCandidates() {
  const [candidates, setCandidates] = useState<Nick[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [round, setRound] = useState(0);
  useEffect(() => {
    let alive = true;
    void callServer<{ candidates: Nick[] }>("/nicks").then((res) => {
      if (!alive) return;
      setFailed(!res.ok);
      if (res.ok) setCandidates(res.data.candidates);
    });
    return () => {
      alive = false;
    };
  }, [round]);
  return { candidates, failed, reroll: () => setRound((n) => n + 1) };
}

export const sameNick = (a: Nick | null, b: Nick) => a !== null && a.adj === b.adj && a.noun === b.noun && a.tag === b.tag;

/** Candidate buttons, shown as "<adjective> <noun> #0000". */
export function NickChoices({ candidates, picked, onPick }: { candidates: Nick[] | null; picked: Nick | null; onPick: (n: Nick) => void }) {
  return (
    <div role="group" aria-label="별명 후보" aria-busy={candidates === null} className="grid grid-cols-1 gap-1.5 wide:grid-cols-3">
      {(candidates ?? [null, null, null]).map((c, i) =>
        c ? (
          <button
            key={`${c.adj}-${c.noun}-${c.tag}`}
            type="button"
            aria-pressed={sameNick(picked, c)}
            onClick={() => onPick(c)}
            className="group min-h-13 min-w-0 truncate border-l-6 border-navy3 bg-navy2 px-3 text-left font-heading text-[22px] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-yellow aria-pressed:border-red aria-pressed:bg-yellow aria-pressed:text-navy"
          >
            {nickName(c)}
            <small className="ml-1.5 font-sans text-[13px] font-black text-mut group-aria-pressed:text-navy">#{nickTag(c)}</small>
          </button>
        ) : (
          <span key={i} className="min-h-13 border-l-6 border-navy3 bg-navy2/60" aria-hidden="true" />
        ),
      )}
    </div>
  );
}
