import { useEffect, useState } from "react";
import { SlidersHorizontal, Palette, Plus, X, Copy, Check, RotateCcw, KeyRound, Trash2, Lock, Blocks, Info } from "lucide-react";
import { deleteSecret, listSecrets, persistent, saveSecret, validName, type SecretMeta } from "../lib/secrets";
import { isTauri } from "../host/useUpdater";
import { Page, PageHeader, PageBody, Section, Card, List, Row, Status, Notice, Button, Field, Facts, inputClass } from "../ui";
import { hasLightClient, removeCopy, setKeepCopy, useChain, useNode, type NodeStatus } from "../lib/chain";
import type { MurmurModule, PluginContext } from "../host/types";
import {
  useSkin,
  encodeSkin,
  decodeSkin,
  DECENT_DEFAULTS,
  SKIN_PRESETS,
  BRAND_PRESETS,
  EMPTY_SKIN,
  type Skin,
} from "../host/useSkin";
import { edition } from "../edition";

/**
 * Settings: this computer. Keys in the system's secure store, what version of
 * the app this is, the chain the app follows itself, and how it looks. Who you
 * are and your roles (membership, check-ins, the operations console) live in
 * Profile, beside the rest of your identity.
 */
function Panel({ instance }: PluginContext) {
  return (
    <Page>
      <PageHeader
        icon={SlidersHorizontal}
        eyebrow="settings"
        title="Settings"
        lede="This computer: your keys, the version you're running, the chain the app follows, and how it looks."
      />
      <PageBody>
        <Secrets />
        <About />
        <ChainSection />
        <Appearance instance={instance} />
      </PageBody>
    </Page>
  );
}

function About() {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    if (!isTauri) return setVersion(null);
    import("@tauri-apps/api/app")
      .then(({ getVersion }) => getVersion())
      .then(setVersion)
      .catch(() => setVersion(null));
  }, []);
  const host = new URL(edition.signIn.approve).host;
  return (
    <Section label="This app" icon={Info}>
      <Card tone="quiet">
        <Row
          title={`${edition.productName}${version ? ` ${version}` : ""}`}
          status={isTauri ? <Status tone="ok">desktop app</Status> : <Status tone="warn">browser preview</Status>}
          detail={
            isTauri
              ? `Updates are signed by ${edition.instance.name} and come from ${host}. When one is ready you'll see it at the bottom of the window.`
              : "The browser preview has no secure store, light client or updates. Use the desktop app for those."
          }
        />
      </Card>
    </Section>
  );
}

function Appearance({ instance }: { instance: PluginContext["instance"] }) {
  const { skin, update, set, reset } = useSkin();

  // Each edition offers its own brand and the neutral skins, never another
  // edition's or a client's look.
  const ownBrand = BRAND_PRESETS.filter((p) => p.id === (edition.defaultSkin || "decent"));
  const presets = [...ownBrand, ...SKIN_PRESETS];
  const activePreset =
    presets.find((p) => encodeSkin({ ...EMPTY_SKIN, ...p.skin }) === encodeSkin(skin))?.id ?? null;

  return (
    <Section
      label="Appearance"
      icon={Palette}
      lede="White stays the resting state. A skin changes the colour that appears when you use the app, the name and the corners. It applies straight away and stays on this computer."
      aside={
        <Button variant="quiet" icon={RotateCcw} onClick={reset}>
          Reset to {edition.productName}
        </Button>
      }
    >
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => {
          const on = activePreset === p.id;
          const swatches = (p.skin.spectrum ?? DECENT_DEFAULTS.spectrum).slice(0, 4);
          return (
            <button
              key={p.id}
              onClick={() => set({ ...EMPTY_SKIN, ...p.skin })}
              data-active={on}
              className="prism-hover flex items-center gap-2 rounded-[var(--radius)] border border-[var(--line-strong)] bg-[var(--card)] px-3 py-1.5 text-xs transition data-[active=true]:border-[var(--fg)]"
            >
              {p.skin.logo ? (
                <img src={p.skin.logo as string} alt="" className="h-4 w-4 rounded-sm object-cover" />
              ) : (
                <span className="flex">
                  {swatches.map((c, i) => (
                    <span
                      key={i}
                      className="h-3 w-3 rounded-full ring-1 ring-white"
                      style={{ background: c, marginLeft: i ? -4 : 0 }}
                    />
                  ))}
                </span>
              )}
              {p.label}
              {on && <Check className="h-3 w-3" />}
            </button>
          );
        })}
      </div>

      <details className="group mt-5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--card)]">
        <summary className="font-tight flex cursor-pointer list-none items-center justify-between px-5 py-3 text-sm font-medium">
          Customise
          <span className="font-mono text-[11px] text-[var(--faint)] group-open:hidden">name, logo, colours, corners</span>
        </summary>
        <div className="space-y-5 border-t border-[var(--line)] px-5 py-5">
          <Field label="Name" hint="Shown in the rail and headings.">
            <input
              value={skin.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder={instance.name}
              className={inputClass}
            />
          </Field>

          <Field label="Logo address" hint="Leave blank to show the first letter of the name.">
            <input
              value={skin.logo}
              onChange={(e) => update({ logo: e.target.value })}
              placeholder="/brand/logo.png"
              className={inputClass}
            />
          </Field>

          <SpectrumEditor />

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Accent" hint="Focus rings, selection and links.">
              <ColorRow
                value={skin.accent || DECENT_DEFAULTS.accent}
                isDefault={!skin.accent}
                onChange={(v) => update({ accent: v })}
              />
            </Field>
            <Field label="Background" hint="Keep it close to white.">
              <ColorRow
                value={skin.bg || DECENT_DEFAULTS.bg}
                isDefault={!skin.bg}
                onChange={(v) => update({ bg: v })}
              />
            </Field>
          </div>

          <Field
            label={`Corners: ${skin.radius ?? DECENT_DEFAULTS.radius}px`}
            hint="Soft and rounded, or tight and square."
          >
            <input
              type="range"
              min={0}
              max={20}
              step={1}
              value={skin.radius ?? DECENT_DEFAULTS.radius}
              onChange={(e) => update({ radius: Number(e.target.value) })}
              className="w-full accent-[var(--accent)]"
            />
          </Field>

          <ShareSkin skin={skin} onApply={set} />
        </div>
      </details>
    </Section>
  );
}

function SpectrumEditor() {
  const { skin, update } = useSkin();
  const stops = skin.spectrum.length ? skin.spectrum : DECENT_DEFAULTS.spectrum;
  return (
    <Field label="Colours" hint="The colour that runs along the top and appears when you hover.">
      <div className="rounded-[var(--radius)] border border-[var(--line)] p-3">
        <div
          className="mb-3 h-2 w-full rounded-full"
          style={{ background: stops.length === 1 ? stops[0] : `linear-gradient(90deg, ${stops.join(", ")})` }}
        />
        <div className="flex flex-wrap items-center gap-2">
          {stops.map((c, i) => (
            <div key={i} className="group relative">
              <input
                type="color"
                value={c}
                onChange={(e) => {
                  const next = [...stops];
                  next[i] = e.target.value;
                  update({ spectrum: next });
                }}
                className="h-8 w-8 cursor-pointer rounded-[var(--radius)] border border-[var(--line-strong)] bg-transparent p-0.5"
                title={c}
              />
              {stops.length > 1 && (
                <button
                  type="button"
                  onClick={() => update({ spectrum: stops.filter((_, j) => j !== i) })}
                  className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--card)] text-[var(--fg)] group-hover:flex"
                  title="Remove this colour"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => update({ spectrum: [...stops, skin.accent || "#007aff"] })}
            className="prism-hover flex h-8 w-8 items-center justify-center rounded-[var(--radius)] border border-dashed border-[var(--line-strong)] text-[var(--faint)] hover:text-[var(--fg)]"
            title="Add a colour"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </Field>
  );
}

function Secrets() {
  const [list, setList] = useState<SecretMeta[]>(listSecrets);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    const on = () => setList(listSecrets());
    window.addEventListener("murmur:secrets", on);
    return () => window.removeEventListener("murmur:secrets", on);
  }, []);

  async function save() {
    setError(null);
    try {
      await saveSecret(name.trim(), value, note);
      setSaved(name.trim());
      setName("");
      setValue("");
      setNote("");
      setTimeout(() => setSaved(null), 1800);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Section
      label="Keys"
      icon={KeyRound}
      lede={
        persistent
          ? "API keys for plugins that need them, kept in this computer's secure store (the Keychain on a Mac), never in the app's own storage. Once saved, a value is not shown again: replace it or remove it."
          : "This is the browser preview, which has no secure store. Keys saved here last until you reload. Use the desktop app to keep them."
      }
    >
      {list.length > 0 && (
        <div className="mb-4">
          <List>
            {list.map((s) => (
              <Row
                key={s.name}
                icon={Lock}
                title={<span className="font-mono text-[13px] font-normal">{s.name}</span>}
                detail={s.note || undefined}
                status={
                  <span className="font-mono text-[11px] text-[var(--faint)]">
                    saved {new Date(s.savedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                }
                action={
                  <Button
                    variant="quiet"
                    icon={Trash2}
                    title={`Remove ${s.name}`}
                    onClick={() => {
                      if (confirm(`Remove ${s.name} from this computer?`)) void deleteSecret(s.name);
                    }}
                  >
                    Remove
                  </Button>
                }
              />
            ))}
          </List>
        </div>
      )}

      <Card>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1.4fr]">
          <Field label="Name" hint="For example ANTHROPIC_API_KEY.">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              spellCheck={false}
              className={`${inputClass} font-mono text-xs`}
            />
          </Field>
          <Field label="Value" hint="Never shown again once saved.">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              type="password"
              autoComplete="off"
              className={`${inputClass} font-mono text-xs`}
            />
          </Field>
        </div>
        <div className="mt-3 flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Field label="What it's for" hint="Optional.">
              <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
            </Field>
          </div>
          <Button
            variant="primary"
            size="md"
            onClick={() => void save()}
            disabled={!name.trim() || !value || !validName(name.trim())}
          >
            {list.some((s) => s.name === name.trim()) ? "Replace" : "Save"}
          </Button>
        </div>
        <div className="mt-3 space-y-1 empty:hidden">
          {name.trim() && !validName(name.trim()) && (
            <Notice tone="danger">Use letters, numbers, dots, dashes or underscores, starting with a letter.</Notice>
          )}
          {error && <Notice tone="danger">{error}</Notice>}
          {saved && <Notice tone="ok">Saved {saved}.</Notice>}
        </div>
      </Card>
    </Section>
  );
}

function ChainSection() {
  const c = useChain();
  const ago = c?.finalizedAt ? Math.max(0, Math.round((Date.now() - c.finalizedAt) / 1000)) : null;
  const short = (h?: string | null) => (h ? `${h.slice(0, 8)}…${h.slice(-4)}` : "…");
  let line: string;
  if (!c) line = "Checking…";
  else if (!hasLightClient) line = c.error ?? "";
  else if (c.finalized == null) line = c.error && c.error !== "the light client is starting" ? `Not following yet: ${c.error}` : "Starting the light client and finding peers…";
  else line = `Finalised #${c.finalized.toLocaleString()}, checked on this computer${ago != null ? ` ${ago}s ago` : ""}.`;
  const tone = !c ? "idle" : !hasLightClient ? "idle" : c.finalized == null ? "warn" : "ok";
  return (
    <Section
      label="The chain"
      icon={Blocks}
      lede="The app follows the chain itself: it checks the chain's finality proofs instead of trusting a server. It keeps no copy and makes no blocks."
    >
      <List>
        <div className="space-y-3">
          <Row
            title="Light client"
            status={
              <Status tone={tone} pulse={hasLightClient && c?.finalized == null}>
                {!hasLightClient ? "desktop only" : c?.finalized == null ? "starting" : "following"}
              </Status>
            }
            detail={line}
          />
          {hasLightClient && c?.finalized != null && (
            <Facts
              items={[
                ["chain", c.chain],
                ["newest", `#${c.best?.toLocaleString() ?? "…"}`],
                ["peers", String(c.peers ?? "…")],
                ["runtime", c.specName ? `${c.specName} ${c.specVersion}` : "…"],
                ["finalised", short(c.finalizedHash)],
                ["genesis", short(c.genesis)],
              ]}
            />
          )}
        </div>
        {hasLightClient && <KeepCopy />}
      </List>
    </Section>
  );
}

const mb = (n?: number | null) => (n == null ? "…" : n < 1e9 ? `${Math.round(n / 1e6)} MB` : `${(n / 1e9).toFixed(1)} GB`);

function nodeLine(n: NodeStatus): string {
  switch (n.phase) {
    case "off":
      return "Off. Switch it on to keep a full copy of the chain on this computer.";
    case "fetching":
      return n.fetchTotal ? `Fetching the node program, ${mb(n.fetchedBytes)} of ${mb(n.fetchTotal)}…` : "Fetching the node program…";
    case "waiting-for-power":
      return "Paused on battery. It carries on when the computer is plugged in.";
    case "starting":
      return "Starting the node…";
    case "syncing":
      return n.best != null && n.highest ? `Copying the chain: block ${n.best.toLocaleString()} of ${n.highest.toLocaleString()}.` : "Copying the chain…";
    case "synced":
      return `Holding a full copy, up to block ${n.best?.toLocaleString() ?? "…"}.`;
    case "error":
      return `Stopped: ${n.error ?? "the node wouldn't run"}`;
  }
}

function KeepCopy() {
  const [n, setN] = useNode();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!n) return null;
  const act = async (f: () => Promise<NodeStatus>) => {
    setBusy(true);
    setErr(null);
    try {
      setN(await f());
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };
  const on = n.phase === "synced" || n.phase === "syncing";
  return (
    <div className="space-y-3">
      <Row
        title="Keep a copy"
        status={
          <Status tone={n.phase === "error" ? "danger" : on ? "ok" : n.enabled ? "warn" : "idle"} pulse={n.phase === "syncing"}>
            {n.enabled ? n.phase.replace(/-/g, " ") : "off"}
          </Status>
        }
        detail={nodeLine(n)}
        action={
          <Button busy={busy} onClick={() => void act(() => setKeepCopy(!n.enabled))}>
            {n.enabled ? "Switch off" : "Switch on"}
          </Button>
        }
      />
      {on && (
        <Facts
          items={[
            ["peers", String(n.peers ?? "…")],
            ["on disk", mb(n.diskBytes)],
            ["node", n.version ?? "…"],
            ["power", n.onMains ? "plugged in" : "on battery"],
          ]}
        />
      )}
      {err && <Notice tone="danger">{err}</Notice>}
      <p className="text-xs leading-relaxed text-[var(--faint)]">
        A full node keeps every block and helps hold the record. It is never trusted to make blocks, runs only while
        this computer is plugged in, and stops when the app quits. The program is checked against Birdbrain's release
        key before it runs.
      </p>
      {!n.enabled && n.version && (
        <Button variant="quiet" disabled={busy} onClick={() => void act(removeCopy)}>
          Delete the copy ({mb(n.diskBytes)})
        </Button>
      )}
    </div>
  );
}

function ShareSkin({
  skin,
  onApply,
}: {
  skin: Skin;
  onApply: (s: Skin) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [paste, setPaste] = useState("");
  const [error, setError] = useState(false);

  const code = encodeSkin(skin);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }

  function applyPaste() {
    const decoded = decodeSkin(paste);
    if (!decoded) {
      setError(true);
      return;
    }
    onApply(decoded);
    setPaste("");
    setError(false);
  }

  return (
    <Field label="Share with your group" hint="A skin is a code. Copy it and send it on, and each person pastes it to get the same look.">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <code className="font-mono min-w-0 flex-1 truncate rounded-[var(--radius)] border border-[var(--line)] bg-[var(--raise)] px-3 py-2 text-[11px] text-[var(--muted)]">
            {code}
          </code>
          <Button icon={copied ? Check : Copy} onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={paste}
            onChange={(e) => {
              setPaste(e.target.value);
              setError(false);
            }}
            placeholder="Paste a skin code"
            className={`${inputClass} text-xs`}
          />
          <Button onClick={applyPaste} disabled={!paste.trim()}>
            Apply
          </Button>
        </div>
        {error && <Notice tone="danger">That isn't a skin code.</Notice>}
      </div>
    </Field>
  );
}

function ColorRow({
  value,
  isDefault,
  onChange,
}: {
  value: string;
  isDefault: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="prism-hover flex items-center gap-2 rounded-[var(--radius)] border border-[var(--line-strong)] px-2 py-1.5">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-7 shrink-0 cursor-pointer rounded-[var(--radius)] border border-[var(--line)] bg-transparent p-0.5"
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="font-mono w-full bg-transparent text-xs uppercase outline-none"
      />
      {isDefault && (
        <span className="font-mono shrink-0 pr-1 text-[9px] uppercase tracking-wider text-[var(--faint)]">
          default
        </span>
      )}
    </div>
  );
}

export const settingsSurface: MurmurModule = {
  id: "settings",
  title: "Settings",
  tagline: "Keys, sign-ins and your group's brand",
  icon: SlidersHorizontal,
  order: 2,
  kind: "core",
  Panel,
};
