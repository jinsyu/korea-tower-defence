"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { readDeviceKey } from "@/lib/device-key";

/** A device with a key goes straight to the defence screen (spec "첫 화면"). /play checks the key with the server. */
export function HomeRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (readDeviceKey()) router.replace("/play");
  }, [router]);
  return null;
}
