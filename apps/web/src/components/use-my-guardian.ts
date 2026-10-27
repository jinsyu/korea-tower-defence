"use client";

import { useCallback, useEffect, useState } from "react";
import { callAsGuardian, type ServerMe } from "@/lib/game-server";
import { meFromServer, meStore } from "@/lib/stage/me-store";

export type MyGuardian =
  | { status: "loading" }
  /** No device key here, or the server does not know it (deleted, cleaned up, made up). */
  | { status: "none" }
  | { status: "offline" }
  | { status: "ready"; me: ServerMe }
  /** Development only: `?demo=` mockup demos run on the fake guardian without a game server. */
  | { status: "demo" };

const devDemo = () => process.env.NODE_ENV !== "production" && new URLSearchParams(window.location.search).has("demo");

/** Asks the server who this device's key belongs to. An unknown key is dropped quietly (D6). */
async function fetchMyGuardian(): Promise<MyGuardian> {
  if (devDemo()) return { status: "demo" };
  const res = await callAsGuardian<{ me: ServerMe }>("/me");
  if (res.ok) {
    meStore.set(meFromServer(res.data.me));
    return { status: "ready", me: res.data.me };
  }
  return { status: res.status === 401 ? "none" : "offline" };
}

export function useMyGuardian() {
  const [state, setState] = useState<MyGuardian>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    void fetchMyGuardian().then((next) => alive && setState(next));
    return () => {
      alive = false;
    };
  }, [attempt]);

  const reload = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  /** After a change the server answered with my new state. */
  const update = useCallback((me: ServerMe) => {
    meStore.set(meFromServer(me));
    setState((s) => (s.status === "ready" ? { ...s, me } : s));
  }, []);

  return { guardian: state, reload, update };
}
