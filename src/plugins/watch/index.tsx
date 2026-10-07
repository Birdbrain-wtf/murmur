import { useState } from "react";
import { Play, RotateCw, ArrowUpRight } from "lucide-react";
import type { MurmurPlugin, PluginContext } from "../../host/types";
import { openInBrowser } from "../../identity/passkey";
import { Button, Page, PageHeader } from "../../ui";

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
    <Page>
      <PageHeader
        icon={Play}
        eyebrow="watch"
        title="Four To The Floor"
        lede="The channel, without leaving the window."
        actions={
          <>
            <Button icon={RotateCw} onClick={reload} title="Reload the channel">
              Reload
            </Button>
            <Button trailing={ArrowUpRight} onClick={() => void openInBrowser(CHANNEL_URL)}>
              Open in browser
            </Button>
          </>
        }
      />

      <div className="relative min-h-0 flex-1 bg-[#0a0a0a]">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="font-mono text-[11px] uppercase tracking-wider text-[#8a8a8a]">
              Tuning in…
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
    </Page>
  );
}

export const watchPlugin: MurmurPlugin = {
  id: "watch",
  title: "Watch",
  tagline: "Four To The Floor: the channel",
  icon: Play,
  order: 5,
  kind: "plugin",
  backend: "fttf.decent.partners (live channel)",
  Panel,
};
