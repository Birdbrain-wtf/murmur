import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Identity } from "../host/types";
import type { SignedIn } from "./passkey";
import { revoke } from "./participation";

const KEY = "murmur.identity.v1";

const SIGNED_OUT: Identity = { handle: null, localId: null, did: null, signedIn: false };

function load(): Identity {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const id = JSON.parse(raw) as Identity;
      // A passkey session that has run out signs the app out; the member signs in again.
      if (id.session && id.sessionExp && id.sessionExp < Date.now() / 1000) return SIGNED_OUT;
      // A name typed before passkey sign-in existed proves nothing: ask again.
      if (id.signedIn && !id.session) return SIGNED_OUT;
      return id;
    }
  } catch {
    /* ignore */
  }
  return SIGNED_OUT;
}

function randomLocalId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

interface IdentityApi {
  identity: Identity;
  signIn: (who: SignedIn) => void;
  signOut: () => void;
}

const Ctx = createContext<IdentityApi | null>(null);

/**
 * Identity for the client, shared across the rail and the identity surface.
 *
 * Signing in is a passkey, approved in the member's own browser at the
 * edition's door (`passkey.ts`). What the app keeps is the door's session for
 * this app: who they are, never a key. `did:kreivo:…` attaches later.
 */
export function IdentityProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<Identity>(load);

  // Saved first, then announced, so anything listening (the operations console, lib/ops.ts)
  // reads the new session. signedOut carries the session that has just ended.
  const [ended, setEnded] = useState<string | undefined>();
  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(identity));
    window.dispatchEvent(new CustomEvent("murmur:identity", { detail: { signedOut: ended } }));
    setEnded(undefined);
  }, [identity]);

  const signIn = useCallback((who: SignedIn) => {
    setIdentity((prev) => ({
      handle: who.displayName,
      localId: prev.localId ?? randomLocalId(),
      did: prev.did,
      signedIn: true,
      userId: who.userId,
      session: who.session,
      sessionExp: who.exp,
    }));
  }, []);

  // Signing out also switches check-ins off and forgets the chat login, so a
  // shared machine cannot go on recording, or talking as, the last person who
  // used it. Chat's account comes back with the passkey on the next sign-in.
  const signOut = useCallback(() => {
    void revoke(identity.session);
    localStorage.removeItem("murmur.matrix.session.v1");
    setEnded(identity.session ?? undefined);
    setIdentity(SIGNED_OUT);
  }, [identity.session]);

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
