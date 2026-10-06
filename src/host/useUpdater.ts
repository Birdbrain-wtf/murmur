import { useCallback, useEffect, useState } from "react";
import { edition } from "../edition";

/**
 * Self-update for the desktop build.
 *
 * The Tauri updater + process plugins only exist inside the native shell, so
 * everything is gated on `isTauri` and the plugin modules are lazy-imported —
 * the browser dev preview (and the hosted web demo) renders untouched.
 *
 * Flow: check the release endpoint → if a newer signed build exists, surface a
 * banner → download + verify (signature checked against the bundled pubkey) →
 * relaunch into the new version. Built for members who never touch a terminal.
 */

export type UpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available"; version: string; notes?: string }
  | { status: "downloading"; pct: number }
  | { status: "ready" }
  | { status: "uptodate" }
  | { status: "error"; message: string };

export const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// The updater plugin is compiled into desktop builds only (see src-tauri). On
// iOS/Android the native plugin is absent, so skip the check entirely rather
// than fail a lazy import on every launch.
const isMobileWebview =
  typeof navigator !== "undefined" &&
  /android|iphone|ipad|ipod/i.test(navigator.userAgent);

// Murmur has no signed release channel of its own yet, so it never polls ours.
const canSelfUpdate = isTauri && !isMobileWebview && edition.selfUpdate;

export function useUpdater() {
  const [state, setState] = useState<UpdateState>({ status: "idle" });
  const [pending, setPending] = useState<any>(null);

  const check = useCallback(async () => {
    if (!canSelfUpdate) return;
    setState({ status: "checking" });
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update) {
        setPending(update);
        setState({ status: "available", version: update.version, notes: update.body });
      } else {
        setState({ status: "uptodate" });
      }
    } catch (e) {
      setState({
        status: "error",
        message: e instanceof Error ? e.message : "update check failed",
      });
    }
  }, []);

  const install = useCallback(async () => {
    if (!pending) return;
    try {
      let downloaded = 0;
      let total = 0;
      setState({ status: "downloading", pct: 0 });
      await pending.downloadAndInstall((ev: any) => {
        switch (ev.event) {
          case "Started":
            total = ev.data?.contentLength ?? 0;
            break;
          case "Progress":
            downloaded += ev.data?.chunkLength ?? 0;
            setState({
              status: "downloading",
              pct: total ? Math.min(100, Math.round((downloaded / total) * 100)) : 0,
            });
            break;
          case "Finished":
            setState({ status: "ready" });
            break;
        }
      });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      setState({
        status: "error",
        message: e instanceof Error ? e.message : "update failed",
      });
    }
  }, [pending]);

  const dismiss = useCallback(() => setState({ status: "idle" }), []);

  // Check shortly after launch so it never blocks first paint.
  useEffect(() => {
    if (!canSelfUpdate) return;
    const t = setTimeout(() => void check(), 1500);
    return () => clearTimeout(t);
  }, [check]);

  return { state, check, install, dismiss, isTauri };
}
