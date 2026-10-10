import { useEffect, useState } from "react";
import { Video, ArrowUpRight, CalendarPlus, Radio, Sparkles, MapPin } from "lucide-react";
import type { MurmurModule, PluginContext } from "../../host/types";
import { issues } from "../../host/support";
import { Button, Card, Code, Eyebrow, Field, Notice, Page, PageBody, PageHeader, Status, inputClass } from "../../ui";
import {
  checkInAtPlace,
  participate,
  PLACE_STEP,
  publishAnchor,
  stewardPlaces,
  supported as checkInsSupported,
  today,
  useParticipation,
} from "../../identity/participation";

/**
 * "meet" plugin — **Chaos Sessions**, the default way members take part.
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

/**
 * In the room together: a place check-in (ADR 0070). A member types the code on
 * the venue's screen. A steward of the venue can put that screen up from here:
 * the code is signed with their own check-in key and changes every minute.
 * Nothing reads this computer's location.
 */
function PlaceCard() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [places, setPlaces] = useState<{ cell: string; name: string }[]>([]);
  const [hosting, setHosting] = useState<{ cell: string; name: string } | null>(null);
  const [shown, setShown] = useState<{ code: string } | { error: string } | null>(null);

  useEffect(() => {
    void stewardPlaces().then(setPlaces);
  }, []);

  // Re-sign as each minute turns, so the screen never shows a stale code.
  useEffect(() => {
    if (!hosting) return;
    let last = -1;
    let stop = false;
    const tick = async () => {
      const w = Math.floor(Date.now() / 1000 / PLACE_STEP);
      if (w === last || stop) return;
      last = w;
      const r = await publishAnchor(hosting.cell);
      if (!stop) setShown(r);
    };
    void tick();
    const t = setInterval(() => void tick(), 2000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [hosting]);

  async function submit() {
    if (code.trim().length < 6 || busy) return;
    setBusy(true);
    setNote(null);
    const r = await checkInAtPlace(code.trim());
    setBusy(false);
    if (r.status === "recorded" || r.status === "already") {
      setNote({ ok: true, text: `You're checked in at ${r.name ?? "this place"} for today.` });
      setCode("");
    } else if (r.status === "needs-approval") setNote({ ok: false, text: "Check-ins are off. Turn them on in Identity." });
    else if (r.status === "failed") setNote({ ok: false, text: r.error });
  }

  return (
    <Card>
      <div className="font-tight flex items-center gap-2 text-sm font-medium">
        <MapPin className="h-4 w-4 text-[var(--muted)]" /> In the room together
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--muted)]">
        At a venue? Type the code on its screen. It changes every minute, so it
        shows you were there. Only the venue's area is recorded, never where you
        are.
      </p>
      <div className="mt-4">
        <Field label="Venue code" hint="Six letters and numbers, from the venue's screen.">
          <span className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && void submit()}
              placeholder="CODE"
              spellCheck={false}
              className={`${inputClass} font-mono !w-36 tracking-[0.3em]`}
            />
            <Button
              size="md"
              onClick={(e) => {
                e.preventDefault();
                void submit();
              }}
              disabled={code.trim().length < 6}
              busy={busy}
            >
              {busy ? "Checking…" : "Check in"}
            </Button>
          </span>
        </Field>
      </div>
      {note && (
        <div className="mt-3">
          <Notice tone={note.ok ? "ok" : "idle"}>{note.text}</Notice>
        </div>
      )}

      {places.length > 0 && (
        <div className="mt-5 border-t border-[var(--line)] pt-4">
          {hosting ? (
            <div className="space-y-3">
              <Eyebrow>{hosting.name} · showing now</Eyebrow>
              <Code>{shown && "code" in shown ? shown.code : "······"}</Code>
              {shown && "error" in shown && <Notice tone="danger">{shown.error}</Notice>}
              <Button
                variant="quiet"
                onClick={() => {
                  setHosting(null);
                  setShown(null);
                }}
              >
                Stop showing the code
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {places.map((p) => (
                <Button key={p.cell} onClick={() => setHosting(p)}>
                  Show the code for {p.name}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function Panel({ instance, identity, open }: PluginContext) {
  const info = useChaos(instance.birdbrainBase);
  const { grant } = useParticipation();
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

  let state: { tone: "live" | "idle"; label: string };
  if (live) state = { tone: "live", label: "Live now" };
  else if (upcoming) state = { tone: "idle", label: countdown(start!.getTime() - now) };
  else state = { tone: "idle", label: "Being scheduled" };

  const cadence = info?.cadence ?? "Mondays 15:00 UK";

  return (
    <Page>
      <PageHeader
        icon={Video}
        eyebrow="chaos sessions"
        title="Chaos Sessions"
        lede={
          <>
            A weekly open call, <span className="text-[var(--fg)]">{cadence}</span>. Every
            session is recorded and transcribed into the shared record.
          </>
        }
      />

      <PageBody>
        {/* Next session */}
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div>
              <Eyebrow>{session?.id ? `${session.id} · next` : "next session"}</Eyebrow>
              <div className="font-tight mt-1.5 text-lg font-medium">{dateLabel}</div>
              <div className="mt-0.5 text-[13px] text-[var(--muted)]">{cadence}</div>
            </div>
            <Status tone={state.tone} pulse={live}>
              {state.label}
            </Status>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <a
              href={joinUrl}
              target="_blank"
              rel="noopener noreferrer"
              // The call's own door records attendance too. This is the app's signed
              // check-in, the same one every plugin makes (ADR 0069).
              onClick={() => void participate("meet", `meet:chaos-sessions@${today()}`)}
              className={`${LINK} border-[var(--fg)] font-medium`}
              data-active={live ? "true" : undefined}
            >
              {live ? <Radio className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
              {live ? "Join the live call" : "Join the Chaos Sessions"}
            </a>
            <a href={icsUrl} className={`${LINK} border-[var(--line-strong)]`}>
              <CalendarPlus className="h-3.5 w-3.5" /> Add to calendar
            </a>
          </div>
          <p className="mt-4 text-[13px] leading-relaxed text-[var(--muted)]">
            Your passkey shows you were in the room. No password, no wallet.{" "}
            {identity.handle
              ? `You'll join as ${identity.handle}.`
              : "Choose a handle or stay anonymous. Either way, your presence is verified."}
          </p>
          {checkInsSupported && identity.signedIn && !grant && (
            <div className="mt-2">
              <Button variant="quiet" className="!px-0" onClick={() => open("identity")}>
                Check-ins are off. Turn them on in Identity.
              </Button>
            </div>
          )}
        </Card>

        {checkInsSupported && grant && <PlaceCard />}

        {/* What taking part means */}
        <Card tone="dashed">
          <div className="font-tight flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-[var(--muted)]" /> Showing up is contributing
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--muted)]">
            What's said in a session is transcribed into the shared record, so the
            ideas and decisions stay findable afterwards. Your passkey records that
            you were there, under your handle or none.
          </p>
          <a
            href={exploreUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`${LINK} mt-4 border-[var(--line-strong)]`}
          >
            Explore the record <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </Card>

        <p className="text-[12px] leading-relaxed text-[var(--faint)]">Calls run on infrastructure we host.</p>
      </PageBody>
    </Page>
  );
}

/** Links that leave the app wear the kit's button shape (white, a border,
 *  colour on hover). They stay anchors so the browser opens them. */
const LINK =
  "prism-hover inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[var(--radius)] border bg-[var(--card)] px-4 py-2.5 text-sm text-[var(--fg)] transition";

export const meetPlugin: MurmurModule = {
  id: "meet",
  title: "Chaos Sessions",
  tagline: "A weekly open call, recorded and transcribed",
  icon: Video,
  order: 15,
  kind: "plugin",
  support: issues("meet"),
  backend: "Video calls we host",
  Panel,
};
