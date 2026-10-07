/**
 * Secrets and API keys, kept in the system's own secure store.
 *
 * In the desktop app every value goes to the macOS Keychain (or Windows
 * Credential Manager) through the secret_* commands in src-tauri/src/lib.rs,
 * filed under the edition's bundle id. The webview never stores a value: only
 * the list of names sits in localStorage, so Settings can show what is saved
 * without reading anything back.
 *
 * In a plain browser (dev) there is no secure store, so values live in memory
 * for the session and are gone on reload. `persistent` says which.
 */
const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const persistent = isTauri;

const INDEX = "murmur.secrets.v1";
const memory = new Map<string, string>();

export interface SecretMeta {
  name: string;
  /** what it is for, in the member's own words */
  note?: string;
  savedAt: string;
}

async function invoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

async function rawSet(name: string, value: string) {
  if (isTauri) await invoke("secret_set", { name, value });
  else memory.set(name, value);
}

/** Read a value. Plugins call this; Settings never does. */
export async function getSecret(name: string): Promise<string | null> {
  if (isTauri) return invoke<string | null>("secret_get", { name });
  return memory.get(name) ?? null;
}

async function rawDelete(name: string) {
  if (isTauri) await invoke("secret_delete", { name });
  else memory.delete(name);
}

// ── the member's own keys, listed in Settings ───────────────────────────────

// Without a secure store the values die with the page, so the names do too.
let memoryIndex: SecretMeta[] = [];

export function listSecrets(): SecretMeta[] {
  if (!persistent) return memoryIndex;
  try {
    return JSON.parse(localStorage.getItem(INDEX) || "[]");
  } catch {
    return [];
  }
}

function saveIndex(list: SecretMeta[]) {
  if (persistent) localStorage.setItem(INDEX, JSON.stringify(list));
  else memoryIndex = list;
  window.dispatchEvent(new Event("murmur:secrets"));
}

export const validName = (n: string) => /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(n);

export async function saveSecret(name: string, value: string, note?: string) {
  if (!validName(name)) throw new Error("Use letters, numbers, dots, dashes or underscores, starting with a letter.");
  if (!value) throw new Error("There is no value to save.");
  await rawSet(name, value);
  const rest = listSecrets().filter((s) => s.name !== name);
  saveIndex([...rest, { name, note: note?.trim() || undefined, savedAt: new Date().toISOString() }].sort((a, b) => a.name.localeCompare(b.name)));
}

export async function deleteSecret(name: string) {
  await rawDelete(name);
  saveIndex(listSecrets().filter((s) => s.name !== name));
}

// ── the app's own credentials (sign-ins), never listed ──────────────────────

// The app is ad-hoc code-signed, so to macOS every update is a different app.
// Reading a Keychain item an earlier build wrote makes macOS ask for the login
// password, a box that looks like a scam. So the app's own sign-ins are filed
// under the build that wrote them: a new build never touches an old item, finds
// nothing, and asks for a passkey tap instead. The old items are left alone,
// since deleting one would raise the same box.
let build: Promise<string> | null = null;
function buildTag(): Promise<string> {
  build ??= isTauri
    ? import("@tauri-apps/api/app").then(({ getVersion }) => getVersion()).catch(() => "unknown")
    : Promise.resolve("dev");
  return build;
}
const appName = async (name: string) => `app.${await buildTag()}.${name}`;

/** For tokens the app holds for itself, such as the operations sign-in. */
export const appSecret = {
  get: async (name: string) => getSecret(await appName(name)),
  set: async (name: string, value: string) => rawSet(await appName(name), value),
  delete: async (name: string) => rawDelete(await appName(name)),
};
