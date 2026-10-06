import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Identity } from "../host/types";

const KEY = "murmur.identity.v1";

function load(): Identity {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Identity;
  } catch {
    /* ignore */
  }
  return { handle: null, localId: null, did: null, signedIn: false };
}

function randomLocalId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

interface IdentityApi {
  identity: Identity;
  signIn: (handle: string) => void;
  signOut: () => void;
}

const Ctx = createContext<IdentityApi | null>(null);

/**
 * Identity for the client, shared across the rail and the identity surface.
 *
 * v0.1 establishes a durable local identity (handle + opaque id). The real
 * on-ramp is "Sign in with Decent": a passkey (WebAuthn / Virto Connect) check
 * against services/chaos-auth that, once Kreivo issues DIDs, attaches
 * `did:kreivo:…`. Until that RP is reachable from this client, we hold a local
 * identity so every module has something stable to bind to.
 */
export function IdentityProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<Identity>(load);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(identity));
  }, [identity]);

  const signIn = useCallback((handle: string) => {
    setIdentity((prev) => ({
      handle: handle.trim() || "anon",
      localId: prev.localId ?? randomLocalId(),
      did: prev.did,
      signedIn: true,
    }));
  }, []);

  const signOut = useCallback(() => {
    setIdentity({ handle: null, localId: null, did: null, signedIn: false });
  }, []);

  return (
    <Ctx.Provider value={{ identity, signIn, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useIdentity(): IdentityApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useIdentity must be used within IdentityProvider");
  return v;
}
