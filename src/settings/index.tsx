import { useState } from "react";
import {
  SlidersHorizontal,
  Palette,
  Plus,
  X,
  Copy,
  Check,
  RotateCcw,
  Share2,
} from "lucide-react";
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
 * Settings — core surface.
 *
 * Today it hosts **Skin**: the controls a group uses to rebrand its own Decent
 * client. Everything edits the live Prism tokens, so the whole app updates as
 * you type. A group admin sets a skin once and shares the code; every member
 * pastes it to adopt the same brand.
 */
function Panel({ instance }: PluginContext) {
  const { skin, update, set, reset } = useSkin();

  const activePreset =
    [...BRAND_PRESETS, ...SKIN_PRESETS].find(
      (p) => encodeSkin({ ...EMPTY_SKIN, ...p.skin }) === encodeSkin(skin),
    )?.id ?? null;

  return (
    <div className="flex h-full flex-col">
      <SurfaceHeader
        title="Settings"
        eyebrow="settings"
        sub="Skin this client to your group's brand."
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        <SectionLabel icon={Palette}>Skin</SectionLabel>
        <p className="-mt-1 mb-4 max-w-prose text-[13px] leading-relaxed text-[var(--muted)]">
          White stays the resting state — Prism's rule. A skin changes the{" "}
          <span className="text-[var(--fg)]">consequence</span> colour (the
          spectrum, the accent), the name, and the feel. Changes apply live and
          persist on this device.
        </p>

        {/* brand presets */}
        <div className="mb-4">
          <p className="mb-2 text-[11px] uppercase tracking-wider text-[var(--faint)]">Brands</p>
          <div className="flex flex-wrap gap-2">
            {BRAND_PRESETS.map((p) => {
              const on = activePreset === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => set({ ...EMPTY_SKIN, ...p.skin })}
                  data-active={on}
                  className="prism-hover flex items-center gap-2 rounded-full border border-[var(--line-strong)] px-3 py-1.5 text-xs transition data-[active=true]:border-[var(--accent)]"
                >
                  {p.skin.logo ? (
                    <img src={p.skin.logo as string} alt="" className="h-4 w-4 rounded-sm object-cover" />
                  ) : (
                    <span className="flex">
                      {(p.skin.spectrum ?? DECENT_DEFAULTS.spectrum).slice(0, 4).map((c, i) => (
                        <span
                          key={i}
                          className="h-3 w-3 rounded-full ring-1 ring-white"
                          style={{ background: c, marginLeft: i ? -4 : 0 }}
                        />
                      ))}
                    </span>
                  )}
                  {p.label}
                  {on && <Check className="h-3 w-3 text-[var(--accent)]" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* generic presets */}
        <div className="mb-7 flex flex-wrap gap-2">
          {SKIN_PRESETS.map((p) => {
            const on = activePreset === p.id;
            const swatches = (p.skin.spectrum ?? DECENT_DEFAULTS.spectrum).slice(0, 4);
            return (
              <button
                key={p.id}
                onClick={() => set({ ...EMPTY_SKIN, ...p.skin })}
                data-active={on}
                className="prism-hover flex items-center gap-2 rounded-full border border-[var(--line-strong)] px-3 py-1.5 text-xs transition data-[active=true]:border-[var(--accent)]"
              >
                <span className="flex">
                  {swatches.map((c, i) => (
                    <span
                      key={i}
                      className="h-3 w-3 rounded-full ring-1 ring-white"
                      style={{ background: c, marginLeft: i ? -4 : 0 }}
                    />
                  ))}
                </span>
                {p.label}
                {on && <Check className="h-3 w-3 text-[var(--accent)]" />}
              </button>
            );
          })}
        </div>

        {/* name */}
        <Field label="Instance name" hint="Shown in the rail and headings.">
          <input
            value={skin.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder={instance.name}
            className="prism-hover w-full rounded-[var(--radius)] border border-[var(--line-strong)] bg-transparent px-3 py-2 text-sm outline-none placeholder:text-[var(--faint)]"
          />
        </Field>

        {/* logo */}
        <Field label="Logo URL" hint="Root-relative or absolute URL. Leave blank to show the first letter.">
          <input
            value={skin.logo}
            onChange={(e) => update({ logo: e.target.value })}
            placeholder="/brand/birdbrain.png"
            className="prism-hover w-full rounded-[var(--radius)] border border-[var(--line-strong)] bg-transparent px-3 py-2 text-sm outline-none placeholder:text-[var(--faint)]"
          />
        </Field>

        {/* spectrum */}
        <Field
          label="Spectrum"
          hint="The brand gradient — the bar at the top, hover trails, avatars."
        >
          <div className="rounded-[var(--radius)] border border-[var(--line)] p-3">
            <div
              className="mb-3 h-2 w-full rounded-full"
              style={{
                background:
                  (skin.spectrum.length ? skin.spectrum : DECENT_DEFAULTS.spectrum)
                    .length === 1
                    ? skin.spectrum[0]
                    : `linear-gradient(90deg, ${(skin.spectrum.length
                        ? skin.spectrum
                        : DECENT_DEFAULTS.spectrum
                      ).join(", ")})`,
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              {(skin.spectrum.length ? skin.spectrum : DECENT_DEFAULTS.spectrum).map(
                (c, i) => {
                  const stops = skin.spectrum.length
                    ? skin.spectrum
                    : DECENT_DEFAULTS.spectrum;
                  return (
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
                          onClick={() =>
                            update({ spectrum: stops.filter((_, j) => j !== i) })
                          }
                          className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-[var(--fg)] text-[var(--bg)] group-hover:flex"
                          title="Remove stop"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      )}
                    </div>
                  );
                },
              )}
              <button
                onClick={() => {
                  const stops = skin.spectrum.length
                    ? skin.spectrum
                    : DECENT_DEFAULTS.spectrum;
                  update({ spectrum: [...stops, skin.accent || "#007aff"] });
                }}
                className="prism-hover flex h-8 w-8 items-center justify-center rounded-[var(--radius)] border border-dashed border-[var(--line-strong)] text-[var(--faint)] hover:text-[var(--fg)]"
                title="Add a colour stop"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        </Field>

        {/* accent + background side by side */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Accent" hint="Focus rings, selection, primary affordances.">
            <ColorRow
              value={skin.accent || DECENT_DEFAULTS.accent}
              isDefault={!skin.accent}
              onChange={(v) => update({ accent: v })}
            />
          </Field>
          <Field label="Resting surface" hint="Keep it near-white — Prism rests light.">
            <ColorRow
              value={skin.bg || DECENT_DEFAULTS.bg}
              isDefault={!skin.bg}
              onChange={(v) => update({ bg: v })}
            />
          </Field>
        </div>

        {/* radius */}
        <Field
          label={`Corner radius — ${skin.radius ?? DECENT_DEFAULTS.radius}px`}
          hint="Soft and rounded, or tight and technical."
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

        {/* live preview */}
        <SectionLabel icon={SlidersHorizontal}>Preview</SectionLabel>
        <div className="mb-7 overflow-hidden rounded-[var(--radius)] border border-[var(--line-strong)]">
          <div className="spectrum-bar" />
          <div className="flex items-center gap-4 bg-[var(--card)] p-5">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius)] border border-[var(--line-strong)]"
              style={skin.logo ? {} : { background: "var(--spectrum)" }}
            >
              {skin.logo ? (
                <img src={skin.logo} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="font-tight text-base font-semibold text-white">
                  {(skin.name || instance.name).slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-tight text-sm font-medium">
                {skin.name || instance.name}
              </div>
              <div className="text-xs text-[var(--muted)]">
                A skinned client — same Decent, your brand.
              </div>
            </div>
            <button
              className="prism-hover shrink-0 rounded-[var(--radius)] border border-[var(--line-strong)] px-3 py-1.5 text-xs font-medium"
              style={{ color: "var(--accent)" }}
            >
              Primary
            </button>
          </div>
        </div>

        {/* share + reset */}
        <SectionLabel icon={Share2}>Share with your group</SectionLabel>
        <ShareSkin skin={skin} onApply={set} />

        <button
          onClick={reset}
          className="prism-hover mt-6 inline-flex items-center gap-2 rounded-[var(--radius)] border border-[var(--line-strong)] px-4 py-2 text-xs text-[var(--muted)] hover:text-[var(--fg)]"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset to {edition.productName}
        </button>
      </div>
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
    <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--raise)] p-4">
      <p className="mb-3 text-[13px] leading-relaxed text-[var(--muted)]">
        A skin is just a code. Copy it and hand it to your group — each member
        pastes it to adopt the same brand.
      </p>

      <div className="flex items-center gap-2">
        <code className="font-mono min-w-0 flex-1 truncate rounded-[var(--radius)] border border-[var(--line)] bg-[var(--card)] px-3 py-2 text-[11px] text-[var(--muted)]">
          {code}
        </code>
        <button
          onClick={copy}
          className="prism-hover flex shrink-0 items-center gap-1.5 rounded-[var(--radius)] border border-[var(--line-strong)] px-3 py-2 text-xs font-medium"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-[#34c759]" /> copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" /> copy
            </>
          )}
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          value={paste}
          onChange={(e) => {
            setPaste(e.target.value);
            setError(false);
          }}
          placeholder="paste a skin code…"
          className="prism-hover min-w-0 flex-1 rounded-[var(--radius)] border border-[var(--line-strong)] bg-[var(--card)] px-3 py-2 text-xs outline-none placeholder:text-[var(--faint)]"
        />
        <button
          onClick={applyPaste}
          disabled={!paste.trim()}
          className="prism-hover shrink-0 rounded-[var(--radius)] border border-[var(--line-strong)] px-3 py-2 text-xs font-medium disabled:opacity-40"
        >
          apply
        </button>
      </div>
      {error && (
        <p className="mt-2 text-[11px] text-[#c1271d]">
          That doesn't look like a valid skin code.
        </p>
      )}
    </div>
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

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <label className="font-tight mb-1.5 block text-sm font-medium">{label}</label>
      {hint && <p className="mb-2 text-xs text-[var(--faint)]">{hint}</p>}
      {children}
    </div>
  );
}

function SectionLabel({
  icon: Icon,
  children,
}: {
  icon: typeof Palette;
  children: React.ReactNode;
}) {
  return (
    <h2 className="font-mono mt-2 mb-3 flex items-center gap-2 text-[11px] uppercase tracking-wider text-[var(--faint)]">
      <Icon className="h-3.5 w-3.5" />
      {children}
    </h2>
  );
}

function SurfaceHeader({
  title,
  eyebrow,
  sub,
}: {
  title: string;
  eyebrow: string;
  sub?: string;
}) {
  return (
    <header className="border-b border-[var(--line)] px-8 pt-7 pb-5">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--faint)]">
        <SlidersHorizontal className="h-3.5 w-3.5" />
        {eyebrow}
      </div>
      <h1 className="font-tight mt-2 text-2xl font-medium">{title}</h1>
      {sub && <p className="mt-1 text-sm text-[var(--muted)]">{sub}</p>}
    </header>
  );
}

export const settingsSurface: MurmurModule = {
  id: "settings",
  title: "Settings",
  tagline: "Skin this client to your group's brand",
  icon: SlidersHorizontal,
  order: 2,
  kind: "core",
  Panel,
};
