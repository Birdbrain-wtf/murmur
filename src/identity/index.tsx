import { useState } from "react";
import {
  Fingerprint,
  Sprout,
  ShieldCheck,
  ArrowRight,
  LogOut,
  Hexagon,
} from "lucide-react";
import type { MurmurModule, PluginContext } from "../host/types";
import { useIdentity } from "./useIdentity";
import { edition } from "../edition";

/**
 * Identity — core surface.
 *
 * Who you are, and how you show up in the work: your sign-in, the seeds you've
 * planted (participation), and a visual reference of the flock's work. Sign-in
 * is branded "Sign in with Decent" — today it sets a local identity; the seam
 * is a passkey (Virto Connect / WebAuthn) check against chaos-auth that issues
 * a Kreivo DID and, behind it, a Matrix session for `chat`.
 */
function Panel({ instance }: PluginContext) {
  const { identity, signIn, signOut } = useIdentity();
  const [handle, setHandle] = useState("");

  if (!identity.signedIn) {
    return (
      <div className="flex h-full flex-col">
        <SurfaceHeader title="Identity" eyebrow="identity" />
        <div className="flex flex-1 items-center justify-center px-8">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (handle.trim()) signIn(handle);
            }}
            className="w-full max-w-sm rounded-[var(--radius)] border border-[var(--line)] bg-[var(--card)] p-6"
          >
            <div
              className="mb-5 flex h-12 w-12 items-center justify-center rounded-[var(--radius)]"
              style={{ background: "var(--spectrum)" }}
            >
              <Fingerprint className="h-6 w-6 text-white" />
            </div>
            <div className="font-tight text-lg font-medium">
              Sign in with {edition.instance.name}
            </div>
            <p className="mt-1 text-sm text-[var(--muted)]">
              One identity across every module — chat, notes, meet. Choose a
              handle to start.
            </p>
            <div className="prism-hover mt-5 flex items-center gap-2 rounded-[var(--radius)] border border-[var(--line-strong)] px-3 py-2.5">
              <input
                autoFocus
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="your handle"
                className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--faint)]"
              />
            </div>
            <button
              type="submit"
              className="prism-hover mt-4 flex w-full items-center justify-center gap-2 rounded-[var(--radius)] border border-[var(--line-strong)] py-2.5 text-sm font-medium"
            >
              Sign in with {edition.instance.name} <ArrowRight className="h-4 w-4" />
            </button>
            <p className="font-mono mt-4 text-[10px] leading-relaxed text-[var(--faint)]">
              Next: passkey (Virto Connect) → Kreivo DID. The same gesture mints
              your Matrix session — no separate chat login.
            </p>
          </form>
        </div>
      </div>
    );
  }

  const initials = (identity.handle ?? "?").slice(0, 2).toUpperCase();

  return (
    <div className="flex h-full flex-col">
      <SurfaceHeader
        title={identity.handle ?? "You"}
        eyebrow="identity"
        sub={`Bound to ${instance.name}.`}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {/* who you are */}
        <section className="flex items-center gap-4 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--card)] px-5 py-4">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white"
            style={{ background: "var(--spectrum)" }}
          >
            <span className="font-tight text-lg font-semibold">{initials}</span>
          </div>
          <div className="min-w-0">
            <div className="font-tight text-base font-medium">
              {identity.handle}
            </div>
            <div className="font-mono mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--faint)]">
              <span>local · {identity.localId}</span>
              <span className="inline-flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" />
                {identity.did ?? "did:kreivo — pending"}
              </span>
            </div>
          </div>
        </section>

        {/* participation — seeds */}
        <h2 className="font-mono mt-8 mb-3 text-[11px] uppercase tracking-wider text-[var(--faint)]">
          participation
        </h2>
        <div className="rounded-[var(--radius)] border border-dashed border-[var(--line-strong)] bg-[var(--raise)] px-5 py-4">
          <div className="flex items-center gap-2">
            <Sprout className="h-4 w-4 text-[#34c759]" />
            <span className="font-tight text-sm font-medium">
              Seeds you've planted
            </span>
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--muted)]">
            Your identity is the sum of what you contribute. Seeds from the
            Decent vault (<span className="font-mono">core/vault/seeds</span>)
            attributed to you will surface here — the living, visual record of
            your participation in the work.
          </p>
        </div>

        {/* visual reference of the work */}
        <h2 className="font-mono mt-8 mb-3 text-[11px] uppercase tracking-wider text-[var(--faint)]">
          a visual reference of our work
        </h2>
        <div className="grid grid-cols-3 gap-2">
          {SPECTRUM.map((c, i) => (
            <div
              key={c}
              className="relative aspect-[4/3] overflow-hidden rounded-[var(--radius)] border border-[var(--line)]"
            >
              <div
                className="absolute inset-0 opacity-90"
                style={{
                  background: `linear-gradient(135deg, ${c} 0%, transparent 85%)`,
                }}
              />
              <Hexagon
                className="absolute bottom-2 right-2 h-4 w-4 text-white/70"
                strokeWidth={1.25}
              />
              <span className="font-mono absolute left-2 top-2 text-[9px] text-white/80">
                {String(i + 1).padStart(2, "0")}
              </span>
            </div>
          ))}
        </div>
        <p className="font-mono mt-3 text-[10px] text-[var(--faint)]">
          placeholder field — this becomes a gallery of the flock's artefacts,
          drawn from the vault.
        </p>

        <button
          onClick={signOut}
          className="prism-hover mt-8 inline-flex items-center gap-2 rounded-[var(--radius)] border border-[var(--line-strong)] px-4 py-2 text-xs text-[#c1271d]"
        >
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </div>
    </div>
  );
}

const SPECTRUM = [
  "#ff3b30",
  "#ff9500",
  "#ffcc00",
  "#34c759",
  "#00c7be",
  "#af52de",
];

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
        <Fingerprint className="h-3.5 w-3.5" />
        {eyebrow}
      </div>
      <h1 className="font-tight mt-2 text-2xl font-medium">{title}</h1>
      {sub && <p className="mt-1 text-sm text-[var(--muted)]">{sub}</p>}
    </header>
  );
}

export const identitySurface: MurmurModule = {
  id: "identity",
  title: "Identity",
  tagline: "Who you are and how you show up in the work",
  icon: Fingerprint,
  order: 0,
  kind: "core",
  backend: "Passkey → Kreivo DID",
  Panel,
};
