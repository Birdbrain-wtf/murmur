import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  CornerDownLeft,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import type { MurmurPlugin, PluginContext } from "../../host/types";
import { issues } from "../../host/support";
import { edition, groupWord, installs } from "../../edition";
import { Button, Notice, Page, PageHeader, Waiting } from "../../ui";
import { getModule } from "../../host/registry";
import { listSecrets } from "../../lib/secrets";
import { useOps } from "../../lib/ops";
import { supported as checkInsSupported, useParticipation } from "../../identity/participation";

/**
 * The collective's own agent, inside the app. Named after the edition (Decent,
 * Birdbrain, FTTF): a member talks to the company or collective itself.
 *
 * It answers over the same room-agent engine as the chat on birdbrain.wtf, in
 * its app mode (infra/services/room-agent/app-guide/): first it helps a member
 * get set up, then it answers from the collective's own documentation. The door
 * that holds the member's session picks the agent (`<signIn.pair>/ask`), so a
 * plugin can never ask another collective's agent.
 *
 * Two halves, on purpose. The setup list is worked out here from the app's own
 * state, so it is always right even when the model is slow or down. The
 * conversation is the model's, and it can point back into the app with buttons.
 *
 * What the agent is told about this member is a short report (`report()`):
 * flags and counts, never a key's name or value, a message or a note. The
 * conversation stays on this computer and goes back with each question as
 * history, like the web page; the server keeps none of it.
 */

const THREAD_KEY = "murmur.agent.v1";
const FOLD_KEY = "murmur.agent.setup-folded.v1";
const MATRIX_KEY = "murmur.matrix.session.v1";
const INVITED_KEY = "murmur.invited.v1";

interface Turn {
  q: string;
  a: string;
  actions?: string[];
  error?: string;
  at: number;
}

function loadThread(): Turn[] {
  try {
    const t = JSON.parse(localStorage.getItem(THREAD_KEY) || "[]");
    return Array.isArray(t) ? t.filter((x) => x && typeof x.q === "string") : [];
  } catch {
    return [];
  }
}

function saveThread(t: Turn[]) {
  try {
    localStorage.setItem(THREAD_KEY, JSON.stringify(t.slice(-40)));
  } catch {
    /* a full store costs the history, never the answer */
  }
}

/** Something that looks like a key or token. Never sent: it belongs in Settings.
 *  The door strips the same shapes (room-agent engine/app-door.ts). */
const SECRETISH = /\b(?:sk|pk|rk|ghp|gho|github_pat|xox[abprs]|AKIA|AIza|whsec|sk_live|sk_test)[-_A-Za-z0-9]{6,}|\b[A-Za-z0-9+/_-]{32,}={0,2}(?![A-Za-z0-9])/;

/** What the model is writing, minus the lines that become buttons. */
const visible = (s: string) =>
  s
    .replace(/\s*\**\s*ACTION\s*:[^\n]*$/i, "")
    .split("\n")
    .filter((l) => !/^\s*\**\s*ACTION\s*:/i.test(l))
    .join("\n")
    .replace(/\*\*/g, "")
    .trim();

// ── the setup list ──────────────────────────────────────────────────────────

interface Step {
  id: string;
  title: string;
  hint: string;
  done: boolean;
  place: string;
  ask: string;
}

function useSetup(identity: PluginContext["identity"]): Step[] {
  const { grant } = useParticipation();
  const ops = useOps();
  const [, tick] = useState(0);

  // Chat sign-in, keys and invites live in other plugins; look again whenever
  // the member comes back to this panel or saves a key.
  useEffect(() => {
    const on = () => tick((n) => n + 1);
    window.addEventListener("focus", on);
    window.addEventListener("murmur:secrets", on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener("focus", on);
      window.removeEventListener("murmur:secrets", on);
      window.removeEventListener("storage", on);
    };
  }, []);

  const has = (id: string) => installs(edition).includes(id);
  const signedIn = !!(identity.signedIn && identity.session);
  const steps: Step[] = [
    {
      id: "signin",
      title: "Sign in with your passkey",
      hint: `So ${edition.instance.name} knows who it is talking to.`,
      done: signedIn,
      place: "identity",
      ask: "How do I sign in with my passkey?",
    },
  ];
  if (checkInsSupported) {
    steps.push({
      id: "checkins",
      title: "Turn on check-ins",
      hint: "One tap, and calls and chat count as taking part.",
      done: !!grant && grant.exp > Date.now() / 1000,
      place: "identity",
      ask: "What are check-ins and how do I turn them on?",
    });
  }
  if (has("chat")) {
    steps.push({
      id: "chat",
      title: "Connect Chat",
      hint: `Talk to the people in your ${groupWord}.`,
      done: !!localStorage.getItem(MATRIX_KEY),
      place: "chat",
      ask: "How do I chat with people here?",
    });
  }
  steps.push({
    id: "keys",
    title: "Add your keys",
    hint: "API keys stay in this computer's secure store.",
    done: listSecrets().length > 0,
    place: "settings",
    ask: "How do I add an API key, and what are keys for?",
  });
  if (edition.ops) {
    steps.push({
      id: "ops",
      title: "Pair Operations",
      hint: "See the company's accounts, if you run it.",
      done: ops.kind === "ready",
      place: "operations",
      ask: "How do I see the company's accounts?",
    });
  }
  if (has("invite")) {
    steps.push({
      id: "invite",
      title: "Invite someone",
      hint: "Send an invite link, never a bare download.",
      done: !!localStorage.getItem(INVITED_KEY),
      place: "invite",
      ask: "How do I add someone to the app?",
    });
  }
  return steps;
}

/** The report the agent gets about this member's setup. Flags and counts only. */
function report(steps: Step[], installed: string[]) {
  const done = (id: string) => steps.find((s) => s.id === id)?.done;
  return {
    checkIns: checkInsSupported ? (done("checkins") ? "on" : "off") : "unsupported",
    ...(installs(edition).includes("chat") ? { chat: !!done("chat") } : {}),
    keys: listSecrets().length,
    ...(edition.ops ? { ops: done("ops") ? "paired" : "unpaired" } : {}),
    installed,
  };
}

// ── asking ──────────────────────────────────────────────────────────────────

type Event =
  | { type: "waiting"; waitedMs: number }
  | { type: "token"; t: string }
  | { type: "done"; answer: string; actions?: string[] }
  | { type: "error"; error: string };

async function ask(
  session: string,
  question: string,
  history: Turn[],
  state: unknown,
  on: (e: Event) => void,
  signal: AbortSignal,
) {
  const r = await fetch(`${edition.signIn.pair}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({
      session,
      question,
      history: history.filter((t) => t.a && !t.error).slice(-6).map((t) => ({ q: t.q, a: t.a })),
      state,
    }),
    signal,
  });
  if (!r.ok || !r.body || !(r.headers.get("content-type") || "").includes("event-stream")) {
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) throw new Error("Your sign-in has run out. Sign in again in Identity.");
    throw new Error(j.error || `The door answered ${r.status}.`);
  }
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const frames = buf.split("\n\n");
    buf = frames.pop() ?? "";
    for (const f of frames) {
      const ev = f.match(/^event: (.+)$/m)?.[1];
      const data = f.match(/^data: (.+)$/m)?.[1];
      if (!ev || !data) continue;
      try {
        on({ type: ev, ...JSON.parse(data) } as Event);
      } catch {
        /* a malformed frame is skipped, the next one still lands */
      }
    }
  }
}

// ── the panel ───────────────────────────────────────────────────────────────

function Panel({ identity, open }: PluginContext) {
  const steps = useSetup(identity);
  const [thread, setThread] = useState<Turn[]>(loadThread);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<{ q: string; text: string; waited: number } | null>(null);
  const [folded, setFolded] = useState(() => localStorage.getItem(FOLD_KEY) === "1");
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const name = edition.instance.name;
  const signedIn = !!(identity.signedIn && identity.session);
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;
  const next = steps.find((s) => !s.done);

  useEffect(() => saveThread(thread), [thread]);
  // Follow the conversation as it grows, but open at the top so the setup list shows.
  useEffect(() => {
    if (thread.length || busy) end.current?.scrollIntoView({ block: "end" });
  }, [thread.length, busy?.text]);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    localStorage.setItem(FOLD_KEY, folded ? "1" : "0");
  }, [folded]);

  const installed = useMemo(() => installs(edition).filter((id) => !!getModule(id)), []);

  async function send(raw: string) {
    const q = raw.trim();
    if (!q || busy || !identity.session) return;
    if (SECRETISH.test(q)) {
      setDraft("");
      setThread((t) => [
        ...t,
        {
          q: "(not sent)",
          a: "",
          actions: ["settings"],
          error: "That looks like a key, so I haven't sent it. Keys never belong in a conversation: save it in Settings, under Secrets and API keys, where it goes into this computer's secure store.",
          at: Date.now(),
        },
      ]);
      return;
    }
    setDraft("");
    setBusy({ q, text: "", waited: 0 });
    const ctl = new AbortController();
    abort.current = ctl;
    let text = "";
    let final: Turn | null = null;
    try {
      await ask(
        identity.session,
        q,
        thread,
        report(steps, installed),
        (e) => {
          if (e.type === "waiting") setBusy((b) => (b ? { ...b, waited: e.waitedMs } : b));
          if (e.type === "token") {
            text += e.t;
            setBusy((b) => (b ? { ...b, text } : b));
          }
          if (e.type === "done") final = { q, a: e.answer, actions: e.actions ?? [], at: Date.now() };
          if (e.type === "error") final = { q, a: "", error: "The agent could not answer just now. Try again in a minute.", at: Date.now() };
        },
        ctl.signal,
      );
      if (!final) final = text ? { q, a: visible(text), at: Date.now() } : { q, a: "", error: "The answer was cut off. Try again.", at: Date.now() };
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      final = { q, a: "", error: (e as Error).message || "Could not reach the door.", at: Date.now() };
    } finally {
      abort.current = null;
      setBusy(null);
    }
    if (final) setThread((t) => [...t, final!]);
    setTimeout(() => input.current?.focus(), 0);
  }

  const suggestions = useMemo(() => {
    const out: string[] = [];
    if (next) out.push(doneCount === 0 ? "I'm new here. Where do I start?" : `What's next after ${steps[0].done ? "signing in" : "this"}?`);
    out.push(`What can the ${edition.productName} app do?`);
    for (const s of steps) if (!s.done && out.length < 4) out.push(s.ask);
    if (out.length < 4) out.push(`What is ${name}?`);
    return [...new Set(out)].slice(0, 4);
  }, [steps, next, doneCount, name]);

  return (
    <Page>
      <PageHeader
        icon={Sparkles}
        eyebrow={edition.productName.toLowerCase()}
        title={`Talk to ${name}`}
        lede={`Ask how anything here works. ${name} will help you get set up and get work done.`}
        actions={
          thread.length > 0 && !busy ? (
            <Button icon={RotateCcw} onClick={() => setThread([])} title="Start a new conversation">
              New conversation
            </Button>
          ) : undefined
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {/* setup: worked out from the app itself, so it holds when the model is slow */}
        <section className="mb-6 overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--card)]">
          <button
            onClick={() => setFolded((f) => !f)}
            className="flex w-full items-center gap-3 px-5 py-3.5 text-left"
          >
            <span className="font-tight text-sm font-medium">{allDone ? "You're set up" : "Getting set up"}</span>
            <span className="font-mono text-[11px] text-[var(--faint)]">
              {doneCount} of {steps.length}
            </span>
            <span className="ml-auto h-[3px] w-24 overflow-hidden bg-[var(--line)]">
              <span className="block h-full" style={{ width: `${(doneCount / steps.length) * 100}%`, background: "var(--fg)" }} />
            </span>
            <ChevronDown className={`h-4 w-4 text-[var(--faint)] transition ${folded ? "-rotate-90" : ""}`} />
          </button>
          {!folded && (
            <ol className="border-t border-[var(--line)]">
              {steps.map((s) => (
                <li key={s.id} className="flex items-center gap-3 border-t border-[var(--line)] px-5 py-3 first:border-t-0">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                      s.done ? "border-[var(--ok)] text-[var(--ok)]" : "border-[var(--line-strong)] text-transparent"
                    }`}
                  >
                    <Check className="h-3 w-3" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={`font-tight text-sm ${s.done ? "text-[var(--muted)]" : "font-medium text-[var(--fg)]"}`}>{s.title}</div>
                    {!s.done && <div className="truncate text-[13px] text-[var(--muted)]">{s.hint}</div>}
                  </div>
                  {!s.done && (
                    <>
                      {signedIn && (
                        <Button variant="quiet" onClick={() => void send(s.ask)} disabled={!!busy}>
                          Ask
                        </Button>
                      )}
                      <PlaceButton place={s.place} open={open} />
                    </>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* the conversation */}
        {thread.length === 0 && !busy && (
          <div className="font-serif max-w-prose text-[15px] leading-relaxed text-[var(--muted)]">
            {signedIn
              ? `Hello${identity.handle ? ` ${identity.handle}` : ""}. I'm ${name}. Ask me anything about the app or about ${name}, or start with one of these.`
              : `I'm ${name}. Sign in with your passkey first, so I know who I'm talking to. The list above shows the way.`}
          </div>
        )}

        <div className="flex flex-col gap-5">
          {thread.map((t, i) => (
            <Exchange key={t.at + "-" + i} q={t.q}>
              {t.error ? (
                <>
                  <Notice tone="danger">{t.error}</Notice>
                  {!!t.actions?.length && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {t.actions.map((a) => (
                        <PlaceButton key={a} place={a} open={open} />
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <Answer text={t.a} actions={t.actions} open={open} />
              )}
            </Exchange>
          ))}
          {busy && (
            <Exchange q={busy.q}>
              {busy.text ? (
                <Answer text={visible(busy.text)} open={open} />
              ) : (
                <Waiting>
                  {busy.waited > 40_000
                    ? `${name} is waking up. The first answer after a quiet spell can take a minute or two.`
                    : `${name} is reading its own documentation…`}
                </Waiting>
              )}
            </Exchange>
          )}
        </div>

        {thread.length === 0 && !busy && signedIn && (
          <div className="mt-4 flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <Button key={s} onClick={() => void send(s)}>
                {s}
              </Button>
            ))}
          </div>
        )}
        <div ref={end} />
      </div>

      {/* The hint sits above the input and the foot leaves room for the host's
          floating Suggest button at the bottom right. */}
      <div className="shrink-0 border-t border-[var(--line)] px-8 pt-3 pb-14">
        <p className="mb-2 text-[11px] text-[var(--faint)]">
          {name} answers from its own documentation and can point you to the right place. It cannot change your settings, see your keys or move money.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
          }}
          className="prism-hover flex items-end gap-3 rounded-[var(--radius)] border border-[var(--line-strong)] bg-[var(--card)] px-4 py-3"
          data-active={!!busy}
        >
          <textarea
            ref={input}
            value={draft}
            rows={1}
            maxLength={800}
            disabled={!signedIn}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(draft);
              }
            }}
            placeholder={signedIn ? `Ask ${name}…` : "Sign in with your passkey to talk"}
            className="max-h-40 min-h-[1.5rem] flex-1 resize-none bg-transparent text-[15px] outline-none placeholder:text-[var(--faint)] disabled:opacity-60"
          />
          {busy ? (
            <Button type="button" variant="quiet" onClick={() => abort.current?.abort()}>
              Stop
            </Button>
          ) : signedIn ? (
            <kbd className="font-mono flex shrink-0 items-center gap-1 rounded-[var(--radius)] border border-[var(--line)] px-1.5 py-0.5 text-[10px] text-[var(--faint)]">
              <CornerDownLeft className="h-3 w-3" /> ask
            </kbd>
          ) : (
            <PlaceButton place="identity" open={open} label="Sign in" />
          )}
        </form>
      </div>
    </Page>
  );
}

function Exchange({ q, children }: { q: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 ml-auto w-fit max-w-[85%] rounded-[var(--radius)] bg-[var(--raise)] px-3 py-2 text-sm">{q}</div>
      <div className="max-w-prose">{children}</div>
    </div>
  );
}

function Answer({ text, actions, open }: { text: string; actions?: string[]; open: (id: string) => void }) {
  return (
    <>
      <p className="font-serif whitespace-pre-wrap text-[15px] leading-relaxed">{text}</p>
      {!!actions?.length && (
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.map((a) => (
            <PlaceButton key={a} place={a} open={open} />
          ))}
        </div>
      )}
    </>
  );
}

/** A button into another part of the app, shown only if this edition has it. */
function PlaceButton({ place, open, label }: { place: string; open: (id: string) => void; label?: string }) {
  const mod = getModule(place);
  if (!mod) return null;
  return (
    <Button type="button" variant="secondary" trailing={ArrowUpRight} onClick={() => open(place)}>
      {label ?? `Open ${mod.title}`}
    </Button>
  );
}

export const agentPlugin: MurmurPlugin = {
  id: "agent",
  title: edition.productName,
  tagline: `Talk to ${edition.instance.name}: get set up and get work done`,
  icon: Sparkles,
  order: 1,
  kind: "plugin",
  support: issues("agent"),
  backend: `${edition.instance.name}'s own agent`,
  Panel,
};
