import { useMemo, useState } from "react";
import { Plus, X, Check, Fingerprint, ArrowUpRight } from "lucide-react";
import type { MurmurModule } from "./types";
import {
  coreModules,
  pluginCatalog,
  instance,
  getModule,
} from "./registry";
import { useInstalled } from "./useInstalled";
import { useIdentity } from "../identity/useIdentity";
import { useSkin } from "./useSkin";
import { useUpdater } from "./useUpdater";
import { UpdateBanner } from "./UpdateBanner";
import { PluginFeedback } from "./PluginFeedback";
import { edition } from "../edition";

const UPGRADE_DOT = "#af52de";

export default function App() {
  const { installed, install, uninstall, isInstalled } = useInstalled();
  const { identity } = useIdentity();
  const { skin } = useSkin();
  const updater = useUpdater();
  const [activeId, setActiveId] = useState("notes");
  const [catalogOpen, setCatalogOpen] = useState(false);

  // notes is the body core surface; settings + identity are pinned to the foot.
  const notes = getModule("notes")!;
  const settingsMod = getModule("settings")!;
  const identityMod = getModule("identity")!;

  // The active skin can rename and rebrand the instance — propagate to every panel.
  const skinnedInstance = useMemo(
    () => ({ ...instance, name: skin.name || instance.name, logo: skin.logo || "" }),
    [skin.name, skin.logo],
  );

  const installedPlugins = useMemo(
    () => pluginCatalog.filter((p) => installed.includes(p.id)),
    [installed],
  );

  const active = useMemo(() => {
    const m = getModule(activeId);
    if (m && (m.kind === "core" || installed.includes(m.id))) return m;
    return notes; // active plugin was uninstalled — fall back
  }, [activeId, installed, notes]);

  function open(id: string) {
    setActiveId(id);
    setCatalogOpen(false);
  }

  return (
    <div className="flex h-full flex-col bg-[var(--bg)]">
      <div className="spectrum-bar shrink-0" />
      {/* On phones the rail folds down into a bottom tab bar (flex-col-reverse
          puts it under the panel); md+ restores the vertical left rail. */}
      <div className="flex min-h-0 flex-1 flex-col-reverse md:flex-row">
        {/* ── rail / bottom tab bar ── */}
        <nav className="flex w-full shrink-0 flex-row items-center justify-around border-t border-[var(--line)] px-2 py-2 pb-[calc(0.5rem_+_env(safe-area-inset-bottom))] md:w-16 md:flex-col md:justify-start md:border-t-0 md:border-r md:px-0 md:py-4 md:pb-4">
          <div
            className="hidden h-10 w-10 items-center justify-center overflow-hidden rounded-[var(--radius)] border border-[var(--line-strong)] font-tight text-base font-semibold md:flex"
            title={skinnedInstance.name}
          >
            {skinnedInstance.logo ? (
              <img
                src={skinnedInstance.logo}
                alt={skinnedInstance.name}
                className="h-full w-full object-cover"
              />
            ) : (
              skinnedInstance.name.slice(0, 1)
            )}
          </div>

          {/* body: core (notes) + installed plugins + add */}
          <div className="flex flex-1 flex-row items-center justify-around gap-1.5 md:mt-6 md:flex-col md:justify-start">
            <RailButton mod={notes} active={active.id === notes.id} onClick={open} />

            <div className="hidden h-px w-6 bg-[var(--line)] md:my-1.5 md:block" />

            {installedPlugins.map((p) => (
              <RailButton
                key={p.id}
                mod={p}
                active={active.id === p.id}
                onClick={open}
              />
            ))}

            <button
              onClick={() => setCatalogOpen(true)}
              title="Add a plugin"
              className="prism-hover flex h-11 w-11 items-center justify-center rounded-[var(--radius)] border border-dashed border-[var(--line-strong)] text-[var(--faint)] transition hover:text-[var(--fg)]"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>

          {/* foot: settings + identity */}
          <div className="flex flex-row items-center gap-1.5 md:flex-col">
            <RailButton
              mod={settingsMod}
              active={active.id === settingsMod.id}
              onClick={open}
            />
            <button
              onClick={() => open(identityMod.id)}
              title={
                identity.signedIn
                  ? `Signed in as ${identity.handle}`
                  : `Sign in with ${edition.instance.name}`
              }
              data-active={active.id === identityMod.id}
              className="prism-hover flex h-11 w-11 items-center justify-center rounded-full border border-[var(--line-strong)] text-[var(--muted)] transition hover:text-[var(--fg)] data-[active=true]:text-[var(--fg)]"
            >
              {identity.signedIn ? (
                <span className="font-tight text-sm font-semibold uppercase">
                  {(identity.handle ?? "?").slice(0, 2)}
                </span>
              ) : (
                <Fingerprint className="h-5 w-5" />
              )}
            </button>
          </div>
        </nav>

        {/* ── panel ── */}
        <main className="relative min-w-0 flex-1">
          <active.Panel identity={identity} instance={skinnedInstance} open={open} />
          <PluginFeedback
            pluginId={active.id}
            pluginTitle={active.title}
            identity={identity}
            instance={skinnedInstance}
          />
        </main>
      </div>

      {catalogOpen && (
        <Catalog
          installed={installed}
          isInstalled={isInstalled}
          install={install}
          uninstall={uninstall}
          onOpen={open}
          onClose={() => setCatalogOpen(false)}
        />
      )}

      <UpdateBanner
        state={updater.state}
        onInstall={updater.install}
        onDismiss={updater.dismiss}
      />
    </div>
  );
}

function RailButton({
  mod,
  active,
  onClick,
}: {
  mod: MurmurModule;
  active: boolean;
  onClick: (id: string) => void;
}) {
  const Icon = mod.icon;
  return (
    <button
      onClick={() => onClick(mod.id)}
      title={`${mod.title} — ${mod.tagline}`}
      data-active={active}
      className="prism-hover group relative flex h-11 w-11 items-center justify-center rounded-[var(--radius)] text-[var(--muted)] transition hover:bg-[var(--raise)] data-[active=true]:bg-[var(--raise)] data-[active=true]:text-[var(--fg)]"
    >
      <Icon className="h-5 w-5" />
      {mod.needsUpgrade && (
        <span
          className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full"
          style={{ background: UPGRADE_DOT }}
        />
      )}
    </button>
  );
}

function Catalog({
  installed,
  isInstalled,
  install,
  uninstall,
  onOpen,
  onClose,
}: {
  installed: string[];
  isInstalled: (id: string) => boolean;
  install: (id: string) => void;
  uninstall: (id: string) => void;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/20 p-6"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-[calc(var(--radius)+4px)] border border-[var(--line-strong)] bg-[var(--card)] shadow-[0_20px_80px_rgba(0,0,0,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--line)] px-6 py-4">
          <div>
            <div className="font-tight text-lg font-medium">Plugins</div>
            <p className="text-xs text-[var(--muted)]">
              {installed.length} installed · add capabilities as their backends
              come online
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--faint)] hover:text-[var(--fg)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-2 p-4">
          {pluginCatalog.map((p) => {
            const on = isInstalled(p.id);
            const Icon = p.icon;
            return (
              <article
                key={p.id}
                className="flex items-center gap-4 rounded-[var(--radius)] border border-[var(--line)] px-4 py-3"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius)] border border-[var(--line-strong)]">
                  <Icon className="h-5 w-5 text-[var(--muted)]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-tight text-sm font-medium">
                      {p.title}
                    </span>
                    {p.needsUpgrade && (
                      <span
                        className="font-mono rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-white"
                        style={{ background: UPGRADE_DOT }}
                      >
                        electron
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-[var(--muted)]">
                    {p.tagline}
                  </div>
                  {p.backend && (
                    <div className="font-mono mt-1 text-[10px] text-[var(--faint)]">
                      {p.backend}
                    </div>
                  )}
                </div>
                {on ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onOpen(p.id)}
                      className="prism-hover flex items-center gap-1 rounded-full border border-[var(--line-strong)] px-3 py-1 text-xs text-[var(--fg)]"
                    >
                      open <ArrowUpRight className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => uninstall(p.id)}
                      title="Remove"
                      className="text-[var(--faint)] hover:text-[#c1271d]"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => install(p.id)}
                    className="prism-hover flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--line-strong)] px-3 py-1.5 text-xs font-medium"
                  >
                    <Check className="h-3.5 w-3.5" /> add
                  </button>
                )}
              </article>
            );
          })}
        </div>

        <div className="border-t border-[var(--line)] px-6 py-3">
          <p className="font-mono text-[10px] leading-relaxed text-[var(--faint)]">
            identity &amp; notes are core — always present. everything else is a
            plugin you add over time.
          </p>
        </div>
      </div>
    </div>
  );
}
