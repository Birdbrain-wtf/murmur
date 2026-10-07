import { useEffect, useRef, useState } from "react";
import { Newspaper, RotateCw, ArrowUpRight } from "lucide-react";
import type { MurmurPlugin, PluginContext } from "../../host/types";
import { openInBrowser } from "../../identity/passkey";
import { Button, Page, PageHeader, Waiting } from "../../ui";

/**
 * Magazine plugin: read Decent Magazine, the live issue.
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
    <Page>
      <PageHeader
        icon={Newspaper}
        eyebrow="magazine"
        title={`Decent Magazine${issue ? ` · Issue Nº ${issue}` : ""}`}
        lede="The live issue, without leaving the window."
        actions={
          <>
            <Button icon={RotateCw} onClick={reload} title="Reload the issue">
              Reload
            </Button>
            <Button trailing={ArrowUpRight} onClick={() => void openInBrowser(MAG_URL)}>
              Open in browser
            </Button>
          </>
        }
      />

      <div className="relative min-h-0 flex-1">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Waiting>Loading the issue</Waiting>
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
    </Page>
  );
}

export const magazinePlugin: MurmurPlugin = {
  id: "magazine",
  title: "Magazine",
  tagline: "Read the live issue of Decent Magazine",
  icon: Newspaper,
  order: 40,
  kind: "plugin",
  backend: "Decent Magazine (live broadsheet)",
  Panel,
};
