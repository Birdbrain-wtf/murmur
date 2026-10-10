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
 */
export type EditionId = string;

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
  /** the plugins this edition offers, which are also what a fresh install has.
   *  `agent` is in every edition: the collective's own agent, named after it */
  plugins: string[];
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
    plugins: ["agent", "meet", "chat", "pay", "magazine"],
    optional: ["exchange"],
    exchangeMarket: "dex.birdbrain.wtf:7232",
    home: "agent",
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
    plugins: ["agent", "meet", "chat", "pay", "magazine", "operations", "files", "invite"],
    home: "agent",
    ops: { base: "https://www.decent.partners" },
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

export const edition: Edition =
  EDITIONS[(import.meta.env.VITE_EDITION as EditionId) ?? "decent"] ??
  EDITIONS.decent;

/** What the member belongs to, in copy: an edition with an operations console
 *  is a company's, the rest are collectives'. Use this rather than "the flock",
 *  which is Birdbrain's word and reads wrong in every other edition. */
export const groupWord: "company" | "collective" = edition.ops ? "company" : "collective";
