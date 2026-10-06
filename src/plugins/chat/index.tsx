import { useEffect, useRef, useState } from "react";
import {
  MessageSquare,
  Hash,
  Send,
  Loader2,
  LogIn,
  Settings,
  KeyRound,
  LogOut,
} from "lucide-react";
import type { MurmurPlugin, PluginContext } from "../../host/types";

/**
 * Chat plugin — Matrix.
 *
 * matrix-js-sdk is lazy-imported on first use so the rest of the host renders
 * even if the SDK has browser-build quirks. v0.1 runs without e2ee (no olm /
 * rust-crypto), so it speaks plaintext rooms; encrypted rooms show a notice.
 * Federation between Decent instances rides on Matrix rooms, which is what the
 * `network` plugin builds on.
 */

interface RoomLite {
  id: string;
  name: string;
  unread: number;
}
interface EventLite {
  id: string;
  sender: string;
  body: string;
  ts: number;
  mine: boolean;
}

const SESSION_KEY = "murmur.matrix.session.v1";

function Panel({ instance, identity }: PluginContext) {
  const [client, setClient] = useState<any>(null);
  const [phase, setPhase] = useState<"loggedout" | "connecting" | "ready">(
    "loggedout",
  );
  const [error, setError] = useState<string | null>(null);

  const [hs, setHs] = useState(instance.matrixHomeserver);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");

  const [rooms, setRooms] = useState<RoomLite[]>([]);
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [events, setEvents] = useState<EventLite[]>([]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Account view (in-app self-management — built for users who never touch Element).
  const [view, setView] = useState<"chat" | "account">("chat");
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Restore a persisted session on mount.
  useEffect(() => {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      try {
        const s = JSON.parse(raw);
        void start({ baseUrl: s.baseUrl, accessToken: s.accessToken, userId: s.userId });
      } catch {
        /* ignore */
      }
    }
    return () => {
      try {
        client?.stopClient?.();
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [events]);

  async function start(creds: { baseUrl: string; accessToken: string; userId: string }) {
    setPhase("connecting");
    setError(null);
    try {
      const sdk: any = await import("matrix-js-sdk");
      const c = sdk.createClient({
        baseUrl: creds.baseUrl,
        accessToken: creds.accessToken,
        userId: creds.userId,
      });

      c.on(sdk.ClientEvent.Sync, (state: string) => {
        if (state === "PREPARED") {
          setPhase("ready");
          refreshRooms(c, sdk);
        }
      });
      c.on(sdk.RoomEvent.Timeline, () => refreshRooms(c, sdk));

      await c.startClient({ initialSyncLimit: 30 });
      setClient(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : "matrix connect failed");
      setPhase("loggedout");
    }
  }

  function refreshRooms(c: any, sdk: any) {
    const list: RoomLite[] = c
      .getRooms()
      .map((r: any) => ({
        id: r.roomId,
        name: r.name || r.roomId,
        unread: r.getUnreadNotificationCount?.() ?? 0,
      }))
      .sort((a: RoomLite, b: RoomLite) => a.name.localeCompare(b.name));
    setRooms(list);
    setActiveRoom((prev) => prev ?? list[0]?.id ?? null);
  }

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    setPhase("connecting");
    setError(null);
    try {
      const sdk: any = await import("matrix-js-sdk");
      const tmp = sdk.createClient({ baseUrl: hs });
      const res = await tmp.login("m.login.password", {
        user: user.replace(/^@/, "").split(":")[0],
        password: pass,
      });
      const session = {
        baseUrl: hs,
        accessToken: res.access_token,
        userId: res.user_id,
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      await start(session);
    } catch (e) {
      setError(e instanceof Error ? e.message : "login failed");
      setPhase("loggedout");
    }
  }

  // Load timeline when active room changes.
  useEffect(() => {
    if (!client || !activeRoom) return;
    let cancelled = false;
    (async () => {
      const sdk: any = await import("matrix-js-sdk");
      const room = client.getRoom(activeRoom);
      if (!room) return;
      const me = client.getUserId();
      const tl: EventLite[] = room
        .getLiveTimeline()
        .getEvents()
        .filter((ev: any) => ev.getType() === "m.room.message")
        .map((ev: any) => ({
          id: ev.getId(),
          sender: ev.getSender(),
          body: ev.getContent()?.body ?? "",
          ts: ev.getTs(),
          mine: ev.getSender() === me,
        }));
      if (!cancelled) setEvents(tl);

      const onTl = (ev: any, r: any) => {
        if (r?.roomId !== activeRoom) return;
        if (ev.getType() !== "m.room.message") return;
        setEvents((prev) => [
          ...prev,
          {
            id: ev.getId(),
            sender: ev.getSender(),
            body: ev.getContent()?.body ?? "",
            ts: ev.getTs(),
            mine: ev.getSender() === me,
          },
        ]);
      };
      client.on(sdk.RoomEvent.Timeline, onTl);
      return () => client.off(sdk.RoomEvent.Timeline, onTl);
    })();
    return () => {
      cancelled = true;
    };
  }, [client, activeRoom]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !client || !activeRoom) return;
    setDraft("");
    try {
      await client.sendTextMessage(activeRoom, body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "send failed");
    }
  }

  // Change the account password via Matrix user-interactive auth: an unauthed
  // POST returns a UIA `session`, which we complete with the current password.
  async function changePassword(current: string, next: string): Promise<void> {
    const baseUrl: string = client.baseUrl;
    const token: string = client.getAccessToken();
    const userId: string = client.getUserId();
    const url = `${baseUrl}/_matrix/client/v3/account/password`;
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };

    const res1 = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ new_password: next, logout_devices: false }),
    });
    if (res1.ok) return; // server accepted without a challenge
    if (res1.status !== 401) {
      const e = await res1.json().catch(() => ({}));
      throw new Error(e.error || `unexpected response (${res1.status})`);
    }
    const uia = await res1.json();

    const res2 = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        new_password: next,
        logout_devices: false,
        auth: {
          type: "m.login.password",
          identifier: { type: "m.id.user", user: userId },
          password: current,
          session: uia.session,
        },
      }),
    });
    if (!res2.ok) {
      const e = await res2.json().catch(() => ({}));
      if (res2.status === 401 || res2.status === 403) {
        throw new Error("Current password is incorrect.");
      }
      throw new Error(e.error || `change failed (${res2.status})`);
    }
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    if (newPw.length < 8) {
      setPwMsg({ kind: "err", text: "New password must be at least 8 characters." });
      return;
    }
    if (newPw !== confirmPw) {
      setPwMsg({ kind: "err", text: "New passwords don't match." });
      return;
    }
    setPwBusy(true);
    try {
      await changePassword(curPw, newPw);
      setPwMsg({ kind: "ok", text: "Password changed." });
      setCurPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (err) {
      setPwMsg({ kind: "err", text: err instanceof Error ? err.message : "change failed" });
    } finally {
      setPwBusy(false);
    }
  }

  async function signOut() {
    try {
      await client?.logout?.();
    } catch {
      /* token may already be invalid — clear locally regardless */
    }
    try {
      client?.stopClient?.();
    } catch {
      /* ignore */
    }
    localStorage.removeItem(SESSION_KEY);
    setClient(null);
    setRooms([]);
    setEvents([]);
    setActiveRoom(null);
    setView("chat");
    setPass("");
    setCurPw("");
    setNewPw("");
    setConfirmPw("");
    setPwMsg(null);
    setError(null);
    setPhase("loggedout");
  }

  // ── Logged-out: login form ───────────────────────────────────────
  if (phase !== "ready") {
    return (
      <div className="flex h-full flex-col">
        <Header />
        <div className="flex flex-1 items-center justify-center px-8">
          <form
            onSubmit={doLogin}
            className="w-full max-w-sm rounded-[var(--radius)] border border-[var(--line)] bg-[var(--card)] p-6"
          >
            <div className="font-tight text-lg font-medium">Connect to Matrix</div>
            <p className="mt-1 text-sm text-[var(--muted)]">
              The chat substrate for {instance.name}.
            </p>
            <div className="mt-5 flex flex-col gap-3">
              <Field label="Homeserver">
                <input
                  value={hs}
                  onChange={(e) => setHs(e.target.value)}
                  className="w-full bg-transparent text-sm outline-none"
                  placeholder="https://matrix.org"
                />
              </Field>
              <Field label="Username">
                <input
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  className="w-full bg-transparent text-sm outline-none"
                  placeholder="alice"
                />
              </Field>
              <Field label="Password">
                <input
                  type="password"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  className="w-full bg-transparent text-sm outline-none"
                  placeholder="••••••••"
                />
              </Field>
            </div>
            {error && (
              <div className="mt-3 text-xs text-[#c1271d]">{error}</div>
            )}
            <button
              type="submit"
              disabled={phase === "connecting"}
              className="prism-hover mt-5 flex w-full items-center justify-center gap-2 rounded-[var(--radius)] border border-[var(--line-strong)] py-2.5 text-sm font-medium disabled:opacity-50"
            >
              {phase === "connecting" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> connecting…
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4" /> Sign in
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Ready: rooms + timeline ──────────────────────────────────────
  const activeName = rooms.find((r) => r.id === activeRoom)?.name ?? "";
  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r border-[var(--line)]">
        <div className="border-b border-[var(--line)] px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-[var(--faint)]">
          rooms
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-2">
          {rooms.map((r) => (
            <button
              key={r.id}
              onClick={() => setActiveRoom(r.id)}
              data-active={r.id === activeRoom}
              className="prism-hover flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-[var(--muted)] data-[active=true]:text-[var(--fg)]"
            >
              <Hash className="h-3.5 w-3.5 shrink-0 text-[var(--faint)]" />
              <span className="truncate">{r.name}</span>
              {r.unread > 0 && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#007aff]" />
              )}
            </button>
          ))}
          {rooms.length === 0 && (
            <div className="px-4 py-2 text-xs text-[var(--faint)]">
              No rooms yet.
            </div>
          )}
        </div>
        <div className="border-t border-[var(--line)] p-2">
          <button
            onClick={() => setView(view === "account" ? "chat" : "account")}
            data-active={view === "account"}
            className="prism-hover flex w-full items-center gap-2 rounded-[var(--radius)] px-3 py-2 text-left text-sm text-[var(--muted)] data-[active=true]:text-[var(--fg)]"
          >
            <Settings className="h-3.5 w-3.5 shrink-0 text-[var(--faint)]" />
            <span className="truncate">{shortSender(client?.getUserId?.() ?? "account")}</span>
          </button>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {view === "account" ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--faint)]">
              <Settings className="h-3.5 w-3.5" />
              account
            </div>
            <h1 className="font-tight mt-2 text-2xl font-medium">
              {client?.getUserId?.() ?? "Account"}
            </h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Manage your Decent identity.
            </p>

            <form onSubmit={submitPassword} className="mt-6 w-full max-w-sm">
              <div className="font-tight text-lg font-medium">Change password</div>
              <div className="mt-4 flex flex-col gap-3">
                <Field label="Current password">
                  <input
                    type="password"
                    value={curPw}
                    onChange={(e) => setCurPw(e.target.value)}
                    className="w-full bg-transparent text-sm outline-none"
                    placeholder="••••••••"
                  />
                </Field>
                <Field label="New password">
                  <input
                    type="password"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    className="w-full bg-transparent text-sm outline-none"
                    placeholder="at least 8 characters"
                  />
                </Field>
                <Field label="Confirm new password">
                  <input
                    type="password"
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    className="w-full bg-transparent text-sm outline-none"
                    placeholder="••••••••"
                  />
                </Field>
              </div>
              {pwMsg && (
                <div
                  className="mt-3 text-xs"
                  style={{ color: pwMsg.kind === "ok" ? "#1a7f37" : "#c1271d" }}
                >
                  {pwMsg.text}
                </div>
              )}
              <button
                type="submit"
                disabled={pwBusy}
                className="prism-hover mt-5 flex w-full items-center justify-center gap-2 rounded-[var(--radius)] border border-[var(--line-strong)] py-2.5 text-sm font-medium disabled:opacity-50"
              >
                {pwBusy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> updating…
                  </>
                ) : (
                  <>
                    <KeyRound className="h-4 w-4" /> Change password
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 w-full max-w-sm border-t border-[var(--line)] pt-6">
              <button
                onClick={signOut}
                className="prism-hover flex items-center gap-2 rounded-[var(--radius)] border border-[var(--line-strong)] px-4 py-2.5 text-sm font-medium text-[#c1271d]"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-[var(--line)] px-6 py-3">
              <Hash className="h-4 w-4 text-[var(--faint)]" />
              <span className="font-tight text-sm font-medium">{activeName}</span>
            </div>
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              <div className="flex flex-col gap-3">
                {events.map((ev) => (
                  <div key={ev.id} className="flex flex-col">
                    <div className="flex items-baseline gap-2">
                      <span
                        className="font-mono text-[11px]"
                        style={{ color: ev.mine ? "#007aff" : "var(--faint)" }}
                      >
                        {shortSender(ev.sender)}
                      </span>
                      <span className="font-mono text-[10px] text-[var(--faint)]">
                        {new Date(ev.ts).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="text-[14px] leading-relaxed">{ev.body}</p>
                  </div>
                ))}
              </div>
            </div>
            <form
              onSubmit={send}
              className="prism-hover flex items-center gap-3 border-t border-[var(--line)] px-6 py-3"
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={`Message ${activeName}…`}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--faint)]"
              />
              <button type="submit" className="text-[var(--muted)] hover:text-[var(--fg)]">
                <Send className="h-4 w-4" />
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );

  function Header() {
    return (
      <header className="border-b border-[var(--line)] px-8 pt-7 pb-5">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--faint)]">
          <MessageSquare className="h-3.5 w-3.5" />
          chat
        </div>
        <h1 className="font-tight mt-2 text-2xl font-medium">Conversation</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {identity.handle ? `Signed in as ${identity.handle}. ` : ""}
          Matrix is the live substrate the flock talks over.
        </p>
      </header>
    );
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="prism-hover block rounded-[var(--radius)] border border-[var(--line-strong)] px-3 py-2">
      <span className="font-mono block text-[10px] uppercase tracking-wider text-[var(--faint)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function shortSender(s: string): string {
  return s.replace(/^@/, "").split(":")[0];
}

export const chatPlugin: MurmurPlugin = {
  id: "chat",
  title: "Chat",
  tagline: "Talk over Matrix — the flock's live substrate",
  icon: MessageSquare,
  order: 20,
  kind: "plugin",
  backend: "Matrix homeserver",
  Panel,
};
