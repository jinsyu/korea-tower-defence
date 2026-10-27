"use client";

import {
  EVO_NAMES,
  MAT_AT,
  MAT_NAMES,
  TIER_AT,
  TIER_NAMES,
  TOWER_TYPES,
  lookOf,
  type BalloonKind,
} from "@ktd/core";
import { useState, type ReactNode } from "react";
import { PaintedCanvas, TowerCanvas } from "@/components/art/painted-canvas";
import { drawBalloon, type BalloonState } from "@/lib/art/balloon";
import { setUnitPx, starP } from "@/lib/art/shapes";
import { SPR_H, SPR_W } from "@/lib/art/sprite";
import { ORN_NAMES, drawBase, drawOrn, drawTierRing } from "@/lib/art/tower";
import { DEEP, YEL } from "@/lib/art/palette";
import { TOWER_TYPE_INFO } from "@/lib/tower-types";

/** Thresholds that pass through all 5 evolution stages and all 6 tier rims. */
const SAMPLE_STEPS = [1, 10, 25, 50, 100, 200, 300, 500];

const BALLOON_SAMPLES: [BalloonKind, BalloonState, string][] = [
  ["normal", {}, "보통"],
  ["normal", { hit: 0.05 }, "보통 · 맞음"],
  ["normal", { taped: true }, "보통 · 테이프"],
  ["fast", {}, "쌩쌩"],
  ["king", {}, "왕"],
  ["king", { hp: 0.5 }, "왕 · 절반"],
  ["king", { hp: 0.25, near: true }, "왕 · 직전"],
  ["boss", {}, "대장"],
  ["boss", { hp: 0.6 }, "대장 · 66%"],
  ["boss", { hp: 0.3 }, "대장 · 33%"],
];

type View = "gray" | "sil" | "blur";
const VIEWS: [View, string][] = [
  ["gray", "회색조"],
  ["sil", "실루엣"],
  ["blur", "흐림 2px"],
];

function Card({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`grid min-w-0 gap-2 border-t-4 border-yellow bg-navy px-3 py-2.5 ${className}`}>
      <h2 className="truncate font-heading text-base font-normal text-yellow">{title}</h2>
      {children}
    </section>
  );
}

function Tile({ caption, children }: { caption: ReactNode; children: ReactNode }) {
  return (
    <figure className="m-0 grid max-w-full min-w-0 content-end justify-items-center gap-0.5 bg-navy2 p-1 group-data-[sil=true]/sheet:bg-[#DCE4F5]">
      {children}
      <figcaption className="max-w-full truncate text-center text-[11px] font-bold text-mut group-data-[sil=true]/sheet:text-[#334] [&_b]:text-white group-data-[sil=true]/sheet:[&_b]:text-black">
        {caption}
      </figcaption>
    </figure>
  );
}

const wrap = "flex min-w-0 flex-wrap gap-1.5";
const row = "grid min-w-0 gap-1 border-b border-white/8 py-1.5";
const rowTitle = "text-[13px] font-black text-[#dfe7ff]";

function Towers({ D, sil }: { D: number; sil: boolean }) {
  return TOWER_TYPES.map((t) => (
    <div key={t} className={row}>
      <b className={rowTitle}>
        {TOWER_TYPE_INFO[t].name} · {TOWER_TYPE_INFO[t].shape}
      </b>
      <div className={wrap}>
        {SAMPLE_STEPS.map((s) => {
          const L = lookOf(s);
          return (
            <Tile
              key={s}
              caption={
                <>
                  <b>{s}</b> · {EVO_NAMES[L.evo].split(" ")[0]} {MAT_NAMES[L.mat]}
                </>
              }
            >
              <TowerCanvas
                type={t}
                step={s}
                pal={0}
                fixD={D}
                spot={!sil}
                sil={sil}
                className="block max-w-full"
                style={{ width: D * SPR_W, height: D * SPR_H }}
              />
            </Tile>
          );
        })}
      </div>
    </div>
  ));
}

/** Black-fill whatever was painted (silhouette view for non-tower canvases). */
function toSilhouette(g: CanvasRenderingContext2D) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = "#000";
  g.fillRect(0, 0, g.canvas.width, g.canvas.height);
  g.globalCompositeOperation = "source-over";
}

export function AssetSheet() {
  const [view, setView] = useState<Record<View, boolean>>({ gray: false, sil: false, blur: false });
  const sil = view.sil;

  return (
    <main
      data-sil={sil}
      className={`group/sheet flex-1 overflow-x-hidden ${view.blur ? "[&_canvas]:blur-[2px]" : ""}`}
    >
      <div className="mx-auto grid w-[min(1440px,100%)] min-w-0 gap-2 px-2.5 pt-2 pb-4">
        <div className="flex h-11 min-w-0 items-stretch bg-navy2">
          <span className="inline-flex items-center bg-red px-2.5 font-heading tracking-[0.5px] whitespace-nowrap text-white">
            에셋 견본
          </span>
          <h1 className="flex min-w-0 flex-1 items-center truncate px-2.5 font-heading text-lg font-normal">
            타워 · 풍선 그림 견본
          </h1>
        </div>
        <div role="group" aria-label="보기 방식" className="flex flex-wrap gap-1.5">
          {VIEWS.map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={view[k]}
              onClick={() => setView({ gray: false, sil: false, blur: false, [k]: !view[k] })}
              className="min-h-11 min-w-22 border-2 border-yellow px-3.5 text-sm font-black focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-white aria-pressed:bg-yellow aria-pressed:text-black"
            >
              {label}
            </button>
          ))}
        </div>
        <p className="m-0 text-xs font-bold text-mut">
          점선 칸 = 판 위의 자리 크기. 44px는 휴대폰 판의 실제 크기예요. 실루엣·회색조·흐림에서도 계열 3개와 진화 단계가
          구별되어야 해요(spec D51).
        </p>
        <div
          className={`grid min-w-0 gap-2 min-[1100px]:grid-cols-2 min-[1100px]:[&>section:nth-child(2)]:row-span-2 ${view.gray ? "grayscale" : ""}`}
        >
          <Card title="타워 · 계열 3 × 문턱 8 · 자리 44px">
            <div>
              <Towers D={44} sil={sil} />
            </div>
          </Card>
          <Card title="타워 · 계열 3 × 문턱 8 · 자리 88px">
            <div>
              <Towers D={88} sil={sil} />
            </div>
          </Card>
          <Card title="풍선 4종 · 체력 상태 (44px 판 / 88px 판 크기)">
            <div>
              {[44, 88].map((D) => {
                const R0 = D * 0.2;
                return (
                  <div key={D} className={row}>
                    <b className={rowTitle}>
                      {D}px 판 크기 (보통 풍선 반지름 {R0.toFixed(1)}px)
                    </b>
                    <div className={wrap}>
                      {BALLOON_SAMPLES.map(([kind, st, name]) => (
                        <Tile key={name} caption={<b>{name}</b>}>
                          <PaintedCanvas
                            paintKey={`${kind}|${name}|${R0}|${sil}`}
                            className="block max-w-full"
                            style={{ width: R0 * 5.4, height: R0 * 4.6 }}
                            paint={(g, w, h, dpr) => {
                              setUnitPx(dpr);
                              drawBalloon(g, w / 2, h * 0.45, R0, kind, st);
                              if (sil) toSilhouette(g);
                            }}
                          />
                        </Tile>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
          <Card title="재질 10단계 (받침으로)">
            <div className={wrap}>
              {MAT_NAMES.map((name, i) => (
                <Tile
                  key={name}
                  caption={
                    <>
                      <b>{MAT_AT[i]}</b> · {name}
                    </>
                  }
                >
                  <PaintedCanvas
                    paintKey={`mat|${i}|${sil}`}
                    className="block h-12 w-22"
                    paint={(g, _w, _h, dpr) => {
                      const sc = 1.35;
                      g.setTransform(dpr * sc, 0, 0, dpr * sc, 44 * dpr, (24 - 26 * sc) * dpr);
                      setUnitPx(dpr * sc);
                      drawBase(g, i);
                      if (sil) toSilhouette(g);
                    }}
                  />
                </Tile>
              ))}
            </div>
          </Card>
          <Card title="받침 테두리 6단계">
            <div className={wrap}>
              {TIER_NAMES.map((name, i) => (
                <Tile
                  key={name}
                  caption={
                    <>
                      <b>{TIER_AT[i]}</b> · {name}
                      {i === 5 ? " ★" : ""}
                    </>
                  }
                >
                  <PaintedCanvas
                    paintKey={`tier|${i}|${sil}`}
                    className="block h-10 w-22"
                    paint={(g) => {
                      g.translate(44, 20);
                      g.scale(0.95, 0.95);
                      drawTierRing(g, i);
                      if (i === 5) {
                        const p = starP(new Path2D(), 34, -9, 8, 3.7);
                        g.fillStyle = YEL;
                        g.strokeStyle = DEEP;
                        g.lineWidth = 2;
                        g.lineJoin = "round";
                        g.stroke(p);
                        g.fill(p);
                      }
                      if (sil) toSilhouette(g);
                    }}
                  />
                </Tile>
              ))}
            </div>
          </Card>
          <Card title="장식 10모양 × 색 2벌 (5단계마다)">
            <div className={wrap}>
              {Array.from({ length: 20 }, (_, i) => (
                <Tile key={i} caption={`${ORN_NAMES[i % 10]}${i < 10 ? "" : " 2"}`}>
                  <PaintedCanvas
                    paintKey={`orn|${i}|${sil}`}
                    className="block size-11"
                    paint={(g, _w, _h, dpr) => {
                      g.translate(22, 22);
                      setUnitPx(dpr * 1.9);
                      drawOrn(g, i, 0, 0, 1.9);
                      if (sil) toSilhouette(g);
                    }}
                  />
                </Tile>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}
