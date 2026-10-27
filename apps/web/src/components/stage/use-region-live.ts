"use client";

import { io, type Socket } from "socket.io-client";
import { useEffect, useRef, useState } from "react";
import { clearDeviceKeyIfStill, readDeviceKey } from "@/lib/device-key";
import { rtRoute } from "@/lib/rt-route";
import type { RegionMessage, RepsMessage } from "@/lib/stage/region-live";

type Options = {
  /** Off on the dev-only `?demo=` screens. */
  enabled: boolean;
  onRegion: (m: RegionMessage) => void;
  onReps: (m: RepsMessage) => void;
  /** The server no longer knows this device's key: the key is already dropped. */
  onGone: () => void;
};

/**
 * My region's room on the game server (D23, D58, D77): the socket goes the way the connection order found, and says
 * which way for the /health counts. `offline` turns on as soon as the connection drops (a dead server or network is
 * noticed by the heartbeat within 2.5 s) and off when it is back; socket.io keeps trying meanwhile.
 */
export function useRegionLive({ enabled, onRegion, onReps, onGone }: Options) {
  const [offline, setOffline] = useState(false);
  const live = useRef({ onRegion, onReps, onGone });
  useEffect(() => {
    live.current = { onRegion, onReps, onGone };
  }, [onRegion, onReps, onGone]);

  useEffect(() => {
    if (!enabled) return;
    let socket: Socket | null = null;
    let alive = true;
    void rtRoute().then((route) => {
      if (!alive) return;
      const key = readDeviceKey();
      socket = io(route.socketUrl, {
        path: route.socketPath,
        // socket.io drops a trailing slash from `path` and adds one back only with this on (the proxy needs none).
        ...(route.pollingOnly ? { transports: ["polling"], addTrailingSlash: false } : {}),
        auth: { key, route: route.name },
        withCredentials: false,
        reconnectionDelay: 500,
        reconnectionDelayMax: 2000,
      });
      socket.on("connect", () => setOffline(false));
      socket.on("disconnect", () => setOffline(true));
      socket.on("connect_error", (err) => {
        if (err.message === "no_guardian") {
          if (key) clearDeviceKeyIfStill(key);
          live.current.onGone();
          return;
        }
        setOffline(true);
      });
      socket.on("region", (m: RegionMessage) => live.current.onRegion(m));
      socket.on("reps", (m: RepsMessage) => live.current.onReps(m));
    });
    return () => {
      alive = false;
      socket?.disconnect();
    };
  }, [enabled]);

  return { offline: enabled && offline };
}
