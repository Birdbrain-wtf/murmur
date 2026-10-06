import { useState } from "react";
import { Play, RotateCw, ArrowUpRight } from "lucide-react";
import type { MurmurPlugin, PluginContext } from "../../host/types";

/**
 * Watch — the Four To The Floor channel, inside the app.
 *
 * Same move as the magazine plugin: the channel is its own designed site, so
 * the plugin frames the live one rather than re-rendering it. The catalogue,
 * the player and shuffle arrive exactly as the site has them, and are always
 * current. A thin header carries reload and an escape hatch to the browser.
 */
const CHANNEL_URL = "https://fttf.decent.partners";

function Panel(_: PluginContext) {
  const [loaded, setLoaded] = useState(false);
  const [nonce, setNonce] = useState(0);

  function reload() {
    setLoaded(false);
    setNonce((n) => n + 1);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-[var(--line)] px-8 pt-7 pb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--faint)]">
            <Play className="h-3.5 w-3.5" />
            watch
          </div>
          <h1 className="font-tight mt-2 text-2xl font-medium">Four To The Floor</h1>
          <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">
            The channel, without leaving the window.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={reload}
            title="Reload"
            className="prism-hover flex h-8 w-8 items-center justify-center rounded-[var(--radius)] border border-[var(--line-strong)] text-[var(--muted)] transition hover:text-[var(--fg)]"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </button>
          <a
            href={CHANNEL_URL}
            target="_blank"
            rel="noreferrer"
            className="prism-hover flex items-center gap-1.5 rounded-[var(--radius)] border border-[var(--line-strong)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] transition hover:text-[var(--fg)]"
          >
            Open <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 bg-[#0a0a0a]">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="font-mono text-[11px] uppercase tracking-wider text-[#8a8a8a]">
              tuning in…
            </div>
          </div>
        )}
        <iframe
          key={nonce}
          src={CHANNEL_URL}
          title="Four To The Floor"
          allow="autoplay; fullscreen; picture-in-picture; publickey-credentials-get *; publickey-credentials-create *"
          allowFullScreen
          onLoad={() => setLoaded(true)}
          className="h-full w-full border-0"
          style={{ opacity: loaded ? 1 : 0, transition: "opacity .4s ease" }}
        />
      </div>
    </div>
  );
}

export const watchPlugin: MurmurPlugin = {
  id: "watch",
  title: "Watch",
  tagline: "Four To The Floor — the channel",
  icon: Play,
  order: 5,
  kind: "plugin",
  backend: "fttf.decent.partners (live channel)",
  Panel,
};
