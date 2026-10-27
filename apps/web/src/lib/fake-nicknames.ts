// Fake nickname candidates (mockup B list). The server hands these out from T11.

const ADJ = ["씩씩한", "반짝이는", "용감한", "느긋한", "재빠른", "든든한", "명랑한", "상냥한", "튼튼한", "신나는", "차분한", "똑똑한", "부지런한", "날쌘", "포근한", "당당한"];
const NOUN = ["수달", "다람쥐", "고래", "부엉이", "호랑이", "펭귄", "너구리", "두루미", "반딧불", "해바라기", "돌고래", "고슴도치", "참새", "거북", "사슴", "은하수"];

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
    nick: `${ADJ[Math.floor(r() * ADJ.length)]} ${NOUN[Math.floor(r() * NOUN.length)]}`,
    tag: String(Math.floor(r() * 10000)).padStart(4, "0"),
  }));
}
