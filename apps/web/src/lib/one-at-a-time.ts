/**
 * Runs `task` only when the previous run has finished; a call while one is in flight is dropped (returns false).
 * The my-guardian picks use it so the server gets one change at a time and the last reply is the last pick.
 */
export function oneAtATime<A extends unknown[]>(task: (...args: A) => Promise<void>): (...args: A) => Promise<boolean> {
  let busy = false;
  return async (...args) => {
    if (busy) return false;
    busy = true;
    try {
      await task(...args);
      return true;
    } finally {
      busy = false;
    }
  };
}
