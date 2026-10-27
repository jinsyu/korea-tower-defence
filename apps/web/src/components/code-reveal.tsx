"use client";

import type { RecoveryCode } from "@ktd/core";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CodeTiles } from "@/components/code-tiles";
import { useStartFlow } from "@/components/start-flow";

/**
 * The code the server just made, shown this once (D4). Keyed by the issue id: the router keeps pages alive
 * (cacheComponents), so a code screen left from an earlier guardian must start over when a new code is issued,
 * while coming back to the same issue shows nothing and moves on.
 */
export function CodeReveal() {
  const { issuedId } = useStartFlow();
  return <IssuedCode key={issuedId} id={issuedId} />;
}

function IssuedCode({ id }: { id: number }) {
  const { codeHandoff } = useStartFlow();
  const [code] = useState<RecoveryCode | null>(() => codeHandoff.peek(id));
  const [left, setLeft] = useState(false);
  const leaving = useRef(false);
  const router = useRouter();

  useEffect(() => {
    // A mount right after an unmount in the same task (React's development double mount) is not leaving.
    leaving.current = false;
    codeHandoff.take(id);
    if (!code || left) {
      router.replace("/play");
      return;
    }
    // Leaving the screen hides this issue's code for good, even if the router keeps the screen alive for "back".
    return () => {
      leaving.current = true;
      queueMicrotask(() => {
        if (leaving.current) setLeft(true);
      });
    };
  }, [id, code, left, codeHandoff, router]);

  return code && !left ? <CodeTiles code={code} /> : <div className="min-h-18 wide:min-h-30" aria-hidden="true" />;
}
