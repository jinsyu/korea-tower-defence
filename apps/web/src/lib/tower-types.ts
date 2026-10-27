import type { TowerType } from "@ktd/core";

export const TOWER_TYPE_INFO: Record<TowerType, { name: string; desc: string; shape: string }> = {
  rapid: { name: "스피드건", desc: "빠르게 콕콕", shape: "좁고 뾰족" },
  splash: { name: "물대포", desc: "둘레를 한꺼번에", shape: "넓고 낮은 통" },
  slow: { name: "끈끈 테이프", desc: "풍선을 붙잡아요", shape: "네모 + 큰 롤" },
};
