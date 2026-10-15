import { useSyncExternalStore } from "react";
import { edition } from "../edition";
import { openInBrowser } from "../identity/passkey";
import { appSecret } from "./secrets";
import { sampleMe, sampleOps } from "../demo/sample";
import { demoNote } from "../demo/note";

/**
 * The connection to this edition's operations console (infra/services/ops-console),
 * shared by the Operations and Files plugins and shown in Settings.
 *
 * The console is owner-only and locked with its own passkey, which lives in the
 * browser at the console's host. So the app asks for a pairing code, opens
 * /ops/link?code=… there, and polls until the owner approves it with that
 * passkey. What comes back is a read-only token for seven days, kept in the
 * system's secure store. Anything that acts is still approved in the browser.
 *
 * proposeChange() is how the app changes something without the token acting:
 * it sends a draft, opens /ops/approve?d=… in the browser and polls until the
 * owner taps (or declines) there. Placing an edition is the first change.
 */
export interface OpsMe {
  signedIn: boolean;
  /** An investor's sign-in opens their investor room only: what they hold, the documents, and anything to sign. */
  role?: "owner" | "investor" | null;
  who: { handle: string; name: string } | null;
  brand: string;
  company: string;
  views: { accounts?: boolean; position?: boolean; shares?: boolean; raise?: boolean; incubation?: boolean; files?: boolean; investor?: boolean };
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

// A demo edition reads the template in src/demo/sample.ts, not a console.
const demo = !!edition.demo;

let state: State = demo ? { kind: "ready", me: sampleMe } : base ? { kind: "loading" } : { kind: "unavailable" };
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
  if (demo) return sampleOps(path) as T;
  const r = await call(path);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new OpsError(j.error || `The console answered ${r.status}`, r.status);
  return j as T;
}

/**
 * An investor signs what rich has issued to them: their statement or their agreement. The one
 * write an investor's token has, and only for their own room (the console's appGate).
 */
export async function investorSign(body: Record<string, unknown>): Promise<{ ok: true; message: string }> {
  if (demo) {
    demoNote("In your own app this signs the document, with your typed name as your signature.");
    throw new OpsError("Not signed: this is a demo.", 400);
  }
  const r = await call("/api/ops/investor/sign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new OpsError(j.error || `The console answered ${r.status}`, r.status);
  return j;
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
  if (!base || demo) return;
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
  if (demo) return demoNote("In your own app this signs this computer out of the operations console.");
  if (token) await call("/api/ops/app/signout", { method: "POST" }).catch(() => {});
  token = null;
  await appSecret.delete(TOKEN).catch(() => {});
  set({ kind: "signed-out" });
}

export type Proposal = { status: "approved" | "declined" | "failed" | "expired" | "stopped"; error?: string };

/**
 * Draft a change here, approve it in the browser. Resolves when the owner has
 * tapped, declined, or the draft has run out (ten minutes). `onOpen` hands back
 * the approval page so it can be opened again; `stop` ends the wait (the draft
 * then simply runs out on the console).
 */
export async function proposeChange(
  kind: "incubation.place",
  target: string,
  change: Record<string, unknown>,
  opts: { onOpen?: (url: string) => void; stop?: AbortSignal } = {},
): Promise<Proposal> {
  if (demo) {
    demoNote("In your own app this opens the change in your browser, where one passkey tap writes it.");
    return { status: "stopped" };
  }
  const r = await call("/api/ops/app/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, target, change }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new OpsError(j.error || `The console answered ${r.status}`, r.status);
  const url = `${base}${j.url}`;
  opts.onOpen?.(url);
  await openInBrowser(url);
  const deadline = Date.now() + (Number(j.expiresIn) || 600) * 1000;
  while (Date.now() < deadline) {
    await new Promise((res) => setTimeout(res, 2000));
    if (opts.stop?.aborted) return { status: "stopped" };
    try {
      const p = await opsGet<{ status: string; error?: string }>(`/api/ops/app/draft/${j.id}`);
      if (p.status !== "pending") return p as Proposal;
    } catch (e) {
      if (e instanceof OpsError && e.status === 401) return { status: "failed", error: "The console's sign-in ran out." };
      /* a dropped request is not a refusal: keep waiting */
    }
  }
  return { status: "expired" };
}

/** Open a page of the console itself, in the browser, where actions are approved. */
export const openConsole = (path = "/ops") =>
  demo
    ? demoNote("In your own app this opens the operations console in your browser, where changes are made and approved with your passkey.")
    : base && openInBrowser(`${base}${path}`);

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
