"use client";

import { useEffect, useState } from "react";
import type { KoreaMap } from "@/lib/korea-map";
import { KOREA_MAP_URL } from "@/lib/korea-map-url";

/** The national map shapes (region picker and national board), with a retry after a failed load. */
export function useKoreaMap() {
  const [map, setMap] = useState<KoreaMap | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch(KOREA_MAP_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`korea map ${res.status}`);
        return res.json() as Promise<KoreaMap>;
      })
      .then((data) => alive && setMap(data))
      .catch((err: unknown) => {
        console.error(err);
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [attempt]);

  const retry = () => {
    setFailed(false);
    setAttempt((n) => n + 1);
  };
  return { map, failed, retry };
}
