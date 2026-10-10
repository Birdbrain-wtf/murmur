import { useCallback, useEffect, useRef, useState } from "react";
import {
  MessageSquare,
  Hash,
  Send,
  Settings,
  LogOut,
  Fingerprint,
  UserRound,
  Link2,
  Phone,
  Video,
} from "lucide-react";
import type { MurmurPlugin, PluginContext } from "../../host/types";
import { edition, groupWord } from "../../edition";
import {
  Page,
  PageHeader,
  PageBody,
  Section,
  Eyebrow,
  Gate,
  inputClass,
  Button,
  Notice,
  Dot,
} from "../../ui";
import { participate, today } from "../../identity/participation";
import { CallStage, joinCall, leaveCall, useCallers, type CallState } from "./call";

/**
 * Chat plugin — Matrix.
 *
 * Signing in is the passkey. The app hands its session to the door that issued
 * it (`<signIn.pair>/matrix`), which makes the member's account on their
 * collective's own homeserver, seats them in the members room and returns a
 * per-member token. There is no Matrix password to know, so there is no
 * password form and no password to change. Someone in two collectives has one
 * account in each edition, all opened by the same passkey. A member who already
 * uses Matrix elsewhere can have that address invited too (`<signIn.pair>/matrix-link`).
 * Server side: infra/services/chaos-auth/matrix-members.ts.
 *
 * matrix-js-sdk is lazy-imported on first use so the rest of the host renders
 * even if the SDK has browser-build quirks. v0.1 runs without e2ee (no olm /
 * rust-crypto), so it speaks plaintext rooms; encrypted rooms show a notice.
 * Federation between Decent instances rides on Matrix rooms, which is what the
 * `network` plugin builds on. Voice and video calls in a room: ./call.tsx.
 */

interface RoomLite {
  id: string;
  name: string;
  unread: number;
  /** someone has invited this account and it has not joined yet */
  invited: boolean;
}

// A Matrix address: @name:server.
const MXID = /^@[^:\s]+:[^\s]+$/;
interface EventLite {
  id: string;
  sender: string;
  body: string;
  ts: number;
  mine: boolean;
  /** shown the moment it is sent, before the server has it */
  pending?: boolean;
  txnId?: string;
}

const SESSION_KEY = "murmur.matrix.session.v1";

function Panel({ identity, open }: PluginContext) {
  const [client, setClient] = useState<any>(null);
  const [phase, setPhase] = useState<"loggedout" | "connecting" | "ready">(
    "loggedout",
  );
  const [error, setError] = useState<string | null>(null);

  const [notOpen, setNotOpen] = useState(false);

  const [rooms, setRooms] = useState<RoomLite[]>([]);
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [events, setEvents] = useState<EventLite[]>([]);
  const [draft, setDraft] = useState("");
  const [to, setTo] = useState("");
  const [starting, setStarting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [view, setView] = useState<"chat" | "account">("chat");
  const [elsewhere, setElsewhere] = useState("");
  const [linking, setLinking] = useState(false);
  const [linked, setLinked] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const signedIn = !!(identity.signedIn && identity.session);

  const [call, setCall] = useState<CallState | null>(null);
  const [calling, setCalling] = useState(false);
  const callRef = useRef<CallState | null>(null);
  callRef.current = call;
  const callers = useCallers(phase === "ready" ? client : null, activeRoom);

  // Restore a persisted session on mount, or open chat with the passkey session
  // if there is none yet.
  useEffect(() => {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      try {
        const s = JSON.parse(raw);
        void start({ baseUrl: s.baseUrl, accessToken: s.accessToken, userId: s.userId });
      } catch {
        /* ignore */
      }
    } else if (signedIn) {
      void openWithPasskey();
    }
    return () => {
      // Leaving Chat hangs up, so nobody stays in a call they cannot see.
      const c = callRef.current;
      if (c) void c.live.disconnect();
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
      // Calls name the device they come from, so ask the server which one this token is.
      const who = await fetch(`${creds.baseUrl.replace(/\/$/, "")}/_matrix/client/v3/account/whoami`, {
        headers: { Authorization: `Bearer ${creds.accessToken}`, Accept: "application/json" },
      })
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => ({})) as { device_id?: string };
      const c = sdk.createClient({
        baseUrl: creds.baseUrl,
        accessToken: creds.accessToken,
        userId: creds.userId,
        deviceId: who.device_id,
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
        invited: r.getMyMembership?.() === "invite",
      }))
      .sort((a: RoomLite, b: RoomLite) => a.name.localeCompare(b.name));
    setRooms(list);
    setActiveRoom((prev) => prev ?? list.find((r) => !r.invited)?.id ?? null);
  }

  // Trade the app's passkey session for a chat account on this collective's own
  // server. Idempotent: the door finds the account and the seat if they exist.
  async function openWithPasskey() {
    if (!identity.session) return;
    setPhase("connecting");
    setError(null);
    setNotOpen(false);
    try {
      const r = await fetch(`${edition.signIn.pair}/matrix`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ session: identity.session }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 503 && j.notOpen) {
        setNotOpen(true);
        setPhase("loggedout");
        return;
      }
      if (!r.ok || !j.accessToken) throw new Error(j.error || `Chat did not open (${r.status}).`);
      const session = { baseUrl: j.baseUrl, accessToken: j.accessToken, userId: j.userId };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      await start(session);
      if (j.roomId) setActiveRoom(j.roomId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chat did not open.");
      setPhase("loggedout");
    }
  }

  // Bring an address the member already has elsewhere into the members room.
  // The door invites it; only its owner can accept, so nothing else is checked.
  async function linkElsewhere(e: React.FormEvent) {
    e.preventDefault();
    const mxid = elsewhere.trim();
    if (!identity.session || !MXID.test(mxid)) return;
    setLinking(true);
    setLinkError(null);
    try {
      const r = await fetch(`${edition.signIn.pair}/matrix-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ session: identity.session, mxid }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `The invite did not go (${r.status}).`);
      setLinked(j.invited || mxid);
      setElsewhere("");
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "The invite did not go.");
    } finally {
      setLinking(false);
    }
  }

  // Signing out of the app signs out of chat too, so a shared computer does not
  // stay in the last person's rooms.
  useEffect(() => {
    if (!signedIn && client) void signOut();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  // Load timeline when active room changes.
  useEffect(() => {
    if (!client || !activeRoom) return;
    let cancelled = false;
    let detach: (() => void) | undefined;
    (async () => {
      const sdk: any = await import("matrix-js-sdk");
      if (cancelled) return;
      const room = client.getRoom(activeRoom);
      if (!room) return;
      const me = client.getUserId();
      const lite = (ev: any): EventLite => ({
        id: ev.getId(),
        sender: ev.getSender(),
        body: ev.getContent()?.body ?? "",
        ts: ev.getTs(),
        mine: ev.getSender() === me,
        txnId: ev.getTxnId?.() ?? ev.getUnsigned?.()?.transaction_id,
      });
      setEvents(
        room
          .getLiveTimeline()
          .getEvents()
          .filter((ev: any) => ev.getType() === "m.room.message")
          .map(lite),
      );

      // Our own message is already on screen from send(); when the SDK or the
      // server hands it back, it replaces that line rather than adding another.
      const onTl = (ev: any, r: any) => {
        if (r?.roomId !== activeRoom) return;
        if (ev.getType() !== "m.room.message") return;
        const next = lite(ev);
        setEvents((prev) => {
          const i = prev.findIndex(
            (p) => p.id === next.id || (!!next.txnId && p.txnId === next.txnId),
          );
          if (i < 0) return [...prev, next];
          const copy = prev.slice();
          copy[i] = { ...next, pending: prev[i].pending && ev.status != null };
          return copy;
        });
      };
      const onEcho = (ev: any, r: any) => {
        if (r?.roomId !== activeRoom) return;
        const txnId = ev.getTxnId?.();
        if (!txnId) return;
        setEvents((prev) =>
          prev.map((p) =>
            p.txnId === txnId ? { ...p, id: ev.getId(), pending: ev.status != null } : p,
          ),
        );
      };
      client.on(sdk.RoomEvent.Timeline, onTl);
      client.on(sdk.RoomEvent.LocalEchoUpdated, onEcho);
      detach = () => {
        client.off(sdk.RoomEvent.Timeline, onTl);
        client.off(sdk.RoomEvent.LocalEchoUpdated, onEcho);
      };
    })();
    return () => {
      cancelled = true;
      detach?.();
    };
  }, [client, activeRoom]);

  // Start a direct conversation with someone by their Matrix address, so a
  // member can talk to the people they invite without leaving the app.
  async function startDirect(e: React.FormEvent) {
    e.preventDefault();
    const target = to.trim();
    if (!client || !MXID.test(target) || starting) return;
    setStarting(true);
    setError(null);
    try {
      const { room_id } = await client.createRoom({
        is_direct: true,
        invite: [target],
        preset: "trusted_private_chat",
      });
      // Mark it as a direct chat in the account, which other Matrix apps read too.
      const direct = { ...(client.getAccountData?.("m.direct")?.getContent?.() ?? {}) };
      direct[target] = [...new Set([...(direct[target] ?? []), room_id])];
      await client.setAccountData("m.direct", direct).catch(() => {});
      setTo("");
      setActiveRoom(room_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the conversation.");
    } finally {
      setStarting(false);
    }
  }

  async function join(roomId: string) {
    try {
      await client.joinRoom(roomId);
      setActiveRoom(roomId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join the room.");
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !client || !activeRoom) return;
    setDraft("");
    // Show it straight away. The server's copy takes the same place when it lands.
    const txnId = client.makeTxnId();
    const me = client.getUserId();
    setEvents((prev) => [
      ...prev,
      {
        id: `~${activeRoom}:${txnId}`,
        sender: me,
        body,
        ts: Date.now(),
        mine: true,
        pending: true,
        txnId,
      },
    ]);
    try {
      await client.sendTextMessage(activeRoom, body, txnId);
      // Speaking in a room is taking part: a signed check-in for this room today.
      // Reading is not, so opening a room records nothing (ADR 0069).
      void participate("chat", `chat:${activeRoom}@${today()}`);
    } catch (err) {
      // Take the line back off and return the words to the box, so nothing
      // looks sent that was not.
      setEvents((prev) => prev.filter((p) => p.txnId !== txnId));
      setDraft((d) => d || body);
      setError(err instanceof Error ? err.message : "send failed");
    }
  }

  async function startCall(video: boolean) {
    if (!client || !activeRoom || calling) return;
    if (call) await hangUp();
    setCalling(true);
    setError(null);
    try {
      setCall(await joinCall(client, activeRoom, video));
      // Joining a call is taking part in the room, the same as speaking in it.
      void participate("chat", `chat:${activeRoom}@${today()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The call did not start.");
    } finally {
      setCalling(false);
    }
  }

  const hangUp = useCallback(async () => {
    const c = callRef.current;
    if (!c) return;
    setCall(null);
    await leaveCall(client, c);
  }, [client]);

  async function signOut() {
    await hangUp();
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
    setError(null);
    setPhase("loggedout");
  }

  const header = (
    <PageHeader
      icon={MessageSquare}
      eyebrow="chat"
      title="Chat"
      lede={`Talk to the people in your ${groupWord}.${identity.handle ? ` Signed in as ${identity.handle}.` : ""}`}
    />
  );

  // ── Not connected: the passkey opens chat ───────────────────────
  if (phase !== "ready") {
    return (
      <Page>
        {header}
        <PageBody width="read">
          {!signedIn ? (
            <Gate
              icon={MessageSquare}
              title="Sign in to chat"
              action={
                <Button variant="primary" size="md" icon={UserRound} onClick={() => open("identity")}>
                  Open Profile
                </Button>
              }
            >
              <p>
                Chat opens with your passkey. Sign in to {edition.instance.name} in Profile and you will
                land in the room with everyone else in your {groupWord}.
              </p>
            </Gate>
          ) : notOpen ? (
            <Gate icon={MessageSquare} title="Chat is not open yet">
              <p>
                Your {groupWord}'s chat server is not running yet. When it is, opening Chat puts you
                straight into the members room, with nothing to set up.
              </p>
            </Gate>
          ) : (
            <Gate
              icon={MessageSquare}
              title="Open chat"
              action={
                <Button
                  variant="primary"
                  size="md"
                  icon={Fingerprint}
                  busy={phase === "connecting"}
                  onClick={() => void openWithPasskey()}
                >
                  {phase === "connecting" ? "Opening" : "Open chat"}
                </Button>
              }
            >
              <p>
                Your chat account comes with your passkey. Opening Chat makes it the first time and puts
                you in the room with everyone else in your {groupWord}.
              </p>
              {error && <Notice tone="danger">{error}</Notice>}
            </Gate>
          )}
        </PageBody>
      </Page>
    );
  }

  // ── Ready: rooms + timeline ──────────────────────────────────────
  const activeName = rooms.find((r) => r.id === activeRoom)?.name ?? "";
  return (
    <Page>
      {header}
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-64 shrink-0 flex-col border-r border-[var(--line)]">
          <div className="border-b border-[var(--line)] px-8 py-3">
            <Eyebrow icon={Hash}>rooms</Eyebrow>
          </div>
          <form onSubmit={startDirect} className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-3">
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder={`Message @alice:${serverOf(client?.getUserId?.() ?? "")}`}
              spellCheck={false}
              aria-label="Start a conversation with a Matrix address"
              className={`${inputClass} font-mono min-w-0 flex-1 px-2.5 py-1.5 text-xs`}
            />
            <Button
              type="submit"
              disabled={!MXID.test(to.trim())}
              busy={starting}
              icon={Send}
              title="Start a conversation"
              aria-label="Start a conversation"
            />
          </form>
          <div className="min-h-0 flex-1 overflow-y-auto py-2">
            {rooms.map((r) => r.invited ? (
              <div key={r.id} className="flex items-center gap-2 px-4 py-2 text-sm text-[var(--muted)]">
                <Hash className="h-3.5 w-3.5 shrink-0 text-[var(--faint)]" />
                <span className="truncate">{r.name}</span>
                <Button className="ml-auto" onClick={() => void join(r.id)}>
                  Join
                </Button>
              </div>
            ) : (
              <button
                key={r.id}
                onClick={() => setActiveRoom(r.id)}
                data-active={r.id === activeRoom}
                className="prism-hover flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-[var(--muted)] data-[active=true]:text-[var(--fg)]"
              >
                <Hash className="h-3.5 w-3.5 shrink-0 text-[var(--faint)]" />
                <span className="truncate">{r.name}</span>
                {r.unread > 0 && (
                  <span className="ml-auto">
                    <Dot tone="live" />
                  </span>
                )}
              </button>
            ))}
            {rooms.length === 0 && (
              <p className="px-4 py-2 text-xs text-[var(--faint)]">No rooms yet.</p>
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
            <PageBody width="read">
              <Section label="account" icon={Settings} lede={<span className="font-mono">{client?.getUserId?.() ?? ""}</span>}>
                <p className="text-[13px] leading-relaxed text-[var(--muted)]">
                  This address is yours on your {groupWord}'s chat server. Your passkey is how you get back
                  into it, so there is no password to keep.
                </p>
              </Section>
              <Section label="already on matrix" icon={Link2}>
                <p className="text-[13px] leading-relaxed text-[var(--muted)]">
                  If you already use Matrix somewhere else, add that address and it gets an invite to
                  the {edition.instance.name} members room too. Accept it in the app you usually use.
                </p>
                <form onSubmit={linkElsewhere} className="mt-3 flex items-center gap-2">
                  <input
                    value={elsewhere}
                    onChange={(e) => setElsewhere(e.target.value)}
                    placeholder="@alice:matrix.org"
                    spellCheck={false}
                    aria-label="Your Matrix address elsewhere"
                    className={`${inputClass} font-mono min-w-0 flex-1`}
                  />
                  <Button type="submit" size="md" icon={Link2} busy={linking} disabled={!MXID.test(elsewhere.trim())}>
                    Send invite
                  </Button>
                </form>
                {linked && <Notice tone="ok">Invite sent to {linked}.</Notice>}
                {linkError && <Notice tone="danger">{linkError}</Notice>}
              </Section>
              <Section label="this device">
                <Button variant="danger" size="md" icon={LogOut} onClick={signOut}>
                  Sign out of chat
                </Button>
              </Section>
            </PageBody>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-[var(--line)] px-8 py-3">
                <Hash className="h-4 w-4 text-[var(--faint)]" />
                <span className="font-tight text-sm font-medium">{activeName}</span>
                {call?.roomId !== activeRoom && activeRoom && (
                  <span className="ml-auto flex items-center gap-2">
                    {callers > 0 && (
                      <span className="flex items-center gap-1.5 font-mono text-[11px] text-[var(--muted)]">
                        <Dot tone="live" />
                        {callers} in a call
                      </span>
                    )}
                    <Button icon={Phone} busy={calling} onClick={() => void startCall(false)}>
                      {callers > 0 ? "Join with voice" : "Voice call"}
                    </Button>
                    <Button icon={Video} busy={calling} onClick={() => void startCall(true)}>
                      {callers > 0 ? "Join with video" : "Video call"}
                    </Button>
                  </span>
                )}
              </div>
              {call && call.roomId === activeRoom && (
                <CallStage call={call} name={shortSender} onLeave={hangUp} />
              )}
              {call && call.roomId !== activeRoom && (
                <div className="flex items-center gap-2 border-b border-[var(--line)] px-8 py-2 text-[13px] text-[var(--muted)]">
                  <Dot tone="live" />
                  In a call in {rooms.find((r) => r.id === call.roomId)?.name ?? "another room"}.
                  <Button variant="quiet" onClick={() => setActiveRoom(call.roomId)}>
                    Go back
                  </Button>
                  <Button variant="quiet" onClick={() => void hangUp()}>
                    Leave
                  </Button>
                </div>
              )}
              <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-8 py-4">
                <div className="flex flex-col gap-3">
                  {events.map((ev) => (
                    <div key={ev.id} className="flex flex-col">
                      <div className="flex items-baseline gap-2">
                        <span
                          className="font-mono text-[11px]"
                          style={{ color: ev.mine ? "var(--accent)" : "var(--faint)" }}
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
                      <p
                        className="text-[14px] leading-relaxed"
                        style={ev.pending ? { opacity: 0.55 } : undefined}
                      >
                        {ev.body}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              {error && (
                <div className="px-8 pb-2">
                  <Notice tone="danger">{error}</Notice>
                </div>
              )}
              {/* pr-36 keeps the composer clear of the host's floating Suggest button */}
              <form
                onSubmit={send}
                className="flex items-center gap-3 border-t border-[var(--line)] py-3 pl-8 pr-36"
              >
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={activeName ? `Message ${activeName}` : "Message"}
                  className={`${inputClass} flex-1`}
                />
                <Button type="submit" size="md" icon={Send} disabled={!draft.trim() || !activeRoom}>
                  Send
                </Button>
              </form>
            </>
          )}
        </section>
      </div>
    </Page>
  );
}

/** The server part of a Matrix address: @alice:decent.partners → decent.partners */
function serverOf(mxid: string): string {
  return mxid.split(":").slice(1).join(":") || "server";
}

function shortSender(s: string): string {
  return s.replace(/^@/, "").split(":")[0];
}

export const chatPlugin: MurmurPlugin = {
  id: "chat",
  title: "Chat",
  tagline: `Talk to the people in your ${groupWord}`,
  icon: MessageSquare,
  order: 20,
  kind: "plugin",
  backend: "Matrix homeserver",
  Panel,
};
