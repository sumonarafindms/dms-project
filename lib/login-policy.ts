export const MAX_LOGIN_FAILURES = 5;
export const LOGIN_LOCK_MINUTES = 15;

export function nextLoginFailure(currentFailures: number, nowMs = Date.now()) {
  const failedCount = Math.max(0, currentFailures) + 1;
  const lockedUntil = failedCount >= MAX_LOGIN_FAILURES ? new Date(nowMs + LOGIN_LOCK_MINUTES * 60_000) : null;
  return { failedCount, lockedUntil };
}
