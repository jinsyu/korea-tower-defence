// Fake nickname candidates from the core word lists. The server hands these out from T11.
import { NICK_ADJECTIVES, NICK_NOUNS } from "@ktd/core";

export type Nickname = { nick: string; tag: string };

function xorshift(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

export function nicknameCandidates(seed: number): Nickname[] {
  const r = xorshift(seed * 977);
  return [0, 1, 2].map(() => ({
    nick: `${NICK_ADJECTIVES[Math.floor(r() * NICK_ADJECTIVES.length)]} ${NICK_NOUNS[Math.floor(r() * NICK_NOUNS.length)]}`,
    tag: String(Math.floor(r() * 10000)).padStart(4, "0"),
  }));
}
