/**
 * One codebase, two editions.
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
export type EditionId = "murmur" | "decent";

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
  },
};

export const edition: Edition =
  EDITIONS[(import.meta.env.VITE_EDITION as EditionId) ?? "decent"] ??
  EDITIONS.decent;
