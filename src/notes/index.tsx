import { useEffect, useMemo, useRef, useState } from "react";
import {
  NotebookPen,
  CornerDownLeft,
  Trash2,
  Search,
  Hash,
  AtSign,
  X,
  Cloud,
  CloudOff,
  RefreshCw,
  Quote,
  Link2,
  FileText,
  Loader2,
  Share2,
  Users,
  ArrowLeft,
  Smartphone,
  ArrowUpRight,
} from "lucide-react";
import type { MurmurModule, PluginContext } from "../host/types";
import {
  captureNote,
  vaultSummary,
  searchVault,
  deleteNote,
  detectType,
  detectUrl,
  displayPerson,
  entryTitle,
  type NoteType,
  type VaultEntry,
} from "../lib/sensemaking";
import SharedEditor from "./SharedEditor";
import { edition } from "../edition";

/**
 * Notes — core surface.
 *
 * The personal sense-making layer (the work with Matt Black) made concrete.
 * v0.2 closes the "vault sync" seam: a capture no longer just sits in
 * localStorage — it lands in the unified Decent vault (`core/vault`) through the
 * live `/api/sensemaking` route, typed and carrying Matt's *intent* line, so it
 * becomes a first-class note the `understand` plugin can retrieve. localStorage
 * is now an offline mirror + instant feedback, not the source of truth.
 *
 * Distinct from `understand` (the *shared* corpus) — this is your own thinking,
 * captured the way the sense-making assistant captures it: thought + intent +
 * tags + people, reindexed into the same graph.
 */

interface LocalNote {
  id: string;
  body: string;
  intent: string;
  tags: string[];
  people: string[];
  type: NoteType;
  ts: number;
  /** vault path once synced (e.g. "notes/2026-…md"); absent while local-only */
  vaultPath?: string;
  synced: boolean;
}

const KEY = "murmur.notes.v2";
const LEGACY_KEY = "murmur.notes.v1";

function load(): LocalNote[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as LocalNote[];
    // migrate v1 ({ id, body, ts }) → local-only, unsynced
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const old = JSON.parse(legacy) as { id: string; body: string; ts: number }[];
      return old.map((n) => ({
        id: n.id,
        body: n.body,
        intent: "",
        tags: [],
        people: [],
        type: "note" as NoteType,
        ts: n.ts,
        synced: false,
      }));
    }
  } catch {
    /* ignore */
  }
  return [];
}

function typeColor(t?: string): string {
  switch ((t || "").toLowerCase()) {
    case "link":
    case "links":
      return "#00c7be";
    case "quote":
    case "quotes":
      return "#af52de";
    case "person":
    case "people":
      return "#34c759";
    default:
      return "#8a8a8a";
  }
}

function TypeIcon({ type, className }: { type: string; className?: string }) {
  switch ((type || "").toLowerCase()) {
    case "link":
    case "links":
      return <Link2 className={className} />;
    case "quote":
    case "quotes":
      return <Quote className={className} />;
    default:
      return <FileText className={className} />;
  }
}

/** A unified trail item — either a local capture (has body) or a vault entry. */
interface TrailItem {
  key: string;
  ts: number;
  type: string;
  title: string;
  body?: string;
  intent: string;
  tags: string[];
  people: string[];
  vaultPath?: string;
  synced: boolean;
  origin: "local" | "vault";
}

function localToTrail(n: LocalNote): TrailItem {
  return {
    key: n.id,
    ts: n.ts,
    type: n.type,
    title: n.body.slice(0, 80),
    body: n.body,
    intent: n.intent,
    tags: n.tags,
    people: n.people.map(displayPerson),
    vaultPath: n.vaultPath,
    synced: n.synced,
    origin: "local",
  };
}

function vaultToTrail(e: VaultEntry): TrailItem {
  return {
    key: e.path,
    ts: e.created ? new Date(e.created).getTime() : 0,
    type: e.type,
    title: entryTitle(e),
    intent: e.intent,
    tags: e.tags ?? [],
    people: (e.people ?? []).map(displayPerson),
    vaultPath: e.path,
    synced: true,
    origin: "vault",
  };
}

/** A small chip-list input for tags / people. */
function ChipInput({
  value,
  onChange,
  placeholder,
  icon,
  lower,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  icon: React.ReactNode;
  lower?: boolean;
}) {
  const [draft, setDraft] = useState("");
  function commit() {
    const raw = draft.trim().replace(/[,]+$/, "").trim();
    if (!raw) return;
    const v = lower ? raw.toLowerCase().replace(/\s+/g, "-") : raw;
    if (!value.includes(v)) onChange([...value, v]);
    setDraft("");
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[var(--faint)]">{icon}</span>
      {value.map((v) => (
        <span
          key={v}
          className="font-mono flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--raise)] px-2 py-0.5 text-[11px] text-[var(--muted)]"
        >
          {v}
          <button
            onClick={() => onChange(value.filter((x) => x !== v))}
            className="text-[var(--faint)] hover:text-[var(--fg)]"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder={placeholder}
        className="min-w-[7rem] flex-1 bg-transparent text-xs outline-none placeholder:text-[var(--faint)]"
      />
    </div>
  );
}

function Panel({ instance, identity }: PluginContext) {
  const base = instance.birdbrainBase;
  // The mobile companion (Ask/Capture/Trail) — same vault, pocket-sized.
  const surfaceUrl = `${instance.birdbrainBase || ""}/surface`;

  // Personal capture vs. a live shared note. The room key is the only thing
  // two clients must agree on to land in the same Yjs document.
  const [mode, setMode] = useState<"personal" | "shared">("personal");
  const [roomDraft, setRoomDraft] = useState("");
  const [room, setRoom] = useState<string | null>(null);
  const displayName = useMemo(() => {
    if (identity.handle) return identity.handle;
    const k = "murmur.collab.guest";
    let g = sessionStorage.getItem(k);
    if (!g) {
      g = "guest-" + Math.random().toString(36).slice(2, 6);
      sessionStorage.setItem(k, g);
    }
    return g;
  }, [identity.handle]);

  const [notes, setNotes] = useState<LocalNote[]>(load);
  const [draft, setDraft] = useState("");
  const [intent, setIntent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [people, setPeople] = useState<string[]>([]);
  const [capturing, setCapturing] = useState(false);

  const [vaultRecent, setVaultRecent] = useState<VaultEntry[]>([]);
  const [vaultTotal, setVaultTotal] = useState<number | null>(null);
  const [loadingVault, setLoadingVault] = useState(true);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VaultEntry[] | null>(null);
  const [searching, setSearching] = useState(false);

  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(notes));
  }, [notes]);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  async function refreshVault() {
    setLoadingVault(true);
    try {
      const s = await vaultSummary(base);
      setVaultRecent(s.recent);
      setVaultTotal(s.total);
    } catch {
      setVaultRecent([]);
      setVaultTotal(null);
    } finally {
      setLoadingVault(false);
    }
  }

  useEffect(() => {
    void refreshVault();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  const detected: NoteType = useMemo(
    () => (draft.trim() ? detectType(draft) : "note"),
    [draft],
  );
  const detectedUrl = useMemo(
    () => (draft.trim() ? detectUrl(draft) : undefined),
    [draft],
  );

  async function capture() {
    const body = draft.trim();
    if (!body || capturing) return;
    const type = detectType(body);
    const localId = crypto.randomUUID();
    const note: LocalNote = {
      id: localId,
      body,
      intent: intent.trim(),
      tags,
      people,
      type,
      ts: Date.now(),
      synced: false,
    };
    setNotes((prev) => [note, ...prev]);
    setDraft("");
    setIntent("");
    setTags([]);
    setPeople([]);
    setCapturing(true);
    try {
      const res = await captureNote(base, {
        text: note.body,
        intent: note.intent,
        tags: note.tags,
        people: note.people,
        type: note.type,
        url: detectedUrl,
      });
      setNotes((prev) =>
        prev.map((n) =>
          n.id === localId ? { ...n, synced: true, vaultPath: res.path } : n,
        ),
      );
      void refreshVault();
    } catch {
      // stays local-only; the trail shows a retry affordance
    } finally {
      setCapturing(false);
      ref.current?.focus();
    }
  }

  async function retry(n: LocalNote) {
    setNotes((prev) =>
      prev.map((x) => (x.id === n.id ? { ...x, synced: false } : x)),
    );
    try {
      const res = await captureNote(base, {
        text: n.body,
        intent: n.intent,
        tags: n.tags,
        people: n.people,
        type: n.type,
        url: detectUrl(n.body),
      });
      setNotes((prev) =>
        prev.map((x) =>
          x.id === n.id ? { ...x, synced: true, vaultPath: res.path } : x,
        ),
      );
      void refreshVault();
    } catch {
      /* still offline */
    }
  }

  async function removeItem(item: TrailItem) {
    // delete from the vault if it lives there, then drop the local mirror
    if (item.vaultPath) {
      try {
        await deleteNote(base, item.vaultPath);
      } catch {
        /* best-effort */
      }
    }
    setNotes((prev) =>
      prev.filter((n) => n.id !== item.key && n.vaultPath !== item.vaultPath),
    );
    setVaultRecent((prev) => prev.filter((e) => e.path !== item.vaultPath));
    setResults((prev) =>
      prev ? prev.filter((e) => e.path !== item.vaultPath) : prev,
    );
  }

  async function runSearch(term: string) {
    const q = term.trim();
    setQuery(term);
    if (!q) {
      setResults(null);
      return;
    }
    setSearching(true);
    try {
      setResults(await searchVault(base, q));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  /** Unified, de-duplicated, reverse-chron trail. */
  const trail: TrailItem[] = useMemo(() => {
    const byPath = new Map<string, TrailItem>();
    for (const e of vaultRecent) byPath.set(e.path, vaultToTrail(e));
    const out: TrailItem[] = [];
    const seenPaths = new Set<string>();
    for (const n of notes) {
      const t = localToTrail(n);
      if (n.vaultPath && byPath.has(n.vaultPath)) {
        // local mirror wins (it carries the body); skip the vault twin
        seenPaths.add(n.vaultPath);
      }
      out.push(t);
    }
    for (const [path, t] of byPath) {
      if (!seenPaths.has(path)) out.push(t);
    }
    return out.sort((a, b) => b.ts - a.ts);
  }, [notes, vaultRecent]);

  const showing: TrailItem[] | null = results
    ? results.map(vaultToTrail)
    : null;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-[var(--line)] px-8 pt-7 pb-5">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--faint)]">
          <NotebookPen className="h-3.5 w-3.5" />
          notes
        </div>
        <div className="mt-2 flex items-end justify-between gap-4">
          <h1 className="font-tight text-2xl font-medium">Personal sensemaking</h1>
          <span className="font-mono text-[10px] text-[var(--faint)]">
            {loadingVault
              ? "syncing vault…"
              : vaultTotal != null
                ? `${vaultTotal} in the vault`
                : edition.vaultSync
                  ? "vault offline — capturing locally"
                  : "on this device"}
          </span>
        </div>
        <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">
          {edition.vaultSync ? (
            <>
              Capture a thought with the <em>why</em>; it lands in {edition.vaultName} as
              a first-class note — your private sensemaking layer. Carry it in your
              pocket with{" "}
              <a
                href={surfaceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[var(--fg)] underline decoration-[var(--line-strong)] underline-offset-2"
              >
                <Smartphone className="h-3 w-3" /> Surface
                <ArrowUpRight className="h-2.5 w-2.5" />
              </a>{" "}
              — the same vault, on mobile.
            </>
          ) : (
            <>
              Capture a thought with the <em>why</em>. It stays on this device,
              yours alone, until you connect your own server.
            </>
          )}
        </p>

        {/* Personal capture vs. a live shared note */}
        <div className="mt-4 inline-flex rounded-full border border-[var(--line)] bg-[var(--raise)] p-0.5 font-mono text-[11px]">
          {(["personal", "shared"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 transition ${
                mode === m
                  ? "bg-[var(--card)] text-[var(--fg)] shadow-sm"
                  : "text-[var(--faint)] hover:text-[var(--muted)]"
              }`}
            >
              {m === "personal" ? (
                <NotebookPen className="h-3 w-3" />
              ) : (
                <Share2 className="h-3 w-3" />
              )}
              {m}
            </button>
          ))}
        </div>
      </header>

      {mode === "personal" ? (
        <>
      {/* Capture */}
      <div className="px-8 pt-6">
        <div
          className="prism-hover rounded-[var(--radius)] border border-[var(--line-strong)] bg-[var(--card)] px-4 py-3"
          data-active={draft.length > 0}
        >
          <textarea
            ref={ref}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void capture();
              }
            }}
            rows={3}
            placeholder="What are you making sense of?"
            className="w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-[var(--faint)]"
          />

          {/* Intent — Matt's "big piece": the step that turns a note into sensemaking */}
          <div className="mt-2 flex items-center gap-2 border-t border-[var(--line)] pt-2">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: typeColor(detected) }}
              title={`detected type: ${detected}`}
            />
            <input
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void capture();
                }
              }}
              placeholder="Why does this matter? (the intent — optional but the point)"
              className="w-full bg-transparent text-[13px] italic outline-none placeholder:not-italic placeholder:text-[var(--faint)]"
            />
          </div>

          {/* Tags + people → vault frontmatter */}
          <div className="mt-2 grid gap-2 border-t border-[var(--line)] pt-2 sm:grid-cols-2">
            <ChipInput
              value={tags}
              onChange={setTags}
              placeholder="tags"
              lower
              icon={<Hash className="h-3 w-3" />}
            />
            <ChipInput
              value={people}
              onChange={setPeople}
              placeholder="people"
              icon={<AtSign className="h-3 w-3" />}
            />
          </div>

          <div className="mt-3 flex items-center justify-between">
            <span className="font-mono text-[10px] text-[var(--faint)]">
              {detectedUrl
                ? `link · ${edition.vaultSync ? "syncs to core/vault" : "kept on this device"}`
                : `${detected} · ${edition.vaultSync ? "syncs to core/vault" : "kept on this device"}`}
            </span>
            <button
              onClick={() => void capture()}
              disabled={!draft.trim() || capturing}
              className="font-mono flex items-center gap-1.5 rounded-full border border-[var(--line)] px-3 py-1 text-xs text-[var(--muted)] transition hover:border-[var(--line-strong)] hover:text-[var(--fg)] disabled:opacity-40"
            >
              {capturing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <CornerDownLeft className="h-3 w-3" />
              )}
              capture
            </button>
          </div>
        </div>
      </div>

      {/* Recall / search the vault */}
      <div className="px-8 pt-4">
        <div className="flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--raise)] px-3 py-1.5">
          <Search className="h-3.5 w-3.5 text-[var(--faint)]" />
          <input
            value={query}
            onChange={(e) => void runSearch(e.target.value)}
            placeholder="Recall — search everything you've captured"
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-[var(--faint)]"
          />
          {searching && <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--faint)]" />}
          {query && !searching && (
            <button
              onClick={() => runSearch("")}
              className="text-[var(--faint)] hover:text-[var(--fg)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Trail */}
      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-5">
        {showing ? (
          showing.length === 0 ? (
            <Empty text={`Nothing in the vault matches “${query}”.`} />
          ) : (
            <>
              <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--faint)]">
                {showing.length} result{showing.length === 1 ? "" : "s"}
              </div>
              <List items={showing} onRemove={removeItem} onRetry={retry} notes={notes} />
            </>
          )
        ) : trail.length === 0 ? (
          <Empty text={edition.vaultSync ? "No notes yet. The first capture starts your trail — and lands in the vault." : "No notes yet. The first capture starts your trail."} />
        ) : (
          <List items={trail} onRemove={removeItem} onRetry={retry} notes={notes} />
        )}
      </div>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col px-8 pt-6 pb-5">
          {room ? (
            <>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 font-mono text-[11px] text-[var(--faint)]">
                  <button
                    onClick={() => setRoom(null)}
                    className="flex items-center gap-1 hover:text-[var(--fg)]"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> rooms
                  </button>
                  <span className="text-[var(--line-strong)]">/</span>
                  <span className="text-[var(--fg)]">{room}</span>
                </div>
                <span className="font-mono text-[10px] text-[var(--faint)]">
                  you are{" "}
                  <span className="text-[var(--fg)]">{displayName}</span>
                </span>
              </div>
              <SharedEditor room={room} base={base} displayName={displayName} />
            </>
          ) : (
            <div className="mx-auto mt-6 w-full max-w-md">
              <div className="rounded-[var(--radius)] border border-[var(--line-strong)] bg-[var(--card)] p-5">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--faint)]">
                  <Users className="h-3.5 w-3.5" /> shared note
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Pick a name two people both type in — everyone on the same name
                  edits one live document. Save it to the vault when you're done.
                </p>
                <div className="mt-3 flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--raise)] px-3 py-1.5">
                  <Hash className="h-3.5 w-3.5 text-[var(--faint)]" />
                  <input
                    value={roomDraft}
                    onChange={(e) => setRoomDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const r = roomDraft.trim().toLowerCase().replace(/\s+/g, "-");
                        if (r) setRoom(r);
                      }
                    }}
                    placeholder="room name, e.g. fttf-brief"
                    className="w-full bg-transparent text-[13px] outline-none placeholder:text-[var(--faint)]"
                  />
                </div>
                <button
                  onClick={() => {
                    const r = roomDraft.trim().toLowerCase().replace(/\s+/g, "-");
                    if (r) setRoom(r);
                  }}
                  disabled={!roomDraft.trim()}
                  className="font-mono mt-3 flex w-full items-center justify-center gap-1.5 rounded-full border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--muted)] transition hover:border-[var(--line-strong)] hover:text-[var(--fg)] disabled:opacity-40"
                >
                  <Share2 className="h-3 w-3" /> open shared note
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-dashed border-[var(--line-strong)] bg-[var(--raise)] px-5 py-6 text-center">
      <p className="text-sm text-[var(--muted)]">{text}</p>
    </div>
  );
}

function List({
  items,
  onRemove,
  onRetry,
  notes,
}: {
  items: TrailItem[];
  onRemove: (i: TrailItem) => void;
  onRetry: (n: LocalNote) => void;
  notes: LocalNote[];
}) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => {
        const local = notes.find((n) => n.id === item.key);
        return (
          <article
            key={item.key}
            className="prism-hover group rounded-[var(--radius)] border border-[var(--line)] bg-[var(--card)] px-4 py-3"
          >
            <div className="flex items-start gap-2.5">
              <span
                className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                style={{ background: `${typeColor(item.type)}1a` }}
              >
                <TypeIcon
                  type={item.type}
                  className="h-3 w-3"
                />
              </span>
              <div className="min-w-0 flex-1">
                {item.body ? (
                  <p className="font-serif whitespace-pre-wrap text-[14.5px] leading-relaxed">
                    {item.body}
                  </p>
                ) : (
                  <p className="text-[14.5px] leading-relaxed text-[var(--fg)]">
                    {item.title}
                  </p>
                )}
                {item.intent && (
                  <p className="mt-1 text-[12.5px] italic text-[var(--muted)]">
                    {item.intent}
                  </p>
                )}
                {(item.tags.length > 0 || item.people.length > 0) && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {item.tags.map((t) => (
                      <span
                        key={`t-${t}`}
                        className="font-mono rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] text-[var(--muted)]"
                      >
                        #{t}
                      </span>
                    ))}
                    {item.people.map((p) => (
                      <span
                        key={`p-${p}`}
                        className="font-mono rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] text-[var(--muted)]"
                      >
                        @{p}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <span className="font-mono text-[10px] text-[var(--faint)]">
                    {item.ts
                      ? new Date(item.ts).toLocaleString([], {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : ""}
                  </span>
                  {item.synced ? (
                    <span
                      className="flex items-center gap-1 font-mono text-[10px] text-[var(--faint)]"
                      title={item.vaultPath}
                    >
                      <Cloud className="h-3 w-3" /> vault
                    </span>
                  ) : local ? (
                    <button
                      onClick={() => onRetry(local)}
                      className="flex items-center gap-1 font-mono text-[10px] text-[#c1271d] hover:underline"
                      title="Capture is local-only — retry vault sync"
                    >
                      <CloudOff className="h-3 w-3" /> local
                      <RefreshCw className="h-2.5 w-2.5" />
                    </button>
                  ) : (
                    <span className="flex items-center gap-1 font-mono text-[10px] text-[var(--faint)]">
                      <CloudOff className="h-3 w-3" /> local
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => onRemove(item)}
                className="text-[var(--faint)] opacity-0 transition hover:text-[#c1271d] group-hover:opacity-100"
                title="Delete (from vault too)"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export const notesSurface: MurmurModule = {
  id: "notes",
  title: "Notes",
  tagline: `Personal sensemaking — capture into ${edition.vaultName}`,
  icon: NotebookPen,
  order: 1,
  kind: "core",
  backend: edition.vaultSync ? "Decent vault (core/vault)" : "On this device",
  Panel,
};
