import { useCallback, useEffect, useState } from "react";
import { DEFAULT_INSTALLED } from "./registry";

// Bumped to v2 with the first public release's curated plugin set, so existing
// clients pick up the new defaults rather than a stale install list.
const KEY = "murmur.installed.v2";

function load(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as string[];
  } catch {
    /* ignore */
  }
  return [...DEFAULT_INSTALLED];
}

/**
 * Which plugins the user has installed. Core surfaces (identity, notes) are not
 * tracked here — they are always mounted. This is the "add capabilities over
 * time" model: a fresh client starts minimal and grows as backends come online.
 */
export function useInstalled() {
  const [installed, setInstalled] = useState<string[]>(load);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(installed));
  }, [installed]);

  const install = useCallback((id: string) => {
    setInstalled((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const uninstall = useCallback((id: string) => {
    setInstalled((prev) => prev.filter((x) => x !== id));
  }, []);

  const isInstalled = useCallback(
    (id: string) => installed.includes(id),
    [installed],
  );

  return { installed, install, uninstall, isInstalled };
}
