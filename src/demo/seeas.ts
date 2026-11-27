import { shaped } from "../edition";
import type { Level, Role } from "./shape";

/**
 * "See it as": a sketch told from each kind of member's seat (demo editions only).
 *
 * A group's roles each carry a level per plugin. Choosing one here shows the app
 * that person would get: only their sections in the rail, their morning read and
 * the questions they would ask. The choice is kept on this computer and the
 * window reloads, because the sample data is laid out once when the app starts.
 *
 * The first role is the default seat, as it always was.
 */
const KEY = "murmur.seeas.v1";

const roles: Role[] = shaped?.roles ?? [];
const stored = Number(typeof localStorage === "undefined" ? 0 : localStorage.getItem(KEY) ?? 0);

/** Which role the sketch is being seen as (an index into the sketch's roles). */
export const seat = Number.isInteger(stored) && stored >= 0 && stored < roles.length ? stored : 0;
export const seatRole: Role | null = roles[seat] ?? null;
/** Whether there is more than one seat to choose from. */
export const hasSeats = roles.length > 1;

export function sitAs(i: number) {
  if (i === seat || i < 0 || i >= roles.length) return;
  localStorage.setItem(KEY, String(i));
  location.reload();
}

/** The level the current seat has on a plugin. Anything a sketch does not name stays open. */
export const seatLevel = (plugin: string): Level => seatRole?.levels[plugin] ?? "join";
/** Whether the current seat sees a plugin at all. The agent and the personal pages are always there. */
export const seatSees = (plugin: string) => plugin === "agent" || seatLevel(plugin) !== "none";

