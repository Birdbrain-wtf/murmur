import { useEffect, useRef, useState } from "react";
import { Newspaper, RotateCw, ArrowUpRight } from "lucide-react";
import type { MurmurPlugin, PluginContext } from "../../host/types";

/**
 * Magazine plugin — read Decent, the flock's broadsheet.
 *
 * The magazine is its own designed publication (a static broadsheet, live at
 * MAG_URL). Rather than re-render it natively and throw away the typography
 * that IS the magazine, the plugin frames the live site inside the shell — the
 * issue is always current, and the design arrives intact. A thin Prism header
 * wraps it with the live issue number (from /api/health) and an escape hatch to
 * open it full-bleed in the browser.
 */

const MAG_URL = "https://zine.decent.partners";

function Panel(_: PluginContext) {
  const [loaded, setLoaded] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);

  // Pull the live issue number so the header reflects what's actually published.
  useEffect(() => {
    let alive = true;
    fetch(`${MAG_URL}/api/health`, { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive && j?.issue) setIssue(String(j.issue));
      })
      .catch(() => {
        /* header just omits the issue number if the probe fails */
      });
    return () => {
      alive = false;
    };
  }, []);

  function reload() {
    setLoaded(false);
    setNonce((n) => n + 1);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-[var(--line)] px-8 pt-7 pb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--faint)]">
            <Newspaper className="h-3.5 w-3.5" />
            magazine
          </div>
          <h1 className="font-tight mt-2 text-2xl font-medium">
            Decent{issue ? ` · Issue Nº ${issue}` : ""}
          </h1>
          <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">
            The flock's broadsheet — read the live issue without leaving the
            window.
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
            href={MAG_URL}
            target="_blank"
            rel="noreferrer"
            className="prism-hover flex items-center gap-1.5 rounded-[var(--radius)] border border-[var(--line-strong)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] transition hover:text-[var(--fg)]"
          >
            Open <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="font-mono text-[11px] uppercase tracking-wider text-[var(--faint)]">
              loading the issue…
            </div>
          </div>
        )}
        <iframe
          key={nonce}
          ref={frameRef}
          src={MAG_URL}
          title="Decent Magazine"
          onLoad={() => setLoaded(true)}
          className="h-full w-full border-0"
          style={{ opacity: loaded ? 1 : 0, transition: "opacity .4s ease" }}
        />
      </div>
    </div>
  );
}

export const magazinePlugin: MurmurPlugin = {
  id: "magazine",
  title: "Magazine",
  tagline: "Read Decent — the flock's broadsheet",
  icon: Newspaper,
  order: 40,
  kind: "plugin",
  backend: "Decent Magazine (live broadsheet)",
  Panel,
};
