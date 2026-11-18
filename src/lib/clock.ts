/** Estimated (server time - local time) in ms. Clients measure it once from a server timestamp. */
let offsetMs = 0;
const listeners = new Set<() => void>();

export function setServerOffset(ms: number) {
  if (!Number.isFinite(ms)) return;
  offsetMs = ms;
  listeners.forEach((l) => l());
}

export function serverNow(): number {
  return Date.now() + offsetMs;
}

/** offset = serverTs - midpoint of the local request window. */
export function offsetFrom(serverMs: number, localStart: number, localEnd: number): number {
  return serverMs - (localStart + localEnd) / 2;
}
