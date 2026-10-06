import { useState } from "react";
import {
  UserPlus,
  Copy,
  Check,
  Link2,
  ShieldCheck,
  ArrowUpRight,
  Palette,
} from "lucide-react";
import type { MurmurPlugin, PluginContext } from "../../host/types";
import { useSkin, encodeSkin, EMPTY_SKIN } from "../../host/useSkin";
import { edition } from "../../edition";

/**
 * Invite plugin — grow the flock peer-to-peer.
 *
 * This is the onboarding surface for headless, person-to-person growth. An
 * established user mints an invite that bundles (a) BOOTSTRAP — where to get the
 * *signed* Decent app — and (b) MEMBERSHIP — the instance, the inviter, and an
 * optional room/community to land in. The newcomer redeems it and becomes a
 * seed + inviter themselves, so the network expands without a central gate.
 *
 * Resilience line: distribution is decentralised, trust is not. The app a
 * newcomer installs is verified against the signing key baked into every
 * Decent build, so receiving the build from a peer is exactly as safe as from the
 * central site — the central endpoint becomes one seed among many. The invite
 * is dependency-free and works offline: it's just an encoded payload + a link.
 */

const INVITE_VERSION = 1;

interface Spec {
  invitee: string;
  note: string;
  room: string;
  community: string;
}

interface InvitePayload {
  v: number;
  from: string | null;
  fromDid: string | null;
  inst: {
    slug: string;
    name: string;
    birdbrainBase: string;
    matrixHomeserver: string;
  };
  /**
   * How the newcomer arrives. "desktop" (the default) hands over the Decent
   * Mac app — a single-tenant client pointed at this instance's backends, which
   * is what the current cohort gets. "surface" bootstraps the keyless mobile
   * Surface app onto *their own* Zo, pointed at *their own* vault.
   */
  mode: "surface" | "desktop";
  /** machine-readable seed: the Surface deploy bundle a newcomer's agent fetches + deploys */
  bundle: string;
  /** machine-readable seed: the signed desktop-build manifest (desktop mode) */
  app: string;
  room?: string;
  community?: string;
  note?: string;
  /**
   * Optional brand skin (a `decent-skin:` code). When the inviter's client is
   * skinned and they choose to carry it, the newcomer's /join page renders in
   * the group's colours and they adopt the same brand on first launch — the
   * skin travels with the invite instead of being pasted separately.
   */
  skin?: string;
  ts: number;
}

/** url-safe base64 of a UTF-8 JSON payload (small invites only). */
function encodePayload(p: InvitePayload): string {
  const bytes = new TextEncoder().encode(JSON.stringify(p));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function Panel({ instance, identity }: PluginContext) {
  const { skin } = useSkin();
  const [spec, setSpec] = useState<Spec>({
    invitee: "",
    note: "",
    room: "",
    community: "",
  });
  const [copied, setCopied] = useState<"msg" | "link" | null>(null);
  const skinCode = encodeSkin(skin);
  const hasSkin = encodeSkin(EMPTY_SKIN) !== skinCode;
  const [carrySkin, setCarrySkin] = useState(true);
  const brandName = skin.name?.trim() || instance.name;

  const origin =
    instance.birdbrainBase?.trim() ||
    (typeof window !== "undefined" ? window.location.origin : "");
  const appManifest = `${origin}/api/murmur/update`;
  const bundleUrl = `${origin}/api/decent/bundle`;

  const payload: InvitePayload = {
    v: INVITE_VERSION,
    from: identity.handle,
    fromDid: identity.did,
    inst: {
      slug: instance.slug,
      name: instance.name,
      birdbrainBase: instance.birdbrainBase,
      matrixHomeserver: instance.matrixHomeserver,
    },
    mode: "desktop",
    bundle: bundleUrl,
    app: appManifest,
    ...(spec.room.trim() ? { room: spec.room.trim() } : {}),
    ...(spec.community.trim() ? { community: spec.community.trim() } : {}),
    ...(spec.note.trim() ? { note: spec.note.trim() } : {}),
    ...(hasSkin && carrySkin ? { skin: skinCode } : {}),
    ts: Date.now(),
  };

  const link = `${origin}/join#${encodePayload(payload)}`;
  const fromName = identity.handle ? ` from ${identity.handle}` : "";
  const landing = `${instance.name}${
    spec.room.trim() ? ` and the ${spec.room.trim()} room` : ""
  }${spec.community.trim() ? `, joining the ${spec.community.trim()} community` : ""}`;

  const message = `${spec.invitee.trim() ? `${spec.invitee.trim()}, ` : ""}you're invited to ${edition.productName} — ${instance.name}.
${spec.note.trim() ? `\n${spec.note.trim()}\n` : ""}
Decent is your own private space for thinking — notes, capture, and live shared notes you write together with the people you invite. This invite${fromName} hands you the Mac app:

1. Open this link: ${link}
2. Download the Decent Mac app (Apple-silicon Mac — M1 or newer) and drag it into Applications.
3. First time you open it: Control-click the app icon and choose Open. The build isn't notarised by Apple yet, so this one-time step gets you past Gatekeeper.
4. Start writing — your notes live on your own machine, and shared notes are end-to-end encrypted, so not even the relay that syncs them can read a word.${spec.room.trim() || spec.community.trim() ? `\n5. You'll also be connected to ${landing}.` : ""}

Once you're in, you can invite others too — and we keep a record of who invited who, so credit and value can flow back along the chain.`;

  function set<K extends keyof Spec>(k: K, v: string) {
    setSpec((s) => ({ ...s, [k]: v }));
  }

  async function copy(which: "msg" | "link") {
    await navigator.clipboard.writeText(which === "msg" ? message : link);
    setCopied(which);
    setTimeout(() => setCopied(null), 1600);
  }

  const fields: {
    k: keyof Spec;
    label: string;
    placeholder: string;
    area?: boolean;
  }[] = [
    {
      k: "invitee",
      label: "inviting (optional)",
      placeholder: "Their name — personalises the message",
    },
    {
      k: "note",
      label: "a note (optional)",
      placeholder: "Why you're inviting them — a line in your own voice",
      area: true,
    },
    {
      k: "room",
      label: "land them in a room (optional)",
      placeholder: "#welcome:… — a Matrix room to drop them into",
    },
    {
      k: "community",
      label: "community (optional)",
      placeholder: "A Birdbrain / Kreivo community to join, e.g. decent",
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-[var(--line)] px-8 pt-7 pb-5">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--faint)]">
          <UserPlus className="h-3.5 w-3.5" />
          invite
        </div>
        <h1 className="font-tight mt-2 text-2xl font-medium">
          Invite someone in
        </h1>
        <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">
          The flock grows person to person. Mint an invite that hands a newcomer
          the {edition.productName} app and joins them to {instance.name} — then they can invite
          others too. No central gate.
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        <div className="grid gap-3">
          {fields.map((f) => (
            <label key={f.k} className="block">
              <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--faint)]">
                {f.label}
              </span>
              {f.area ? (
                <textarea
                  value={spec[f.k]}
                  onChange={(e) => set(f.k, e.target.value)}
                  placeholder={f.placeholder}
                  rows={2}
                  className="prism-hover mt-1 w-full resize-y rounded-[var(--radius)] border border-[var(--line)] bg-[var(--card)] px-3.5 py-2.5 text-sm outline-none placeholder:text-[var(--faint)] focus:border-[var(--line-strong)]"
                />
              ) : (
                <input
                  value={spec[f.k]}
                  onChange={(e) => set(f.k, e.target.value)}
                  placeholder={f.placeholder}
                  className="prism-hover mt-1 w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--card)] px-3.5 py-2 text-sm outline-none placeholder:text-[var(--faint)] focus:border-[var(--line-strong)]"
                />
              )}
            </label>
          ))}
        </div>

        {hasSkin && (
          <button
            type="button"
            onClick={() => setCarrySkin((v) => !v)}
            className="prism-hover mt-3 flex w-full items-center gap-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--card)] px-3.5 py-3 text-left"
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius)] text-white"
              style={{ background: "var(--spectrum)" }}
            >
              <Palette className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-tight block text-sm font-medium">
                Carry the {brandName} brand
              </span>
              <span className="block text-[12px] leading-snug text-[var(--muted)]">
                Newcomers land on a {brandName}-skinned invite and adopt your
                colours in one tap — no code to paste.
              </span>
            </span>
            <span
              data-on={carrySkin}
              className="relative h-5 w-9 shrink-0 rounded-full border border-[var(--line-strong)] transition data-[on=true]:border-transparent data-[on=true]:bg-[var(--accent)]"
            >
              <span
                data-on={carrySkin}
                className="absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full bg-[var(--faint)] transition data-[on=true]:translate-x-4 data-[on=true]:bg-white"
              />
            </span>
          </button>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            onClick={() => copy("msg")}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius)] px-4 py-2 text-sm font-medium text-white"
            style={{ background: "var(--spectrum)" }}
          >
            {copied === "msg" ? (
              <>
                <Check className="h-4 w-4" /> Copied
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4" /> Copy invite
              </>
            )}
          </button>
          <button
            onClick={() => copy("link")}
            className="prism-hover inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-[var(--line-strong)] bg-[var(--card)] px-4 py-2 text-sm font-medium"
          >
            {copied === "link" ? (
              <>
                <Check className="h-4 w-4 text-[#34c759]" /> Copied
              </>
            ) : (
              <>
                <Link2 className="h-4 w-4" /> Copy link
              </>
            )}
          </button>
        </div>

        <div className="mt-6 flex items-start gap-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--raise)] px-4 py-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#34c759]" />
          <p className="text-[12.5px] leading-relaxed text-[var(--muted)]">
            Distribution is decentralised, trust is not. The build a newcomer
            installs is verified against the signing key baked into every Decent build,
            so handing it over yourself is as safe as the central site — you
            become a seed. Send this over any channel: Matrix, email, in person.
          </p>
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--faint)]">
              the invite
            </span>
            <span className="font-mono text-[10px] text-[var(--faint)]">
              share over any channel
            </span>
          </div>
          <pre className="font-mono max-h-72 overflow-y-auto whitespace-pre-wrap rounded-[var(--radius)] border border-[var(--line)] bg-[var(--card)] px-4 py-3.5 text-[12px] leading-relaxed text-[var(--muted)]">
            {message}
          </pre>
        </div>

        <div className="mt-4">
          <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--faint)]">
            machine-readable (for their agent)
          </span>
          <pre className="font-mono mt-1 max-h-44 overflow-y-auto whitespace-pre-wrap rounded-[var(--radius)] border border-[var(--line)] bg-[var(--card)] px-4 py-3 text-[11px] leading-relaxed text-[var(--faint)]">
            {JSON.stringify(payload, null, 2)}
          </pre>
          <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--muted)]">
            A newcomer's own agent can read this payload — fetch the build
            from <code className="font-mono text-[var(--fg)]">app</code> and redeem
            the membership — without anyone clicking through a UI.
            The link opens the live redemption page at{" "}
            <code className="font-mono text-[var(--fg)]">/join</code>, which decodes
            this payload, hands over the download, and guides them in.
          </p>
        </div>

        <div className="mt-6 flex items-start gap-2 rounded-[var(--radius)] border border-dashed border-[var(--line-strong)] bg-[var(--raise)] px-5 py-4">
          <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-[var(--muted)]" />
          <p className="text-[13px] leading-relaxed text-[var(--muted)]">
            Every person you invite can invite the next — growth compounds
            without a central server handing out downloads. This is the flock
            expanding headlessly, one trusted hand-off at a time.
          </p>
        </div>

        <p className="font-mono mt-6 text-[11px] text-[var(--faint)]">
          inviting to {instance.name} · {instance.slug}
          {identity.handle ? ` · as ${identity.handle}` : " · sign in to sign your invites"}
        </p>
      </div>
    </div>
  );
}

export const invitePlugin: MurmurPlugin = {
  id: "invite",
  title: "Invite",
  tagline: `Grow the flock — hand someone the ${edition.productName} app`,
  icon: UserPlus,
  order: 70,
  kind: "plugin",
  backend: "Peer-to-peer (signed build · this instance)",
  Panel,
};
