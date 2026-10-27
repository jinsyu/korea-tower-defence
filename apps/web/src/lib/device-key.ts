// The only thing this device keeps about me: the device key (spec "기기에 저장"). Progress lives on the server.
// The storage name carries a version so a later format can live next to this one.

const STORAGE_KEY = "ktd.v1.deviceKey";

export function readDeviceKey(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveDeviceKey(key: string): void {
  window.localStorage.setItem(STORAGE_KEY, key);
}

/** Drop `key` only if it is still the stored one: a late answer about an old key must not erase a newer key. */
export function clearDeviceKeyIfStill(key: string): void {
  if (readDeviceKey() === key) clearDeviceKey();
}

export function clearDeviceKey(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable: nothing was kept.
  }
}
