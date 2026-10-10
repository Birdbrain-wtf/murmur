import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video, VideoOff, PhoneOff } from "lucide-react";
import type { Participant, Room as LiveRoom, RemoteTrack } from "livekit-client";
import { Button, Notice } from "../../ui";

/**
 * Voice and video calls in a chat room, over MatrixRTC.
 *
 * The room's call is a Matrix thing: each person in it posts a membership to the
 * room (the SDK's MatrixRTCSession does that and keeps it fresh), so any MatrixRTC
 * app in the room, Element X or Element Call included, sees the same call. The
 * sound and pictures go through LiveKit, a media relay on the collective's own
 * chat server: the app trades a one-off Matrix OpenID token for a relay ticket at
 * `<focus>/sfu/get`. Whoever started the call picked the relay, and everyone after
 * uses that one ("oldest membership"), so people from two collectives end up in
 * the same place. Server side: the `/livekit/*` paths on matrix.<server>, set up in
 * infra/services/matrix-calls/README.md.
 */

interface LivekitFocus {
  type: "livekit";
  livekit_service_url: string;
}

export interface CallState {
  roomId: string;
  live: LiveRoom;
  video: boolean;
}

/** Where this account's server says its relay is, from its well-known, falling back to the usual path. */
async function ownFocus(client: any): Promise<LivekitFocus> {
  const server = String(client.getUserId() ?? "").split(":").slice(1).join(":");
  try {
    const r = await fetch(`https://${server}/.well-known/matrix/client`, { headers: { Accept: "application/json" } });
    const j = await r.json();
    const f = (j["org.matrix.msc4143.rtc_foci"] ?? []).find(
      (x: any) => x?.type === "livekit" && typeof x.livekit_service_url === "string",
    );
    if (f) return { type: "livekit", livekit_service_url: f.livekit_service_url };
  } catch {
    /* fall through */
  }
  return { type: "livekit", livekit_service_url: `${client.getHomeserverUrl().replace(/\/$/, "")}/livekit/jwt` };
}

/** People in the room's call right now, not counting this device. */
export function useCallers(client: any, roomId: string | null): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!client || !roomId) return;
    const room = client.getRoom(roomId);
    if (!room || !client.matrixRTC) return;
    const rtc = client.matrixRTC.getRoomSession(room);
    const me = `${client.getUserId()}|${client.getDeviceId()}`;
    const count = () =>
      setN(
        rtc.memberships.filter((m: any) => !m.isExpired() && `${m.sender}|${m.deviceId}` !== me).length,
      );
    count();
    rtc.on("memberships_changed", count);
    const t = setInterval(count, 15_000);
    return () => {
      rtc.off("memberships_changed", count);
      clearInterval(t);
    };
  }, [client, roomId]);
  return n;
}

export async function joinCall(client: any, roomId: string, video: boolean): Promise<CallState> {
  const room = client.getRoom(roomId);
  if (!room) throw new Error("That room is not loaded yet.");
  if (!client.getDeviceId()) throw new Error("Sign out of chat and open it again to make calls.");
  const rtc = client.matrixRTC.getRoomSession(room);
  const own = await ownFocus(client);
  // Join the relay the call already uses, or bring our own if we are first.
  const oldest = rtc.memberships.find((m: any) => !m.isExpired());
  const theirs = oldest
    ?.getPreferredFoci?.()
    .find((f: any) => f?.type === "livekit" && typeof f.livekit_service_url === "string");
  const service: string = theirs?.livekit_service_url ?? own.livekit_service_url;

  const openid = await client.getOpenIdToken();
  const r = await fetch(`${service.replace(/\/$/, "")}/sfu/get`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ room: roomId, openid_token: openid, device_id: client.getDeviceId() }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.url || !j.jwt) throw new Error(`The call did not start (${r.status}).`);

  const { Room } = await import("livekit-client");
  const live = new Room({ adaptiveStream: true, dynacast: true });
  await live.connect(j.url, j.jwt);
  rtc.joinRoomSession(
    [{ ...own, livekit_alias: roomId }],
    { type: "livekit", focus_selection: "oldest_membership" },
    // One membership event per device (MSC4143), the shape current Element apps read.
    { manageMediaKeys: false, useLegacyMemberEvents: false },
  );
  // A refused microphone or camera leaves you in the call, listening.
  await live.localParticipant.setMicrophoneEnabled(true).catch(() => {});
  if (video) await live.localParticipant.setCameraEnabled(true).catch(() => {});
  return { roomId, live, video };
}

export async function leaveCall(client: any, call: CallState): Promise<void> {
  try {
    await call.live.disconnect();
  } catch {
    /* already gone */
  }
  const room = client?.getRoom?.(call.roomId);
  if (room) await client.matrixRTC.getRoomSession(room).leaveRoomSession(3000).catch(() => false);
}

/** The call strip: a tile for everyone in it, and the three controls. */
export function CallStage({
  call,
  name,
  onLeave,
}: {
  call: CallState;
  name: (identity: string) => string;
  onLeave: () => void;
}) {
  const [, setTick] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const audioRef = useRef<HTMLDivElement>(null);
  const leaveRef = useRef(onLeave);
  leaveRef.current = onLeave;
  const { live } = call;

  useEffect(() => {
    let alive = true;
    const bump = () => alive && setTick((t) => t + 1);
    const onSub = (track: RemoteTrack) => {
      if (track.kind === "audio") audioRef.current?.appendChild(track.attach());
      bump();
    };
    const onUnsub = (track: RemoteTrack) => {
      track.detach().forEach((el) => el.remove());
      bump();
    };
    const onGone = () => leaveRef.current();
    const bumps = [
      "participantConnected",
      "participantDisconnected",
      "trackMuted",
      "trackUnmuted",
      "localTrackPublished",
      "localTrackUnpublished",
      "activeSpeakersChanged",
    ] as const;
    bumps.forEach((e) => live.on(e as any, bump));
    live.on("trackSubscribed" as any, onSub);
    live.on("trackUnsubscribed" as any, onUnsub);
    live.on("disconnected" as any, onGone);
    // Anything already playing before this mounted.
    live.remoteParticipants.forEach((p) =>
      p.audioTrackPublications.forEach((pub) => pub.track && audioRef.current?.appendChild(pub.track.attach())),
    );
    return () => {
      alive = false;
      bumps.forEach((e) => live.off(e as any, bump));
      live.off("trackSubscribed" as any, onSub);
      live.off("trackUnsubscribed" as any, onUnsub);
      live.off("disconnected" as any, onGone);
    };
  }, [live]);

  const me = live.localParticipant;
  const people: Participant[] = [me, ...live.remoteParticipants.values()];

  async function toggle(kind: "mic" | "camera") {
    setProblem(null);
    try {
      if (kind === "mic") await me.setMicrophoneEnabled(!me.isMicrophoneEnabled);
      else await me.setCameraEnabled(!me.isCameraEnabled);
    } catch {
      setProblem(
        kind === "mic"
          ? "The microphone did not start. Check that this app may use it in your computer's privacy settings."
          : "The camera did not start. Check that this app may use it in your computer's privacy settings.",
      );
    }
    setTick((t) => t + 1);
  }

  return (
    <div className="border-b border-[var(--line)] px-8 py-4">
      <div className="flex flex-wrap gap-3">
        {people.map((p) => (
          <Tile key={p.identity} p={p} label={p === me ? "You" : name(p.identity)} />
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button
          icon={me.isMicrophoneEnabled ? Mic : MicOff}
          onClick={() => void toggle("mic")}
          aria-pressed={!me.isMicrophoneEnabled}
        >
          {me.isMicrophoneEnabled ? "Mute" : "Unmute"}
        </Button>
        <Button
          icon={me.isCameraEnabled ? Video : VideoOff}
          onClick={() => void toggle("camera")}
          aria-pressed={me.isCameraEnabled}
        >
          {me.isCameraEnabled ? "Camera off" : "Camera on"}
        </Button>
        <Button variant="danger" icon={PhoneOff} onClick={onLeave}>
          Leave
        </Button>
        <span className="ml-2 font-mono text-[11px] text-[var(--faint)]">
          {people.length === 1 ? "Waiting for others" : `${people.length} in the call`}
        </span>
      </div>
      {problem && <Notice tone="warn">{problem}</Notice>}
      <div ref={audioRef} hidden />
    </div>
  );
}

function Tile({ p, label }: { p: Participant; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const pub = p.getTrackPublication("camera" as any);
  const track = pub && !pub.isMuted ? pub.track : undefined;
  useEffect(() => {
    const el = ref.current;
    if (!track || !el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  return (
    <div
      className="relative flex h-32 w-48 items-center justify-center overflow-hidden rounded-[var(--radius)] border bg-[var(--card)]"
      style={{ borderColor: p.isSpeaking ? "var(--accent)" : "var(--line)" }}
    >
      {track ? (
        <video ref={ref} autoPlay playsInline muted className="h-full w-full object-cover" />
      ) : (
        <span className="font-tight text-2xl text-[var(--faint)]">{label.slice(0, 2).toUpperCase()}</span>
      )}
      <span className="absolute bottom-1.5 left-2 flex items-center gap-1 font-mono text-[10px] text-[var(--muted)]">
        {!p.isMicrophoneEnabled && <MicOff className="h-3 w-3" />}
        {label}
      </span>
    </div>
  );
}
