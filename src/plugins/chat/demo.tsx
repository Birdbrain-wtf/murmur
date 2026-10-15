import { colourful, inkOf, onInk } from "../../demo/ink";
import { useEffect, useRef, useState } from "react";
import { Check, Hash, MessageSquare, Phone, Send, UserRound, Users, Video, X } from "lucide-react";
import type { PluginContext } from "../../host/types";
import { edition, groupWord } from "../../edition";
import { Button, Dot, Eyebrow, Notice, Page, PageHeader, inputClass } from "../../ui";
import { sampleRooms, type SampleMessage } from "../../demo/sample";
import { CallRoom, SCRIPTS, type CallSpec } from "../../demo/callroom";

/**
 * Chat in a demo edition, before its members have logins: the same rooms and
 * timeline as the live chat, filled with sample rooms (`demo/sample.ts`).
 * Messages sent here stay in this window and go nowhere.
 */
// The same people wear the same colours across the demo (Alice coral, Bob blue, Carol pink).
const PEOPLE: Record<string, string> = { alice: "#e5383b", you: "#e5383b", bob: "#0078bf", carol: "#ff48b0", dave: "#1f9d6b", erin: "#7b4fc4" };

// Alice's contacts in the group: who a call can ring.
const CONTACTS: { name: string; line: string }[] = [
  { name: "Bob", line: "member" },
  { name: "Carol", line: "resident" },
  { name: "Dave", line: "steward" },
  { name: "Erin", line: "member" },
];
const inRoom = (id: string) => (id === "bob" ? ["Bob"] : id === "third" ? ["Bob", "Carol"] : CONTACTS.map((c) => c.name));
const personInk = (who: string) => PEOPLE[who.toLowerCase()] ?? inkOf(who.toLowerCase());

export function DemoChat({ open }: PluginContext) {
  const [rooms, setRooms] = useState(() => sampleRooms.map((r) => ({ ...r, messages: [...r.messages] })));
  const [active, setActive] = useState(rooms[0].id);
  const [draft, setDraft] = useState("");
  const [seen, setSeen] = useState<string[]>([rooms[0].id]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [now] = useState(() => Date.now());
  const room = rooms.find((r) => r.id === active)!;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [active, room.messages.length]);

  function pick(id: string) {
    setActive(id);
    setSeen((s) => [...new Set([...s, id])]);
  }

  function post(id: string, m: SampleMessage) {
    setRooms((rs) => rs.map((r) => (r.id === id ? { ...r, messages: [...r.messages, m] } : r)));
  }

  function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    post(active, { from: "You", body, ago: 0 });
    const reply = active === "bob" ? "Bob" : "Carol";
    setTimeout(
      () =>
        post(active, {
          from: reply,
          body: edition.showcase
            ? "Got it. (Sample reply. In your own app, everyone in this room sees it.)"
            : `Got it. (Sample reply. Once ${edition.instance.name} has logins, everyone in this room sees it.)`,
          ago: 0,
        }),
      1200,
    );
  }

  // Calls open right here, in the same window: ring one person, or pick who from the room.
  const [calling, setCalling] = useState<CallSpec | null>(null);
  const [picker, setPicker] = useState<"voice" | "video" | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const ring = (people: string[], kind: "voice" | "video", title: string) => {
    setPicker(null);
    setCalling({ title, kind, people, ringing: true, script: people.length === 1 && people[0] === "Bob" ? SCRIPTS.bob : SCRIPTS.room });
  };
  const call = (kind: "voice" | "video") => {
    if (active === "bob") return ring(["Bob"], kind, "Bob");
    setChosen(inRoom(active));
    setPicker(kind);
  };

  if (calling)
    return (
      <Page>
        <CallRoom spec={calling} onLeave={() => setCalling(null)} />
      </Page>
    );

  return (
    <Page>
      <PageHeader
        icon={MessageSquare}
        eyebrow="chat"
        title="Chat"
        lede={`Talk to your ${groupWord}.`}
      />
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-44 shrink-0 flex-col border-r border-[var(--line)] md:w-64">
          <div className="border-b border-[var(--line)] px-4 py-3 md:px-8">
            <Eyebrow icon={Hash}>rooms</Eyebrow>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-2">
            {rooms.map((r) => (
              <button
                key={r.id}
                onClick={() => pick(r.id)}
                data-active={r.id === active}
                className="prism-hover flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-[var(--muted)] data-[active=true]:text-[var(--fg)]"
              >
                {r.id === "bob" ? (
                  <UserRound className="h-3.5 w-3.5 shrink-0 text-[var(--faint)]" />
                ) : (
                  <Hash className="h-3.5 w-3.5 shrink-0 text-[var(--faint)]" />
                )}
                <span className="truncate">{r.name}</span>
                {(r.unread || r.id === "bob") && !seen.includes(r.id) && (
                  <span className="ml-auto">
                    <Dot tone="live" />
                  </span>
                )}
              </button>
            ))}
            <div className="mt-2 border-t border-[var(--line)] px-4 pt-3 pb-1 md:px-8">
              <Eyebrow icon={Users}>people</Eyebrow>
            </div>
            {CONTACTS.map((c) => (
              <div key={c.name} className="flex items-center gap-2 px-4 py-1.5 md:px-8">
                <span className="font-tight flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-medium" style={{ background: personInk(c.name), color: onInk(personInk(c.name)) }}>
                  {c.name[0]}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
                <button aria-label={`Voice call ${c.name}`} title={`Voice call ${c.name}`} onClick={() => ring([c.name], "voice", c.name)} className="rounded p-1 text-[var(--faint)] hover:text-[var(--fg)]">
                  <Phone className="h-3.5 w-3.5" />
                </button>
                <button aria-label={`Video call ${c.name}`} title={`Video call ${c.name}`} onClick={() => ring([c.name], "video", c.name)} className="rounded p-1 text-[var(--faint)] hover:text-[var(--fg)]">
                  <Video className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="border-t border-[var(--line)] p-3">
            <p className="text-[11px] leading-relaxed text-[var(--faint)]">
              Members sign in with their passkey. No password.
            </p>
            <Button variant="quiet" className="mt-1" onClick={() => open("identity")}>
              See a sample profile
            </Button>
          </div>
        </aside>

        <section className="relative flex min-w-0 flex-1 flex-col">
          {picker && (
            <div className="absolute inset-0 z-20 flex items-start justify-center bg-black/25 px-4 pt-16">
              <div role="dialog" aria-label="Who to call" className="w-full max-w-sm rounded-[var(--radius)] border border-[var(--line)] bg-[var(--card)] p-4 shadow-xl">
                <div className="flex items-center justify-between">
                  <span className="font-tight text-[15px] font-medium">{picker === "video" ? "Video call" : "Voice call"} from {room.name}</span>
                  <button aria-label="Close" onClick={() => setPicker(null)} className="rounded p-1 text-[var(--muted)] hover:text-[var(--fg)]">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-1 text-[12px] text-[var(--muted)]">Who to ring?</p>
                <ul className="mt-3 flex flex-col gap-1">
                  {CONTACTS.map((c) => {
                    const on = chosen.includes(c.name);
                    return (
                      <li key={c.name}>
                        <button
                          role="checkbox"
                          aria-checked={on}
                          onClick={() => setChosen((x) => (on ? x.filter((n) => n !== c.name) : [...x, c.name]))}
                          className="prism-hover flex w-full items-center gap-3 rounded-[8px] px-2 py-1.5 text-left"
                        >
                          <span className="font-tight flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-medium" style={{ background: personInk(c.name), color: onInk(personInk(c.name)) }}>
                            {c.name[0]}
                          </span>
                          <span className="flex-1 text-sm">
                            {c.name} <span className="text-[12px] text-[var(--muted)]">{c.line}</span>
                          </span>
                          <span className={`flex h-4 w-4 items-center justify-center rounded border border-[var(--line-strong)] ${on ? "bg-[var(--fg)] text-[var(--bg)]" : ""}`}>
                            {on && <Check className="h-3 w-3" />}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-4 flex justify-end">
                  <Button variant="primary" icon={picker === "video" ? Video : Phone} disabled={!chosen.length} onClick={() => ring(chosen, picker, room.name)}>
                    Ring {chosen.length === 1 ? chosen[0] : `${chosen.length} people`}
                  </Button>
                </div>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-3 md:px-8">
            <Hash className="h-4 w-4 text-[var(--faint)]" />
            <span className="font-tight truncate text-sm font-medium">{room.name}</span>
            <span className="ml-auto flex items-center gap-2">
              <Button icon={Phone} onClick={() => call("voice")}>
                <span className="hidden md:inline">Voice call</span>
              </Button>
              <Button icon={Video} onClick={() => call("video")}>
                <span className="hidden md:inline">Video call</span>
              </Button>
            </span>
          </div>
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-8">
            <div className="flex flex-col gap-3">
              {room.messages.map((m, i) => (
                <div key={i} className="flex gap-3">
                  {colourful && (
                    <span
                      className="font-tight mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-medium"
                      style={{ background: personInk(m.from), color: onInk(personInk(m.from)) }}
                    >
                      {(m.from === "You" ? "Alice" : m.from)[0].toUpperCase()}
                    </span>
                  )}
                  <div className="flex min-w-0 flex-col">
                  <div className="flex items-baseline gap-2">
                    <span
                      className="font-mono text-[11px]"
                      style={{ color: m.from === "You" ? "var(--accent)" : "var(--faint)" }}
                    >
                      {m.from.toLowerCase()}
                    </span>
                    <span className="font-mono text-[10px] text-[var(--faint)]">
                      {new Date(now - m.ago * 60_000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-[14px] leading-relaxed">{m.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="px-4 pb-2 md:px-8">
            <Notice>Sample rooms. Alice, Bob and Carol are made up.</Notice>
          </div>
          {/* pr-36 keeps the composer clear of the host's floating Suggest button */}
          <form onSubmit={send} className="flex items-center gap-3 border-t border-[var(--line)] py-3 pl-4 pr-36 md:pl-8">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Message ${room.name}`}
              className={`${inputClass} flex-1`}
            />
            <Button type="submit" size="md" icon={Send} disabled={!draft.trim()}>
              Send
            </Button>
          </form>
        </section>
      </div>
    </Page>
  );
}
