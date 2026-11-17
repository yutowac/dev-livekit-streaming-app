const KEY = "live-donation-device-id";

export function getOrCreateDeviceId(): string {
  const existing = localStorage.getItem(KEY);
  if (existing) return existing;
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(KEY, id);
  return id;
}
