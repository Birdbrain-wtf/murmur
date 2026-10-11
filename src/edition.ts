/**
 * One codebase, an edition per collective.
 *
 * - `murmur` is Birdbrain's edition (shown as "Birdbrain" since 2026-10-07; the id stays): the public repo builds this one. It is
 *   bound to Birdbrain and wears the bird. Its updates are signed with
 *   Birdbrain's own release key and offered at birdbrain.wtf.
 * - `decent` is Decent Partners' edition: the same app with Decent's profile
 *   (its instance, its skin, its signed auto-updater). It is what the live
 *   `partners.decent.murmur` installs run.
 *
 * Chosen at build time by `VITE_EDITION`. Unset means `decent`, so the existing
 * release path and every shipped install are unchanged.
 *
 * The build is the member's way in, not a wall: a member can add the other
 * collectives they belong to (`joinable`) and switch between them in one window
 * (`host/scope.ts`). Then `app` is the build and `edition` is the collective the
 * window is in.
 */
import { enterScope, joinedCollectives, storedCollective } from "./host/scope";

export type EditionId = string;

/**
 * Every plugin an edition carries sits in one of four tiers (the catalog groups
 * them this way, and so does the Incubation page on the operations console):
 *
 * - **standard**: in every edition and never removable. The collective's own
 *   agent, beside the core surfaces (notes, settings, profile).
 * - **starter**: the suggested set a new edition begins with. Installed on a
 *   fresh client, removable, and an edition may leave any of them out.
 * - **custom**: made for one collective, to carry its own process or rituals
 *   (FTTF's Watch, Tetherdown's Fundraise). Offered in that edition only. A
 *   custom plugin another collective asks for moves to the market.
 * - **market**: made by a collective, Decent included, and offered to others.
 *   Free today; a price waits on the payments plugin.
 */
export type Tier = "standard" | "starter" | "custom" | "market";
export const STANDARD = ["agent"];
export const STARTER = ["magazine", "chat", "meet"];
export const TIERS: { id: Tier; title: string; line: string }[] = [
  { id: "standard", title: "Standard", line: "Always here" },
  { id: "starter", title: "Starter", line: "Suggested to begin with" },
  { id: "custom", title: "Custom", line: "Made for this collective" },
  { id: "market", title: "Market", line: "Made by a collective, offered to others" },
];

export interface Edition {
  id: EditionId;
  /** what the window, the dock and the update banner call the app */
  productName: string;
  /** the collective a fresh install is bound to */
  instance: { slug: string; name: string };
  /** where a packaged build reaches that collective's public API */
  origin: string;
  /** brand preset applied on first run, before the user picks a skin */
  defaultSkin: string;
  /** whether this edition checks its update channel (src-tauri/tauri.<edition>.conf.json
   *  names the address and the key; infra/services/app-updates serves it) */
  selfUpdate: boolean;
  /** whether notes sync to Decent's vault; Murmur keeps them on the device
   *  until the boot-shim points it at the member's own Zo */
  vaultSync: boolean;
  /** what notes say they write into */
  vaultName: string;
  /** the starter and market plugins a fresh install has (the standard tier,
   *  `agent`, is added to every edition and is not listed here) */
  plugins: string[];
  /** plugins made for this collective's own process; installed fresh, offered
   *  in no other edition */
  custom?: string[];
  /** plugins offered in the catalog but not installed on a fresh client; a
   *  member adds them from Plugins. Used for surfaces still on test money */
  optional?: string[];
  /** the exchange market a member is offered first (lab/exchange); testnet only */
  exchangeMarket?: string;
  /** the surface the window opens on */
  home: string;
  /** passkey sign-in through the member's browser: the app asks `pair` for a
   *  code, opens `approve + code` where the member's passkey lives, and polls.
   *  `grant + code` is where one tap approves the participation key that signs
   *  check-ins (ADR 0069); an edition whose door has no grant endpoints leaves it out */
  signIn: { pair: string; approve: string; app: string; grant?: string };
  /** the company's operations console (infra/services/ops-console), which the
   *  Operations and Files plugins read; editions without one leave it out */
  ops?: { base: string };
  /** the other collectives a member of this app can add beside its own, each
   *  opening in its own space with its own skin, plugins and sign-in */
  joinable?: EditionId[];
  /** the shared record (cc/<record>) the Fundraise plugin reads its campaigns from */
  fundraising?: { record: string };
}

const EDITIONS: Record<EditionId, Edition> = {
  murmur: {
    id: "murmur",
    productName: "Birdbrain",
    instance: { slug: "birdbrain", name: "Birdbrain" },
    origin: "https://birdbrain.wtf",
    defaultSkin: "birdbrain",
    selfUpdate: true,
    vaultSync: false,
    vaultName: "this device",
    plugins: [...STARTER, "pay"],
    optional: ["swap", "exchange"],
    exchangeMarket: "dex.birdbrain.wtf:7232",
    home: "agent",
    joinable: ["decent"],
    signIn: {
      app: "murmur",
      pair: "https://birdbrain.wtf/api/chaos/app/pair",
      approve: "https://birdbrain.wtf/birdbrain/app-link?code=",
      grant: "https://birdbrain.wtf/birdbrain/app-link?grant=",
    },
  },
  decent: {
    id: "decent",
    productName: "Decent",
    instance: { slug: "decent", name: "Decent" },
    origin: "https://rw.zo.space",
    defaultSkin: "",
    selfUpdate: true,
    vaultSync: true,
    vaultName: "the Decent vault",
    // Decent Magazine and Chaos Sessions are Decent's own rituals, so in its own
    // edition they are custom. Other editions get them as the starter set.
    custom: ["magazine", "meet"],
    plugins: ["chat", "pay", "operations", "files", "invite"],
    optional: ["swap"],
    home: "agent",
    ops: { base: "https://www.decent.partners" },
    joinable: ["murmur", "fttf"],
    // Decent's members, Decent's door: passkeys made at www.decent.partners. A
    // passkey belongs to the host that made it, so this is never Birdbrain's door.
    signIn: {
      app: "decent",
      pair: "https://www.decent.partners/api/app/pair",
      approve: "https://www.decent.partners/app/link?code=",
      grant: "https://www.decent.partners/app/link?grant=",
    },
  },
};

/** Every profile in this build, for tools outside the app that list the
 *  editions (the Incubation page on the operations console). The app reads `app`
 *  and `edition`, never this. */
export const profiles: Readonly<Record<EditionId, Edition>> = EDITIONS;

/** What a fresh install of an edition has: standard, then custom, then the rest. */
export function installs(e: Edition): string[] {
  return [...new Set([...STANDARD, ...(e.custom ?? []), ...e.plugins])];
}

/** Everything an edition offers in its catalog, installed or not. */
export function offers(e: Edition): string[] {
  return [...new Set([...installs(e), ...(e.optional ?? [])])];
}

/** Which tier a plugin sits in, for this edition. */
export function tierOf(e: Edition, id: string): Tier {
  if (STANDARD.includes(id)) return "standard";
  if (e.custom?.includes(id)) return "custom";
  if (STARTER.includes(id)) return "starter";
  return "market";
}

/** The build: its name in the dock, its signing key, its update channel. It
 *  never changes while the app runs. */
export const app: Edition =
  EDITIONS[(import.meta.env.VITE_EDITION as EditionId) ?? "decent"] ??
  EDITIONS.decent;

/** Collectives this app can open: its own first, then the ones it can add.
 *  An id whose profile is not in this build (FTTF in the open core) is skipped. */
export const collectives: Edition[] = [app.id, ...(app.joinable ?? [])]
  .map((id) => EDITIONS[id])
  .filter((c): c is Edition => !!c);

/** The collectives in this member's switcher: the home one and those added. */
export const memberOf: Edition[] = collectives.filter(
  (c) => c.id === app.id || joinedCollectives().includes(c.id),
);

/**
 * The collective the window is in (`host/scope.ts`). Everything a surface
 * reads from here (the door, the plugins, the skin, the agent, the vault) is
 * that collective's. Only `app` says which build is running.
 */
export const edition: Edition =
  memberOf.find((c) => c.id === storedCollective) ?? app;

enterScope(edition.id, app.id);

/** What the member belongs to, in copy: an edition with an operations console
 *  is a company's, the rest are collectives'. Use this rather than "the flock",
 *  which is Birdbrain's word and reads wrong in every other edition. */
export const groupWord: "company" | "collective" = edition.ops ? "company" : "collective";
