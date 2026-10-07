import { useSyncExternalStore } from "react";
import { edition } from "../edition";
import { openInBrowser } from "../identity/passkey";
import { appSecret } from "./secrets";

/**
 * The connection to this edition's operations console (infra/services/ops-console),
 * shared by the Operations and Files plugins and shown in Settings.
 *
 * The console is owner-only and locked with its own passkey, which lives in the
 * browser at the console's host. So the app asks for a pairing code, opens
 * /ops/link?code=… there, and polls until the owner approves it with that
 * passkey. What comes back is a read-only token for seven days, kept in the
 * system's secure store. Anything that acts is still approved in the browser.
 */
export interface OpsMe {
  signedIn: boolean;
  who: { handle: string; name: string } | null;
  brand: string;
  company: string;
  views: { accounts: boolean; position: boolean; shares: boolean; raise: boolean; files: boolean };
}

type State =
  | { kind: "unavailable" }
  | { kind: "loading" }
  | { kind: "signed-out"; error?: string }
  | { kind: "pairing"; code: string; url: string }
  | { kind: "ready"; me: OpsMe };

// VITE_OPS_BASE points a dev build at a local console (see infra/services/ops-console/test/app-e2e.ts).
const base = (import.meta.env.VITE_OPS_BASE as string | undefined) ?? edition.ops?.base ?? null;
const TOKEN = `ops.${edition.id}`;

let state: State = base ? { kind: "loading" } : { kind: "unavailable" };
let token: string | null = null;
let cancelPairing: (() => void) | null = null;
const listeners = new Set<() => void>();
const set = (s: State) => {
  state = s;
  listeners.forEach((l) => l());
};

export class OpsError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  if (!base) throw new OpsError("This edition has no operations console.", 404);
  const headers: Record<string, string> = { Accept: "application/json", ...(init.headers as Record<string, string>) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${base}${path}`, { ...init, headers });
  if (r.status === 401 && token) {
    // Expired or revoked: forget it and ask again.
    token = null;
    await appSecret.delete(TOKEN).catch(() => {});
    set({ kind: "signed-out", error: "The console's sign-in ran out. Sign in again." });
  }
  return r;
}

/** GET a JSON view from the console. */
export async function opsGet<T>(path: string): Promise<T> {
  const r = await call(path);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new OpsError(j.error || `The console answered ${r.status}`, r.status);
  return j as T;
}

/** GET raw bytes (a file) from the console. */
export async function opsBlob(path: string): Promise<Blob> {
  const r = await call(path);
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new OpsError(j.error || `The console answered ${r.status}`, r.status);
  }
  return r.blob();
}

async function refresh() {
  if (!base) return;
  if (!token) token = await appSecret.get(TOKEN).catch(() => null);
  if (!token) return set({ kind: "signed-out" });
  try {
    const me = await opsGet<OpsMe>("/api/ops/me");
    set(me.signedIn ? { kind: "ready", me } : { kind: "signed-out" });
  } catch (e) {
    if (state.kind !== "signed-out") set({ kind: "signed-out", error: (e as Error).message });
  }
}

function device() {
  const ua = navigator.userAgent;
  return /Mac/.test(ua) ? "a Mac" : /Windows/.test(ua) ? "a Windows PC" : /Linux/.test(ua) ? "a Linux computer" : "a computer";
}

async function post(path: string, body: unknown) {
  const r = await fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `The console answered ${r.status}`);
  return j;
}

/** Ask for a code, open the approval page in the browser, wait for the owner's tap. */
export async function signInToOps() {
  if (!base) return;
  cancelPairing?.();
  try {
    const { code, secret, expiresIn } = await post("/api/ops/app/pair/start", { device: device() });
    const url = `${base}/ops/link?code=${encodeURIComponent(code)}`;
    set({ kind: "pairing", code, url });
    await openInBrowser(url);
    let stopped = false;
    cancelPairing = () => {
      stopped = true;
    };
    const deadline = Date.now() + (Number(expiresIn) || 600) * 1000;
    while (!stopped && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000));
      if (stopped) break;
      try {
        const r = await post("/api/ops/app/pair/poll", { code, secret });
        if (r.status === "approved" && r.token) {
          token = r.token;
          await appSecret.set(TOKEN, r.token);
          cancelPairing = null;
          return refresh();
        }
        if (r.status === "expired") break;
      } catch {
        /* a dropped request is not a refusal: keep waiting */
      }
    }
    if (!stopped) set({ kind: "signed-out", error: "The code ran out. Try again." });
  } catch (e) {
    set({ kind: "signed-out", error: (e as Error).message });
  }
}

export function cancelOpsSignIn() {
  cancelPairing?.();
  cancelPairing = null;
  set({ kind: "signed-out" });
}

export async function signOutOfOps() {
  if (token) await call("/api/ops/app/signout", { method: "POST" }).catch(() => {});
  token = null;
  await appSecret.delete(TOKEN).catch(() => {});
  set({ kind: "signed-out" });
}

/** Open a page of the console itself, in the browser, where actions are approved. */
export const openConsole = (path = "/ops") => base && openInBrowser(`${base}${path}`);

let started = false;
export function useOps(): State {
  if (!started) {
    started = true;
    void refresh();
  }
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}
