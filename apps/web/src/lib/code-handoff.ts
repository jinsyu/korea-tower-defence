import type { RecoveryCode } from "@ktd/core";

// Hands a freshly made recovery code to the code screen, once per issue (D4). Every issue gets a new id; the code
// screen is keyed by that id, so a kept-alive code screen from an earlier guardian starts over for a new code.

export type CodeHandoff = {
  /** A new code from the server; returns its issue id. */
  issue: (code: RecoveryCode) => number;
  /** The code of issue `id` if it has not been taken yet. */
  peek: (id: number) => RecoveryCode | null;
  /** The code screen has it: nobody gets it again. */
  take: (id: number) => void;
};

export function createCodeHandoff(): CodeHandoff {
  let current: { id: number; code: RecoveryCode | null } | null = null;
  let lastId = 0;
  return {
    issue: (code) => {
      current = { id: ++lastId, code };
      return lastId;
    },
    peek: (id) => (current?.id === id ? current.code : null),
    take: (id) => {
      if (current?.id === id) current = { id, code: null };
    },
  };
}
