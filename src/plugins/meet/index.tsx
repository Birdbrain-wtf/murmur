import { useEffect, useState } from "react";
import { Video, ArrowUpRight, CalendarPlus, Radio, Sparkles } from "lucide-react";
import type { MurmurModule, PluginContext } from "../../host/types";

/**
 * "meet" plugin — **Chaos Sessions**, the default way the flock participates.
 *
 * The id stays the generic primitive ("meet") so any instance can fork it; the
 * *title* is each culture's own brand of the call. Decent's instance is the
 * Chaos Sessions — the weekly Monday 15:00 UK ritual that is the highest-
 * bandwidth channel by which the world tells Decent what's true. Each call is
 * recorded + transcribed into Birdbrain's memory (concepts, Seeds, the digest).
 *
 * This panel surfaces the *ritual*, not a generic room launcher: the next
 * session, a live/countdown state, and the one button that actually works —
 * the hosted passkey gateway (`/chaos/join`) that proves attendance and admits
 * you to the JWT-gated room (cs.birdbrain.wtf/chaos-sessions, the same room the
 * auto-recorder joins). A naked Jitsi link can't pass that gate, so we send the
 * user through the gateway. The sovereign target stays self-hosted Jitsi under
 * decent.partners.
 */

interface ChaosSession {
  id: string;
  date: string | null;
  title: string | null;
  status: string;
}

interface ChaosInfo {
  cadence: string;
  session: ChaosSession | null;
}

// London wall-clock 15:00 → the exact UTC instant, DST-safe (no tz library).
function londonInstant(dateStr: string, hour = 15, minute = 0): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const wallAsUTC = Date.UTC(y, m - 1, d, hour, minute, 0);
  // Offset between Europe/London and UTC at that instant.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const p = fmt
    .formatToParts(new Date(wallAsUTC))
    .reduce<Record<string, string>>((a, x) => ((a[x.type] = x.value), a), {});
  const seenAsUTC = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour === "24" ? "0" : p.hour),
    Number(p.minute),
    Number(p.second),
  );
  const offset = seenAsUTC - wallAsUTC;
  return new Date(wallAsUTC - offset);
}

const CALL_WINDOW_MS = 90 * 60 * 1000;

function useChaos(base: string): ChaosInfo | null {
  const [info, setInfo] = useState<ChaosInfo | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${base}/api/chaOS`, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(`chaOS ${res.status}`);
        const j = (await res.json()) as {
          cadence?: string;
          sessions?: ChaosSession[];
        };
        const session =
          j.sessions?.find((s) => s.status === "scheduled") ?? null;
        if (alive)
          setInfo({ cadence: j.cadence ?? "Mondays 15:00 UK", session });
      } catch {
        if (alive)
          setInfo({ cadence: "Mondays 15:00 UK", session: null });
      }
    })();
    return () => {
      alive = false;
    };
  }, [base]);
  return info;
}

function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function countdown(ms: number): string {
  const mins = Math.floor(ms / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (days > 0) return `in ${days}d ${hours}h`;
  if (hours > 0) return `in ${hours}h ${m}m`;
  if (mins > 0) return `in ${m} min`;
  return "any moment now";
}

function Panel({ instance, identity }: PluginContext) {
  const info = useChaos(instance.birdbrainBase);
  const now = useNow();

  // External, hosted surfaces. These are real pages the user opens in a
  // browser, so they must resolve to a live origin even in dev (where
  // birdbrainBase is "" for the proxy) — fall back to Birdbrain's.
  const origin = instance.birdbrainBase || "https://birdbrain.wtf";
  const joinUrl = `${origin}/chaos/join`;
  const icsUrl = `${origin}/chaOS.ics`;
  const exploreUrl = `${origin}/chaOS`;

  const session = info?.session ?? null;
  const start = session?.date ? londonInstant(session.date) : null;
  const live =
    start !== null &&
    now >= start.getTime() &&
    now <= start.getTime() + CALL_WINDOW_MS;
  const upcoming = start !== null && now < start.getTime();

  const dateLabel = start
    ? start.toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: "Europe/London",
      })
    : "scheduling…";

  let state: { tone: string; label: string };
  if (live) state = { tone: "#10b981", label: "live now" };
  else if (upcoming)
    state = { tone: "var(--muted)", label: countdown(start!.getTime() - now) };
  else state = { tone: "var(--faint)", label: "next session scheduling" };

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-[var(--line)] px-8 pt-7 pb-5">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--faint)]">
          <Video className="h-3.5 w-3.5" />
          chaos sessions
        </div>
        <h1 className="font-tight mt-2 text-2xl font-medium">
          Join the Chaos Sessions
        </h1>
        <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">
          The flock's weekly call —{" "}
          <span className="text-[var(--fg)]">{info?.cadence ?? "Mondays 15:00 UK"}</span>.
          The highest-bandwidth way the world tells Decent what's true. Every
          session is recorded into Birdbrain's memory.
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {/* Next session */}
        <div className="max-w-xl rounded-[var(--radius)] border border-[var(--line-strong)] bg-[var(--card)] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-[var(--faint)]">
                {session?.id ? `${session.id} · next` : "next session"}
              </div>
              <div className="font-tight mt-1.5 text-lg font-medium">
                {dateLabel}
              </div>
              <div className="mt-0.5 text-[13px] text-[var(--muted)]">
                {info?.cadence ?? "Mondays 15:00 UK"}
              </div>
            </div>
            <span
              className="flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider"
              style={{ borderColor: `${state.tone}55`, color: state.tone }}
            >
              {live && (
                <span
                  className="inline-block h-1.5 w-1.5 animate-pulse rounded-full"
                  style={{ background: state.tone }}
                />
              )}
              {state.label}
            </span>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <a
              href={joinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="prism-hover flex items-center justify-center gap-2 rounded-[var(--radius)] border border-[var(--line-strong)] px-5 py-2.5 text-sm font-medium"
              data-active={live ? "true" : undefined}
            >
              {live ? (
                <Radio className="h-4 w-4" />
              ) : (
                <ArrowUpRight className="h-4 w-4" />
              )}
              {live ? "Join the live call" : "Join the Chaos Sessions"}
            </a>
            <a
              href={icsUrl}
              className="flex items-center justify-center gap-2 rounded-[var(--radius)] border border-[var(--line)] px-4 py-2.5 text-sm text-[var(--muted)] hover:text-[var(--fg)]"
            >
              <CalendarPlus className="h-4 w-4" /> Add to calendar
            </a>
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-[var(--faint)]">
            A device passkey proves you were in the room — no password, no
            wallet.{" "}
            {identity.handle
              ? `You'll join as ${identity.handle}.`
              : "Choose a handle or stay anonymous; either way your presence is verified."}
          </p>
        </div>

        {/* What participating means */}
        <div className="mt-5 max-w-xl rounded-[var(--radius)] border border-dashed border-[var(--line-strong)] bg-[var(--raise)] px-5 py-4">
          <div className="font-tight flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-[var(--muted)]" /> Showing up is
            contributing
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--muted)]">
            Birdbrain is pseudonymous by design — it cares about cryptographic
            proof you were in the room, not your name. What you say is
            transcribed and woven into the world model: concepts, the
            participation graph, your Seed, and the weekly digest. Participate
            enough and the model starts to think with your voice.
          </p>
          <a
            href={exploreUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-[#007aff]"
          >
            Explore the model <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </div>

        {/* Sovereign target */}
        <div className="mt-5 max-w-xl text-[12px] leading-relaxed text-[var(--faint)]">
          Calls run on a self-hosted, JWT-gated Jitsi at{" "}
          <span className="font-mono">cs.birdbrain.wtf</span> — infrastructure
          Decent owns. The sovereign target is{" "}
          <span className="font-mono">meet.decent.partners</span>, the same
          self-host playbook as the chat homeserver.
        </div>
      </div>
    </div>
  );
}

export const meetPlugin: MurmurModule = {
  id: "meet",
  title: "Chaos Sessions",
  tagline: "The flock's weekly call — recorded into Birdbrain's memory (Jitsi)",
  icon: Video,
  order: 15,
  kind: "plugin",
  backend: "Self-hosted Jitsi",
  Panel,
};
