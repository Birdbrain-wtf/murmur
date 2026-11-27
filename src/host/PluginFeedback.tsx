import { useEffect, useRef, useState } from "react";
import { MessageSquarePlus, X, Check, Bug, Lightbulb, Type, ArrowUpRight, FlaskConical, ImagePlus, Mic, Square, FileText } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Identity, InstanceConfig, Support } from "./types";
import { isTauri } from "./useUpdater";
import { Button } from "../ui";
import { openInBrowser } from "../identity/passkey";

/**
 * The host-level "suggest a change" affordance.
 *
 * It floats over every module panel (the host owns it, not the plugins — they
 * each draw their own header, so a uniform surface has to live in the shell).
 * A suggestion POSTs to `/api/murmur/feedback`, tagged with the active plugin,
 * the instance, and who sent it, and lands in the append-only backlog ledger.
 * Fire-and-forget: the panel never blocks on it.
 *
 * Under the form sits the plugin's own route back (`support` on the module):
 * where to get help or report a bug in that plugin and get an answer. A lab
 * plugin says so at the top.
 *
 * A suggestion can carry pictures (or a PDF) and one voice note, so people can
 * show or say what they want to see instead of typing it. Photos are shrunk on
 * the device before sending; the voice note is capped at two minutes.
 */

type Kind = "idea" | "bug" | "copy";

const KINDS: { k: Kind; label: string; Icon: LucideIcon }[] = [
  { k: "idea", label: "Idea", Icon: Lightbulb },
  { k: "bug", label: "Bug", Icon: Bug },
  { k: "copy", label: "Copy", Icon: Type },
];

const MAX_FILES = 4;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_VOICE_SECONDS = 120;

type Attachment = { id: string; name: string; type: string; data: string; preview?: string };

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Shrink a photo to at most 1600px on its long side, as JPEG, so a phone picture sends quickly. */
async function shrinkImage(file: File): Promise<string> {
  if (file.type === "image/gif" || file.type === "image/svg+xml") return toDataUrl(file);
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return toDataUrl(file);
  }
}

function voiceMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const t of ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

const canRecord =
  typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";

function clock(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

let cachedVersion: string | null = null;
async function appVersion(): Promise<string> {
  if (cachedVersion !== null) return cachedVersion;
  if (!isTauri) return (cachedVersion = "web");
  try {
    const { getVersion } = await import("@tauri-apps/api/app");
    cachedVersion = await getVersion();
  } catch {
    cachedVersion = "unknown";
  }
  return cachedVersion;
}

export function PluginFeedback({
  pluginId,
  pluginTitle,
  identity,
  instance,
  lab,
  support,
}: {
  pluginId: string;
  pluginTitle: string;
  identity: Identity;
  instance: InstanceConfig;
  lab?: boolean;
  support?: Support;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("idea");
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"edit" | "sending" | "sent" | "error">("edit");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [voice, setVoice] = useState<Attachment | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);

  function stopTracks() {
    recRef.current?.stream.getTracks().forEach((t) => t.stop());
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }

  function clearAll() {
    if (recRef.current && recRef.current.state !== "inactive") {
      recRef.current.ondataavailable = null;
      recRef.current.onstop = null;
      recRef.current.stop();
    }
    stopTracks();
    setRecording(false);
    setFiles([]);
    setVoice(null);
    setNote(null);
  }

  async function addFiles(list: FileList | null) {
    if (!list) return;
    setNote(null);
    const room = MAX_FILES - files.length;
    const picked = Array.from(list).slice(0, Math.max(0, room));
    if (list.length > room) setNote(`Up to ${MAX_FILES} pictures or files.`);
    const added: Attachment[] = [];
    for (const f of picked) {
      const isImage = f.type.startsWith("image/");
      if (!isImage && f.type !== "application/pdf") {
        setNote("Pictures and PDFs only.");
        continue;
      }
      if (!isImage && f.size > MAX_FILE_BYTES) {
        setNote(`${f.name} is over 5 MB.`);
        continue;
      }
      const data = isImage ? await shrinkImage(f) : await toDataUrl(f);
      if (data.length > MAX_FILE_BYTES * 1.4) {
        setNote(`${f.name} is too large.`);
        continue;
      }
      added.push({
        id: Math.random().toString(36).slice(2),
        name: f.name,
        type: isImage ? data.slice(5, data.indexOf(";")) : f.type,
        data,
        preview: isImage ? data : undefined,
      });
    }
    setFiles((cur) => [...cur, ...added].slice(0, MAX_FILES));
  }

  async function startRecording() {
    setNote(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = voiceMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stopTracks();
        setRecording(false);
        const type = (rec.mimeType || mime || "audio/webm").split(";")[0];
        const blob = new Blob(chunks, { type });
        if (!blob.size) return;
        const data = await toDataUrl(blob);
        setVoice({ id: "voice", name: `voice-note.${type.includes("mp4") ? "m4a" : type.split("/")[1]}`, type, data });
      };
      recRef.current = rec;
      rec.start(1000);
      setRecording(true);
      setSeconds(0);
      const started = Date.now();
      timerRef.current = window.setInterval(() => {
        const s = Math.floor((Date.now() - started) / 1000);
        setSeconds(s);
        if (s >= MAX_VOICE_SECONDS && rec.state !== "inactive") rec.stop();
      }, 250);
    } catch {
      stopTracks();
      setRecording(false);
      setNote("Couldn't use the microphone. Check the app is allowed to use it.");
    }
  }

  function stopRecording() {
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
  }

  useEffect(() => () => stopTracks(), []);

  // Reset everything when the user switches to a different plugin.
  useEffect(() => {
    setOpen(false);
    setText("");
    setKind("idea");
    setPhase("edit");
    clearAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pluginId]);

  useEffect(() => {
    if (open && phase === "edit") taRef.current?.focus();
  }, [open, phase]);

  async function submit() {
    const body = text.trim();
    const attachments = [...files, ...(voice ? [voice] : [])].map(({ name, type, data }) => ({ name, type, data }));
    if ((!body && !attachments.length) || recording || phase === "sending") return;
    setPhase("sending");
    try {
      const base =
        instance.birdbrainBase?.trim() ||
        (typeof window !== "undefined" ? window.location.origin : "");
      const res = await fetch(`${base}/api/murmur/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plugin: pluginId,
          pluginTitle,
          kind,
          text: body,
          attachments,
          instance: { slug: instance.slug, name: instance.name },
          from: identity.handle,
          fromDid: identity.did,
          version: await appVersion(),
          ua: typeof navigator !== "undefined" ? navigator.userAgent : "",
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setPhase("sent");
      setText("");
      clearAll();
      setTimeout(() => {
        setOpen(false);
        setPhase("edit");
      }, 1800);
    } catch {
      setPhase("error");
    }
  }

  return (
    <div className="absolute bottom-4 right-4 z-10 flex flex-col items-end">
      {open && (
        <div className="mb-2 max-h-[calc(100dvh-6rem)] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-[calc(var(--radius)+4px)] border border-[var(--line-strong)] bg-[var(--card)] shadow-[0_20px_60px_rgba(0,0,0,0.18)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <div className="min-w-0">
              <div className="font-tight text-sm font-medium">Suggest a change</div>
              <div className="truncate text-[11px] text-[var(--muted)]">
                to {pluginTitle}
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-[var(--faint)] transition hover:text-[var(--fg)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {lab && (
            <div className="flex items-start gap-2 border-b border-[var(--line)] px-4 py-2.5 text-[11px] leading-relaxed text-[var(--muted)]">
              <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {pluginTitle} is in the lab: early, for testing, and it may change. Bug reports help most.
              </span>
            </div>
          )}

          {phase === "sent" ? (
            <div className="flex items-center gap-2 px-4 py-6 text-sm text-[var(--muted)]">
              <Check className="h-4 w-4 text-[var(--ok)]" />
              Sent. Thank you.
            </div>
          ) : (
            <div className="px-4 py-3.5">
              <div className="mb-2.5 flex gap-1.5">
                {KINDS.map(({ k, label, Icon }) => (
                  <button
                    key={k}
                    onClick={() => setKind(k)}
                    data-active={kind === k}
                    className="prism-hover flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius)] border border-[var(--line)] py-1.5 text-xs text-[var(--muted)] transition data-[active=true]:border-[var(--line-strong)] data-[active=true]:bg-[var(--raise)] data-[active=true]:text-[var(--fg)]"
                  >
                    <Icon className="h-3.5 w-3.5" /> {label}
                  </button>
                ))}
              </div>

              <textarea
                ref={taRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
                }}
                placeholder={`What would make ${pluginTitle} better? Type it, add a picture or say it.`}
                rows={3}
                className="w-full resize-y rounded-[var(--radius)] border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm outline-none placeholder:text-[var(--faint)] focus:border-[var(--line-strong)]"
              />

              {(files.length > 0 || voice) && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {files.map((f) => (
                    <div key={f.id} className="relative">
                      {f.preview ? (
                        <img src={f.preview} alt={f.name} className="h-14 w-14 rounded-[var(--radius)] border border-[var(--line)] object-cover" />
                      ) : (
                        <div className="flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--raise)] px-1 text-[9px] text-[var(--muted)]">
                          <FileText className="h-4 w-4" />
                          <span className="w-full truncate text-center">{f.name}</span>
                        </div>
                      )}
                      <button
                        onClick={() => setFiles((cur) => cur.filter((x) => x.id !== f.id))}
                        aria-label={`Remove ${f.name}`}
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--card)] text-[var(--muted)] hover:text-[var(--fg)]"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {voice && (
                    <div className="flex w-full items-center gap-1.5">
                      <audio src={voice.data} controls className="h-8 min-w-0 flex-1" />
                      <button
                        onClick={() => setVoice(null)}
                        aria-label="Remove voice note"
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--muted)] hover:text-[var(--fg)]"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-2 flex gap-1.5">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  hidden
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={files.length >= MAX_FILES || recording}
                  className="prism-hover flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius)] border border-[var(--line)] py-1.5 text-xs text-[var(--muted)] transition hover:text-[var(--fg)] disabled:opacity-45"
                >
                  <ImagePlus className="h-3.5 w-3.5" /> Add picture
                </button>
                {canRecord &&
                  (recording ? (
                    <button
                      onClick={stopRecording}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius)] border border-[var(--danger)] py-1.5 text-xs font-medium text-[var(--danger)] transition"
                    >
                      <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--danger)]" />
                      <Square className="h-3 w-3 fill-current" /> Stop {clock(seconds)}
                    </button>
                  ) : (
                    <button
                      onClick={startRecording}
                      disabled={!!voice}
                      className="prism-hover flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius)] border border-[var(--line)] py-1.5 text-xs text-[var(--muted)] transition hover:text-[var(--fg)] disabled:opacity-45"
                    >
                      <Mic className="h-3.5 w-3.5" /> {voice ? "Voice note added" : "Voice note"}
                    </button>
                  ))}
              </div>

              {note && <p className="mt-1.5 text-[11px] text-[var(--muted)]">{note}</p>}

              {phase === "error" && (
                <p className="mt-1.5 text-[11px] text-[var(--danger)]">
                  Couldn't send. Check your connection and try again.
                </p>
              )}

              <div className="mt-2.5 flex items-center justify-between">
                <span className="text-[11px] text-[var(--faint)]">
                  Goes to the people who build {instance.name}'s app.
                </span>
                <Button
                  variant="primary"
                  onClick={submit}
                  disabled={(!text.trim() && !files.length && !voice) || recording}
                  busy={phase === "sending"}
                >
                  Send
                </Button>
              </div>
            </div>
          )}

          {support && (
            <button
              onClick={() => openInBrowser(support.href)}
              className="prism-hover flex w-full items-center justify-between gap-2 border-t border-[var(--line)] px-4 py-2.5 text-left text-[11px] text-[var(--muted)] transition hover:text-[var(--fg)]"
            >
              <span className="min-w-0 truncate">
                Help or a bug in {pluginTitle}? {support.label}
              </span>
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
            </button>
          )}
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        title={`Suggest a change to ${pluginTitle}`}
        className="prism-hover flex items-center gap-1.5 rounded-[var(--radius)] border border-[var(--line-strong)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] shadow-[0_6px_20px_rgba(0,0,0,0.08)] transition hover:text-[var(--fg)]"
      >
        <MessageSquarePlus className="h-3.5 w-3.5" />
        Suggest
      </button>
    </div>
  );
}
