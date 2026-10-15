import { useCallback, useMemo, useState } from "react";
import { Plus, X, Fingerprint, ArrowUpRight } from "lucide-react";
import type { MurmurModule } from "./types";
import {
  coreModules,
  pluginCatalog,
  instance,
  getModule,
  isStandard,
} from "./registry";
import { useInstalled } from "./useInstalled";
import { useIdentity } from "../identity/useIdentity";
import { logoUrl, useSkin } from "./useSkin";
import { useUpdater } from "./useUpdater";
import { UpdateBanner } from "./UpdateBanner";
import { PluginFeedback } from "./PluginFeedback";
import { CollectiveSwitcher } from "./Collectives";
import { edition, shaped, TIERS, tierOf } from "../edition";
import { Button, Status } from "../ui";
import { DemoBar, isDemo, Tour, tourSeen } from "../demo";
import { AccessTable } from "../demo/access";
import { TailorDialog } from "../demo/tailor";
import { colourful, inkVars } from "../demo/ink";

const UPGRADE_DOT = "#af52de";

export default function App() {
  const { installed, install, uninstall, isInstalled } = useInstalled();
  const { identity } = useIdentity();
  const { skin } = useSkin();
  const updater = useUpdater();
  const [activeId, setActiveId] = useState(edition.home);
  // Which part of the Plugins sheet is open: the list, or (in a demo) who can use what.
  const [catalogOpen, setCatalogOpen] = useState<false | CatalogTab>(false);
  // A demo edition walks a newcomer through the app the first time it opens.
  const [touring, setTouring] = useState(() => isDemo && !tourSeen());
  // "What are you looking for?", from the demo bar of an invented organisation.
  const [tailoring, setTailoring] = useState(false);

  // notes is the body core surface; settings + identity are pinned to the foot.
  const notes = getModule("notes")!;
  const settingsMod = getModule("settings")!;
  const identityMod = getModule("identity")!;
  // only in the invented demo: what's underneath, and why it matters
  const howMod = getModule("how");

  // The active skin can rename and rebrand the instance — propagate to every panel.
  const skinnedInstance = useMemo(
    () =>
      // A visitor's own sketch wears their name and its first letter, not the demo's mark.
      // A group's pack keeps that group's own mark.
      shaped && shaped.source !== "pack"
        ? { ...instance, name: instance.name, logo: "" }
        : { ...instance, name: skin.name || instance.name, logo: skin.logo ? logoUrl(skin.logo) : "" },
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

  const open = useCallback((id: string) => {
    setActiveId(id);
    setCatalogOpen(false);
  }, []);

  return (
    <div className="flex h-full flex-col bg-[var(--bg)]">
      <div className="spectrum-bar shrink-0" />
      {isDemo && (
        <DemoBar
          installed={installed}
          onTour={() => setTouring(true)}
          onTailor={() => setTailoring(true)}
        />
      )}
      {/* On phones the rail folds down into a bottom tab bar (flex-col-reverse
          puts it under the panel); md+ restores the vertical left rail. */}
      <div className="flex min-h-0 flex-1 flex-col-reverse md:flex-row">
        {/* ── rail / bottom tab bar ── */}
        <nav className="flex w-full shrink-0 flex-row items-center justify-around border-t border-[var(--line)] px-2 py-2 pb-[calc(0.5rem_+_env(safe-area-inset-bottom))] md:w-16 md:flex-col md:justify-start md:border-t-0 md:border-r md:px-0 md:py-4 md:pb-4">
          <CollectiveSwitcher name={skinnedInstance.name} logo={skinnedInstance.logo} />

          {/* body: core (notes) + installed plugins + add */}
          {/* On a phone the plugins scroll sideways when there are more than fit. */}
          <div className="flex min-w-0 flex-1 flex-row items-center justify-start gap-1.5 overflow-x-auto px-1 sm:justify-around md:mt-6 md:flex-col md:justify-start md:overflow-visible md:px-0">
            {/* In a demo, Notes sits at the foot with Profile: yours, not the group's. */}
            {!isDemo && <RailButton mod={notes} active={active.id === notes.id} onClick={open} />}

            {!isDemo && <div className="hidden h-px w-6 bg-[var(--line)] md:my-1.5 md:block" />}

            {installedPlugins.map((p) => (
              <RailButton
                key={p.id}
                mod={p}
                active={active.id === p.id}
                onClick={open}
              />
            ))}

            <button
              onClick={() => setCatalogOpen("plugins")}
              title="Add a plugin"
              data-tour="catalog"
              className="prism-hover flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius)] border border-dashed border-[var(--line-strong)] text-[var(--faint)] transition hover:text-[var(--fg)]"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>

          {/* foot: settings + identity */}
          <div className="flex flex-row items-center gap-1.5 md:flex-col">
            {howMod && <RailButton mod={howMod} active={active.id === howMod.id} onClick={open} />}
            <RailButton
              mod={settingsMod}
              active={active.id === settingsMod.id}
              onClick={open}
            />
            {isDemo && (
              <>
                <div className="hidden h-px w-6 bg-[var(--line)] md:my-1.5 md:block" />
                <RailButton mod={notes} active={active.id === notes.id} onClick={open} />
              </>
            )}
            <button
              onClick={() => open(identityMod.id)}
              title={
                identity.signedIn
                  ? `Profile: signed in as ${identity.handle}`
                  : `Profile: sign in to ${edition.productName}`
              }
              data-active={active.id === identityMod.id}
              data-tour={identityMod.id}
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
        <main className={`relative min-h-0 min-w-0 flex-1 ${colourful ? "inked" : ""}`} style={inkVars(active.id)}>
          <active.Panel identity={identity} instance={skinnedInstance} open={open} />
          <PluginFeedback
            pluginId={active.id}
            pluginTitle={active.title}
            identity={identity}
            instance={skinnedInstance}
            lab={active.lab}
            support={active.support}
          />
        </main>
      </div>

      {catalogOpen && (
        <Catalog
          tab={catalogOpen}
          setTab={setCatalogOpen}
          installed={installed}
          isInstalled={isInstalled}
          install={install}
          uninstall={uninstall}
          onOpen={open}
          onClose={() => setCatalogOpen(false)}
        />
      )}

      {tailoring && <TailorDialog onClose={() => setTailoring(false)} />}

      {touring && (
        <Tour installed={installed} open={open} setCatalog={setCatalogOpen} onClose={() => setTouring(false)} />
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
      title={`${mod.title}${mod.lab ? " (lab)" : ""}: ${mod.tagline}`}
      data-active={active}
      data-tour={mod.id}
      style={inkVars(mod.id)}
      className="prism-hover group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius)] text-[var(--muted)] transition hover:bg-[var(--ink-wash,var(--raise))] hover:text-[var(--ink,var(--fg))] data-[active=true]:bg-[var(--ink-soft,var(--raise))] data-[active=true]:text-[var(--ink,var(--fg))]"
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

export type CatalogTab = "plugins" | "access";

function Catalog({
  tab,
  setTab,
  installed,
  isInstalled,
  install,
  uninstall,
  onOpen,
  onClose,
}: {
  tab: CatalogTab;
  setTab: (t: CatalogTab) => void;
  installed: string[];
  isInstalled: (id: string) => boolean;
  install: (id: string) => void;
  uninstall: (id: string) => void;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const access = isDemo && tab === "access";
  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/20 p-6"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-[calc(var(--radius)+4px)] border border-[var(--line-strong)] bg-[var(--card)] shadow-[0_20px_80px_rgba(0,0,0,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-[var(--line)] px-6 py-4">
          <div>
            <div className="font-tight text-lg font-medium">Plugins</div>
            <p className="text-xs text-[var(--muted)]">
              {access
                ? `Who in ${edition.instance.name} can use each plugin, and how much.`
                : `${installed.length} of ${pluginCatalog.length} added. Notes, Settings and Profile are always here.`}
              {!access &&
                pluginCatalog.some((p) => p.lab) &&
                " Lab plugins are early and here for testing, so they may change or go away."}
            </p>
            {isDemo && (
              <div className="mt-3 flex gap-1" role="tablist">
                {(
                  [
                    ["plugins", "Plugins"],
                    ["access", "Who can use what"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={tab === id}
                    onClick={() => setTab(id)}
                    data-active={tab === id}
                    className="rounded-full border border-[var(--line)] px-3 py-1 text-xs text-[var(--muted)] transition hover:text-[var(--fg)] data-[active=true]:border-[var(--fg)] data-[active=true]:text-[var(--fg)]"
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-[var(--faint)] hover:text-[var(--fg)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-5 p-4">
          {access && <AccessTable installed={installed} />}
          {!access && TIERS.map((t) => {
            const list = pluginCatalog.filter((p) => tierOf(edition, p.id) === t.id);
            return (
              <section key={t.id} className="flex flex-col gap-2">
                <div className="flex items-baseline gap-2 px-1">
                  <span className="font-tight text-sm font-medium">{t.title}</span>
                  <span className="text-xs text-[var(--faint)]">
                    {t.id === "custom" ? `Made for ${edition.instance.name}` : t.line}
                  </span>
                </div>
                {list.length === 0 && (
                  <p className="px-1 text-xs text-[var(--faint)]">
                    {t.id === "custom"
                      ? `Nothing made for ${edition.instance.name} yet. A plugin for your own process or rituals goes here.`
                      : t.id === "market"
                        ? "Nothing from other collectives yet. Plugins they make and share will show here."
                        : "None."}
                  </p>
                )}
                {list.map((p) => (
                  <CatalogRow
                    key={p.id}
                    p={p}
                    on={isInstalled(p.id)}
                    fixed={isStandard(p.id)}
                    market={t.id === "market"}
                    install={install}
                    uninstall={uninstall}
                    onOpen={onOpen}
                  />
                ))}
              </section>
            );
          })}
        </div>

      </div>
    </div>
  );
}

function CatalogRow({
  p,
  on,
  fixed,
  market,
  install,
  uninstall,
  onOpen,
}: {
  p: MurmurModule;
  on: boolean;
  fixed: boolean;
  market: boolean;
  install: (id: string) => void;
  uninstall: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const Icon = p.icon;
  return (
    <article className="flex items-center gap-4 rounded-[var(--radius)] border border-[var(--line)] px-4 py-3">
      <div
        style={inkVars(p.id)}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius)] border border-[var(--line-strong)] [border-color:var(--ink,var(--line-strong))] bg-[var(--ink,transparent)]"
      >
        <Icon className="h-5 w-5 text-[var(--ink-on,var(--muted))]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-tight text-sm font-medium">{p.title}</span>
          {p.lab && <Status>lab</Status>}
          {p.needsUpgrade && <Status tone="warn">needs the larger app</Status>}
        </div>
        <div className="mt-0.5 truncate text-xs text-[var(--muted)]">
          {market ? `By ${p.by ?? "Decent"} · ${isDemo ? "priced by use" : "free"} · ` : ""}
          {p.tagline}
        </div>
      </div>
      {on ? (
        <div className="flex items-center gap-1">
          {!fixed && (
            <Button variant="quiet" onClick={() => uninstall(p.id)} title={`Remove ${p.title}`}>
              Remove
            </Button>
          )}
          <Button onClick={() => onOpen(p.id)} trailing={ArrowUpRight}>
            Open
          </Button>
        </div>
      ) : (
        <Button variant="primary" icon={Plus} onClick={() => install(p.id)}>
          Add
        </Button>
      )}
    </article>
  );
}
