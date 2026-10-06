/**
 * One codebase, an edition per collective.
 *
 * - `murmur` is Birdbrain's open app: the public repo builds this one. It is
 *   bound to Birdbrain, wears the bird, and ships no updater of ours until
 *   Birdbrain has its own release key.
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
  /** whether this edition checks an update endpoint we sign for */
  selfUpdate: boolean;
  /** whether notes sync to Decent's vault; Murmur keeps them on the device
   *  until the boot-shim points it at the member's own Zo */
  vaultSync: boolean;
  /** what notes say they write into */
  vaultName: string;
  /** the plugins this edition offers, which are also what a fresh install has */
  plugins: string[];
  /** the surface the window opens on */
  home: string;
  /** passkey sign-in through the member's browser: the app asks `pair` for a
   *  code, opens `approve + code` where the member's passkey lives, and polls */
  signIn: { pair: string; approve: string; app: string };
}

const EDITIONS: Record<EditionId, Edition> = {
  murmur: {
    id: "murmur",
    productName: "Murmur",
    instance: { slug: "birdbrain", name: "Birdbrain" },
    origin: "https://birdbrain.wtf",
    defaultSkin: "birdbrain",
    selfUpdate: false,
    vaultSync: false,
    vaultName: "this device",
    plugins: ["meet", "chat", "pay", "magazine"],
    home: "notes",
    signIn: {
      app: "murmur",
      pair: "https://birdbrain.wtf/api/chaos/app/pair",
      approve: "https://birdbrain.wtf/birdbrain/app-link?code=",
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
    plugins: ["meet", "chat", "pay", "magazine"],
    home: "notes",
    // Decent members hold the same identities and sign in at the same door.
    signIn: {
      app: "decent",
      pair: "https://rw.zo.space/api/chaos/app/pair",
      approve: "https://birdbrain.wtf/birdbrain/app-link?code=",
    },
  },
};

export const edition: Edition =
  EDITIONS[(import.meta.env.VITE_EDITION as EditionId) ?? "decent"] ??
  EDITIONS.decent;
