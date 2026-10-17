import { useEffect, useState } from "react";
import { edition } from "../edition";
import { liveGrantId, participate } from "../identity/participation";

/**
 * Who can use what, and what you have agreed to.
 *
 * Two servers, neither of them Zo's. The collective's own address holds the grid
 * (`edition.access`, infra/services/access): roles, who holds them, a level per
 * plugin per role, and signed proposals to change it. The door holds consent
 * (`edition.signIn.pair` → consents), read from the records it already keeps.
 *
 * A change is never made here. It is proposed, signed with the participation key
 * so the proposal is the member's own, and decided by whoever the collective's
 * stage says decides (its operator while incubated).
 */

export type Level = "none" | "see" | "join" | "run";
export const LEVEL_LABEL: Record<Level, string> = { none: "No access", see: "See", join: "Take part", run: "Run" };
export const LEVEL_LINE: Record<Level, string> = {
  none: "doesn't see it",
  see: "reads, can't change anything",
  join: "posts, joins, contributes",
  run: "sets it up and approves",
};
export const LEVELS: Level[] = ["none", "see", "join", "run"];

export type AccessRole = { id: string; name: string; line: string; rank: number | null; holders: number | null; default: boolean };
export type Proposal = { id: string; what: string; why: string; by: string; at: string; status: "waiting" | "approved" | "declined"; note: string | null; decidedBy: string | null };
export type AccessGrid = {
  stage: string;
  approvers: string;
  line: string;
  roles: AccessRole[];
  plugins: Record<string, Record<string, Level>>;
  elsewhere: Record<string, string>;
  proposals: Proposal[];
};
export type MyAccess = {
  userId: string;
  name: string;
  roles: string[];
  levels: Record<string, Level>;
  approver: boolean;
  people: { userId: string; roles: string[] }[] | null;
  proposals: Proposal[] | null;
};
export type Consents = {
  agreement: { accepted: { version: string; at: string; surface: string } | null; current: string; upToDate: boolean; history: { version: string; at: string; surface: string }[] };
  weekly: { email: string | null; on: boolean; confirmed: boolean; at: string | null };
  checkins: { live: { id: string; exp: number } | null; ever: number };
  calls: { count: number; withdrawn: number } | null;
};

const base = edition.access?.base ?? null;
export const accessSupported = !!base;

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `The server answered ${r.status}.`);
  return j as T;
}

export function useAccess(session: string | null | undefined, n = 0) {
  const [grid, setGrid] = useState<AccessGrid | null>(null);
  const [me, setMe] = useState<MyAccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!base) return;
    let live = true;
    fetch(`${base}/api/access`, { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`The server answered ${r.status}.`))))
      .then((g) => live && setGrid(g))
      .catch((e) => live && setError(e.message));
    if (session)
      post<MyAccess>(`${base}/api/access/me`, { session })
        .then((m) => live && setMe(m))
        .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [session, n]);
  return { grid, me, error };
}

export function useConsents(session: string | null | undefined, n = 0) {
  const [c, setC] = useState<Consents | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!session) return;
    let live = true;
    post<Consents>(`${edition.signIn.pair}/consents`, { session })
      .then((x) => live && setC(x))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [session, n]);
  return { consents: c, error };
}

export const setWeekly = (session: string, on: boolean) => post(`${edition.signIn.pair}/consent-set`, { session, what: "weekly", on });

export type Draft =
  | { what: "level"; plugin: string; role: string; level: Level; why: string }
  | { what: "role"; person: string; role: string; add: boolean; why: string };

const b64u = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
/** The change's id, computed the way infra/services/access/access.ts computes it. */
async function changeId(c: Record<string, unknown>): Promise<string> {
  const sorted = "{" + Object.keys(c).sort().map((k) => JSON.stringify(k) + ":" + JSON.stringify(c[k])).join(",") + "}";
  return b64u(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sorted))).slice(0, 22);
}

export type ProposeResult = { ok: true; what: string; already?: boolean } | { ok: false; needsCheckIns?: boolean; error: string };

/** Sign a proposed change with the check-in key and file it with the collective. */
export async function propose(d: Draft): Promise<ProposeResult> {
  if (!base) return { ok: false, error: `${edition.instance.name} has no address for this yet.` };
  const change = { v: 1, collective: edition.instance.slug, on: new Date().toISOString().slice(0, 10), ...d, why: d.why.trim() };
  const id = await changeId(change);
  const r = await participate("access", `access:${id}`);
  if (r.status === "needs-approval") return { ok: false, needsCheckIns: true, error: "Changes are signed with your check-in key, and check-ins are off on this computer." };
  if (r.status === "unsupported") return { ok: false, error: `${edition.instance.name}'s sign-in cannot sign changes yet.` };
  if (r.status === "failed") return { ok: false, error: r.error };
  try {
    const j = await post<{ ok: boolean; what: string; already?: boolean }>(`${base}/api/access/propose`, { change, grantId: liveGrantId() });
    return { ok: true, what: j.what, already: j.already };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}
