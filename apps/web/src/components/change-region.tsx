"use client";

import { josa } from "@ktd/core";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RegionPicker } from "@/components/korea-map/region-picker";
import { callAsGuardian, dayLabel, OFFLINE_TEXT } from "@/lib/game-server";

/** Region change from the info screen. The server checks the 24-hour and 30-day rule (D7). */
export function ChangeRegion() {
  const router = useRouter();
  const [note, setNote] = useState<string | null>("바꿀 지역을 골라요 · 내 기록은 그대로 따라가요");
  const [busy, setBusy] = useState(false);

  const pick = async ({ code, name }: { code: string; name: string }) => {
    setBusy(true);
    const res = await callAsGuardian("/me/region", { method: "POST", body: { region: code } });
    setBusy(false);
    if (res.ok) {
      setNote(`${josa(name, "으로")} 바꿨어요`);
      router.push("/info#mine");
    } else if (res.status === 401) {
      router.replace("/");
    } else if (res.data.error === "region_locked") {
      setNote(`지금은 바꿀 수 없어요 · 다음에 바꿀 수 있는 날: ${dayLabel(String(res.data.nextOn))}`);
    } else if (res.data.error === "same_region") {
      setNote(`${josa(name, "은")} 지금 지키는 지역이에요`);
    } else {
      setNote(res.status === 0 ? OFFLINE_TEXT : "바꾸지 못했어요. 다시 해 주세요.");
    }
  };

  return <RegionPicker onPick={(r) => void pick(r)} note={note} busy={busy} />;
}
