"use client";

import { formatBig, lookKey, TOWER_TYPES } from "@ktd/core";
import Link from "next/link";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { TowerCanvas } from "@/components/art/painted-canvas";
import { pageQa, useDemoHooks } from "@/components/dev/use-demo-hooks";
import { PALETTE } from "@/lib/art/palette";
import { GRADE_BANDS } from "@/lib/grade-bands";
import { regionName } from "@/lib/region-names";
import {
  meScreenView,
  meStore,
  PREVIEW_STEPS,
  STANCE_NAMES,
  STANCES,
  STAT_KEYS,
  STAT_NAMES,
  withPal,
  withStance,
  withType,
  type Stance,
} from "@/lib/stage/me-store";
import { TOWER_TYPE_INFO } from "@/lib/tower-types";

const LAYERS: [string, string][] = [
  ["진화", "1·25·100·200·500단계: 실루엣이 바뀌어요 (I 기본 → II 개량 → III 전문 → IV 전설 → V 전설+)"],
  ["재질", "1·10·25·50·100·150·200·300·400·500: 나무 → 돌 → 철 → 청동 → 은 → 강철 → 금 → 수정 → 자수정 → 프리즘"],
  ["받침 테두리", "50·100·200·300·500: 초록 → 파랑 → 보라 → 주황 → 금 ★"],
  ["5단계마다", "장식·포신·띠가 조금씩 바뀌어요"],
  ["내 색", "몸통에만 칠해요. 등급은 받침 테두리로 보여요"],
];

const pressable = "focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-yellow";

function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="grid min-w-0 gap-2 border-t-4 border-yellow bg-navy px-3 py-2.5">
      {title && <h2 className="font-heading text-[17px] text-yellow">{title}</h2>}
      {children}
    </section>
  );
}

function Gauge({ pct, className = "h-1.5" }: { pct: number; className?: string }) {
  return (
    <span className={`relative block overflow-hidden bg-white/15 ${className}`}>
      <i className="absolute inset-y-0 left-0 bg-yellow" style={{ width: `${pct}%` }} />
    </span>
  );
}

/** "내 지킴이": level, stats, stance, tower type and colour, and the looks to come (spec D53, mockup B ?screen=me). */
export function MeScreen() {
  const me = useSyncExternalStore(meStore.subscribe, meStore.get, meStore.get);
  const v = meScreenView(me);
  const band = GRADE_BANDS.find((b) => b.id === me.band)?.label ?? "";
  const maxStat = Math.max(1, ...STAT_KEYS.map((k) => v.stats[k]));
  const [flash, setFlash] = useState(0);

  const set = (next: typeof me) => meStore.set(next);

  useDemoHooks(
    {
      "me-type": () => {
        const cur = meStore.get();
        set(withType(cur, TOWER_TYPES[(TOWER_TYPES.indexOf(cur.type) + 1) % TOWER_TYPES.length]!));
      },
      "me-stance": () => {
        const cur = meStore.get();
        set(withStance(cur, STANCES[(STANCES.indexOf(cur.stance) + 1) % STANCES.length]!));
      },
      "me-color": () => {
        const cur = meStore.get();
        set(withPal(cur, (cur.pal + 1) % meScreenView(cur).colorsOpen));
      },
      "me-500": () => {
        const el = document.querySelector<HTMLElement>('[data-preview="500"]');
        if (!el) return false;
        const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
        el.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
        setFlash((n) => n + 1);
      },
    },
    () => {
      const scr = document.querySelector("[data-slot=me-screen]");
      const all = <T extends Element>(sel: string) => [...(scr?.querySelectorAll<T>(sel) ?? [])];
      const nextCard = scr?.querySelector<HTMLElement>("[data-preview-next]");
      const swatches = all<HTMLElement>("[data-pal]");
      const cur = meStore.get();
      const keys = PREVIEW_STEPS.map(([s]) => lookKey(cur.type, s));
      return {
        ...pageQa(),
        mePreviewCount: all("[data-preview]").length,
        meNextShown: !!nextCard && nextCard.getBoundingClientRect().width > 0,
        meNextText: scr?.querySelector("[data-slot=me-next]")?.textContent ?? null,
        mePreviewKeysDistinct: new Set(keys).size === keys.length,
        mePreviewKeys: keys,
        meSwatchCount: swatches.length,
        meSwatchOpen: swatches.filter((s) => !(s as HTMLButtonElement).disabled).length,
        meSwatchMinPx: Math.round(Math.min(...swatches.map((s) => s.getBoundingClientRect().height))),
        meStanceCount: all("[data-stance]").length,
        meTypeCount: all("[data-type]").length,
        meCanvasPainted: all<HTMLCanvasElement>("canvas").every((c) => c.width > 2),
        meState: { type: cur.type, stance: cur.stance, pal: cur.pal, level: cur.level, step: cur.step },
        meStepShown: Number(scr?.querySelector<HTMLElement>("[data-slot=me-level]")?.dataset.step ?? NaN),
      };
    },
  );

  return (
    <div data-slot="me-screen" className="mx-auto grid w-[min(1280px,100%)] min-w-0 gap-2 px-2.5 pt-2 pb-4">
      <div className="flex h-11 min-w-0 items-stretch bg-navy2">
        <span className="flex flex-none items-center bg-red px-2.5 font-heading text-[13px] whitespace-nowrap text-white">
          내 지킴이
        </span>
        <h1 className="flex min-w-0 flex-auto items-center px-2.5 font-heading text-lg">
          <span className="truncate">
            {me.nick} #{me.tag}
          </span>
        </h1>
        <Link
          href="/play"
          prefetch={false}
          className="flex min-w-11 flex-none items-center bg-white px-2.5 font-heading text-[15px] whitespace-nowrap text-navy focus-visible:outline-3 focus-visible:-outline-offset-4 focus-visible:outline-navy"
        >
          중계로
        </Link>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-2 wide:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="grid min-w-0 content-start gap-2">
          <Card>
            <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
              <TowerCanvas type={me.type} step={me.step} pal={me.pal} className="size-[clamp(112px,32vw,220px)]" />
              <div className="grid min-w-0 gap-1">
                <small className="truncate text-xs font-black text-mut">
                  {regionName(me.region)} 지킴이 · {band}
                </small>
                <b className="truncate font-heading text-[clamp(20px,2.4vw,34px)] font-normal">
                  {me.nick} #{me.tag}
                </b>
                <span
                  data-slot="me-level"
                  data-step={v.step}
                  className="truncate font-heading text-[clamp(22px,3vw,44px)] text-yellow"
                >
                  Lv {v.level} · {v.step}단계
                </span>
                <span className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 text-xs font-black whitespace-nowrap">
                  <span>다음 업그레이드 {formatBig(v.toUpgrade)}P</span>
                  <Gauge pct={v.upgradePct} />
                </span>
                <small className="text-xs font-black text-mut">
                  새 장식까지 {v.toDecoration}단계 · 레벨업까지 {formatBig(v.toLevel)}P
                </small>
              </div>
            </div>
          </Card>

          <Card title="스탯">
            <div className="grid gap-1.5">
              {STAT_KEYS.map((k) => (
                <div key={k} className="grid grid-cols-[4em_minmax(0,1fr)_2.2em] items-center gap-2 text-sm font-black">
                  <span>{STAT_NAMES[k]}</span>
                  <Gauge pct={Math.round((v.stats[k] / maxStat) * 100)} className="h-2.5" />
                  <b className="text-right font-heading text-lg font-normal">{v.stats[k]}</b>
                </div>
              ))}
            </div>
            <p className="text-xs font-bold text-mut">
              어떤 성향이든 우리 지역 화력에 더하는 힘은 같아요. 성향은 내 타워가 싸우는 모습을 바꿔요.
            </p>
          </Card>

          <Card title="성향 (스탯 점수를 저절로 나눠요)">
            <div className="flex flex-wrap gap-1.5">
              {STANCES.map((s: Stance) => (
                <button
                  key={s}
                  type="button"
                  data-stance={s}
                  aria-pressed={me.stance === s}
                  onClick={() => set(withStance(meStore.get(), s))}
                  className={`min-h-11 min-w-11 bg-navy2 px-3 text-[15px] font-black whitespace-nowrap aria-pressed:bg-yellow aria-pressed:text-navy ${pressable}`}
                >
                  {STANCE_NAMES[s]}
                </button>
              ))}
            </div>
          </Card>

          <Card title="타워 계열">
            <div className="grid grid-cols-3 gap-1.5">
              {TOWER_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  data-type={t}
                  aria-pressed={me.type === t}
                  onClick={() => set(withType(meStore.get(), t))}
                  className={`grid min-h-22 min-w-0 content-center justify-items-center gap-0.5 border-t-5 border-navy3 bg-navy2 p-1 aria-pressed:border-yellow aria-pressed:bg-navy3 ${pressable}`}
                >
                  <TowerCanvas type={t} step={me.step} pal={me.pal} badge={false} className="size-12" />
                  <b className="max-w-full truncate font-heading text-[15px] font-normal">{TOWER_TYPE_INFO[t].name}</b>
                </button>
              ))}
            </div>
          </Card>

          <Card title="색 (10레벨마다 하나씩 열려요)">
            <div className="grid grid-cols-6 gap-1.5">
              {PALETTE.map((p, i) => {
                const locked = i >= v.colorsOpen;
                return (
                  <button
                    key={p.c}
                    type="button"
                    data-pal={i}
                    disabled={locked}
                    aria-pressed={me.pal === i}
                    aria-label={locked ? `${p.n} (레벨 ${i * 10}에 열림)` : p.n}
                    onClick={() => set(withPal(meStore.get(), i))}
                    style={{ background: p.c }}
                    className={`relative min-h-11 min-w-0 border-3 border-[rgb(6_16_42/0.6)] aria-pressed:border-white aria-pressed:outline-3 aria-pressed:outline-red disabled:opacity-30 ${pressable}`}
                  >
                    {locked && (
                      <span className="absolute inset-x-0 bottom-0 bg-white/80 text-[10px] font-black text-black">Lv {i * 10}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="grid min-w-0 content-start gap-2">
          <Card title="단계 미리보기 · 층이 겹쳐 모양이 바뀌어요">
            <div className="grid grid-cols-4 gap-1.5">
              {v.previews.map((p) => (
                <div
                  key={p.step === 500 ? `${p.step}-${flash}` : p.step}
                  data-preview={p.step}
                  className={`grid min-w-0 justify-items-center gap-0.5 border-b-4 bg-navy2 px-1 py-1.5 ${p.now ? "border-yellow" : "border-transparent"} ${p.step === 500 && flash ? "animate-snap outline-3 outline-yellow" : ""}`}
                >
                  <TowerCanvas type={me.type} step={p.step} pal={me.pal} className="aspect-square w-[min(100%,120px)] wide:w-[min(100%,160px)]" />
                  <b className="max-w-full truncate font-heading text-base font-normal">{p.step}단계</b>
                  <small className="max-w-full truncate text-center text-[11px] font-bold text-mut">{p.label}</small>
                </div>
              ))}
              {v.next && (
                <div
                  data-preview-next={v.next.step}
                  className="grid min-w-0 justify-items-center gap-0.5 border-b-4 border-cyan bg-[repeating-linear-gradient(135deg,var(--navy2)_0_8px,#17306A_8px_16px)] px-1 py-1.5"
                >
                  <TowerCanvas
                    type={me.type}
                    step={v.next.step}
                    pal={me.pal}
                    sil
                    className="aspect-square w-[min(100%,120px)] wide:w-[min(100%,160px)]"
                  />
                  <b className="max-w-full truncate font-heading text-base font-normal text-cyan">다음 모양</b>
                  <small className="max-w-full truncate text-center text-[11px] font-bold text-mut">{v.next.left}단계 남음</small>
                </div>
              )}
            </div>
            <p data-slot="me-next" className="text-[13px] font-bold text-[#dfe7ff]">
              {v.next ? (
                <>
                  <b className="text-yellow">{v.next.text}</b> · 앞으로 {v.next.left}단계
                </>
              ) : (
                "모든 모양을 열었어요!"
              )}
            </p>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-0.5 text-xs font-bold text-[#dfe7ff]">
              {LAYERS.map(([k, d]) => (
                <div key={k} className="contents">
                  <dt className="whitespace-nowrap text-yellow">{k}</dt>
                  <dd>{d}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs font-bold text-mut">
              1~499단계에서 5단계마다 새 모양이 나오고 같은 모양은 다시 나오지 않아요(계열마다 100가지). 큰 변화는 앞쪽에 많아요.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
