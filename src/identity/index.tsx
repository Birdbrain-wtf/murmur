import { useEffect, useRef, useState } from "react";
import { Fingerprint, ShieldCheck, ArrowRight, ArrowUpRight, LogOut, Landmark, MessageSquare, X } from "lucide-react";
import type { MurmurModule, PluginContext } from "../host/types";
import { useIdentity } from "./useIdentity";
import { edition } from "../edition";
import { CollectivesSection } from "../host/Collectives";
import { openInBrowser, startPairing, type Pairing, type SignedIn } from "./passkey";
import { approve, supported as checkInsSupported, useParticipation } from "./participation";
import { signInToOps, signOutOfOps, useOps } from "../lib/ops";
import { Page, PageHeader, PageBody, Section, List, Row, Status, Dot, Notice, Button, Gate, Code, Waiting, Facts } from "../ui";

/**
 * Sign in with a passkey, in the browser. The app shows the code it asked for,
 * opens the door's approval page, and waits for the member to say yes there.
 */
function PasskeySignIn({ onSignedIn }: { onSignedIn: (who: SignedIn) => void }) {
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = useRef<Pairing | null>(null);
  const site = new URL(edition.signIn.approve).host;

  useEffect(() => () => live.current?.cancel(), []);

  async function begin() {
    setError(null);
    setBusy(true);
    try {
      const p = await startPairing();
      live.current = p;
      setPairing(p);
      await openInBrowser(p.url);
      const who = await p.done;
      onSignedIn(who);
    } catch (e: any) {
      if (e?.message !== "cancelled") setError(e?.message || "That did not work. Try again.");
      setPairing(null);
    } finally {
      setBusy(false);
      live.current = null;
    }
  }

  function cancel() {
    live.current?.cancel();
    setPairing(null);
  }

  if (!pairing)
    return (
      <Gate
        icon={Fingerprint}
        title="Sign in with your passkey"
        action={
          <Button variant="primary" size="md" onClick={begin} busy={busy} trailing={ArrowRight}>
            {busy ? "Opening your browser" : "Sign in with your passkey"}
          </Button>
        }
      >
        <p>
          Your browser opens {site}. You approve there with your passkey and come back signed in.
          Nothing is typed into this app.
        </p>
        {error && <Notice tone="danger">{error}</Notice>}
      </Gate>
    );

  return (
    <Gate
      icon={Fingerprint}
      title="Approve in your browser"
      action={
        <>
          <Button onClick={() => openInBrowser(pairing.url)} trailing={ArrowUpRight}>
            Open the page again
          </Button>
          <Button variant="quiet" icon={X} onClick={cancel}>
            Cancel
          </Button>
        </>
      }
    >
      <p>
        We opened {site}. Check it shows this code, then approve with your passkey. If the code
        is different, don't approve: someone else started that sign-in.
      </p>
      <Code>
        {pairing.code.slice(0, 4)}-{pairing.code.slice(4)}
      </Code>
      <Waiting>Waiting for you to approve</Waiting>
    </Gate>
  );
}

/**
 * Profile (the `identity` core surface).
 *
 * What this person is in the system, in the order the system builds it: a
 * member of the edition's collective (a passkey at its door, ADR 0046), their
 * check-ins (the participation key, ADR 0069), a role on the company's console
 * where the edition has one (operator, read-only in the app), and the accounts
 * the app has connected for them (chat). Nothing here is a placeholder: each
 * row reads real state, and says plainly when something isn't connected.
 */
function Panel({ instance, open }: PluginContext) {
  const { identity, signIn, signOut } = useIdentity();
  const site = new URL(edition.signIn.approve).host;

  if (!identity.signedIn) {
    return (
      <Page>
        <PageHeader
          icon={Fingerprint}
          eyebrow="profile"
          title={`Sign in to ${edition.productName}`}
          lede={`Use the passkey you already have at ${site}. Signing in makes you a member of ${instance.name}.`}
        />
        <PageBody>
          <PasskeySignIn onSignedIn={signIn} />
          <CollectivesSection />
        </PageBody>
      </Page>
    );
  }

  const until = identity.sessionExp
    ? new Date(identity.sessionExp * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long" })
    : null;

  return (
    <Page>
      <PageHeader
        icon={Fingerprint}
        eyebrow="profile"
        title={identity.handle ?? "You"}
        lede={`A member of ${instance.name}.`}
        actions={
          <Button variant="danger" icon={LogOut} onClick={signOut}>
            Sign out
          </Button>
        }
      />
      <PageBody>
        <Section label="Membership" icon={ShieldCheck}>
          <List>
            <Row
              title={`Member of ${instance.name}`}
              status={<Status tone="ok">signed in</Status>}
              detail={
                <>
                  Your passkey at {site} says who you are. This app stays signed in
                  {until ? ` until ${until}` : " for 30 days"} and never signs anything for you.
                </>
              }
            />
            {checkInsSupported ? (
              <CheckIns session={identity.session ?? null} />
            ) : (
              <Row
                title="Check-ins"
                status={<Status>not available yet</Status>}
                detail={`${instance.name}'s sign-in doesn't record check-ins yet. Calls and chat work as normal.`}
              />
            )}
          </List>
        </Section>

        <CollectivesSection />

        {edition.ops && <OperatorRole open={open} />}

        <Section label="Connected accounts" icon={MessageSquare}>
          <List>
            <ChatAccount open={open} />
          </List>
        </Section>

        {identity.userId && (
          <Facts
            items={[
              ["member", identity.userId],
              ["door", site],
            ]}
          />
        )}
      </PageBody>
    </Page>
  );
}

/** The operator role: the company's console has its own passkey and owner
 *  list, separate from membership. The app pairs read-only. */
function OperatorRole({ open }: { open: (id: string) => void }) {
  const ops = useOps();
  return (
    <Section label="Company role" icon={Landmark}>
      <List>
        <Row
          title="Operations"
          status={
            ops.kind === "ready" ? (
              <Status tone="ok">paired</Status>
            ) : ops.kind === "pairing" ? (
              <Status tone="live" pulse>waiting for approval</Status>
            ) : (
              <Status>not paired</Status>
            )
          }
          detail={
            ops.kind === "ready"
              ? `Reading ${ops.me.company}'s console as ${ops.me.who?.name ?? "an operator"}. Anything that changes something is approved in the browser.`
              : "For the company's owners and operators. The console has its own passkey, separate from your membership."
          }
          action={
            ops.kind === "ready" ? (
              <>
                <Button variant="quiet" onClick={() => void signOutOfOps()}>
                  Unpair
                </Button>
                <Button onClick={() => open("operations")} trailing={ArrowUpRight}>
                  Open
                </Button>
              </>
            ) : ops.kind === "signed-out" ? (
              <Button onClick={() => void signInToOps()}>Pair</Button>
            ) : null
          }
        />
      </List>
    </Section>
  );
}

function ChatAccount({ open }: { open: (id: string) => void }) {
  const [who, setWho] = useState<string | null>(null);
  useEffect(() => {
    try {
      setWho(JSON.parse(localStorage.getItem("murmur.matrix.session.v1") || "null")?.userId ?? null);
    } catch {
      setWho(null);
    }
  }, []);
  return (
    <Row
      title="Chat"
      status={who ? <Status tone="ok">connected</Status> : <Status>not connected</Status>}
      detail={who ? <span className="font-mono text-xs">{who}</span> : "Connect your chat account to talk to people here."}
      action={
        <Button onClick={() => open("chat")} trailing={ArrowUpRight}>
          {who ? "Open" : "Connect"}
        </Button>
      }
    />
  );
}

/**
 * Check-ins: whether this app may record that you took part in calls and chats.
 * One passkey tap in the browser covers a few hours (ADR 0069).
 */
function CheckIns({ session }: { session: string | null }) {
  const { grant, log, approving } = useParticipation();
  const [err, setErr] = useState<string | null>(null);
  const until = grant
    ? new Date(grant.exp * 1000).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" })
    : null;

  async function go() {
    if (!session) return;
    setErr(null);
    try {
      await approve(session);
    } catch (e: any) {
      setErr(e?.message || "That did not work.");
    }
  }

  return (
    <div>
      <Row
        title="Check-ins"
        status={grant ? <Status tone="ok">on until {until}</Status> : <Status>off</Status>}
        detail="When this is on, joining a call, sending a chat message or entering a venue's code records that you took part, signed by a key on this computer. One passkey tap turns it on for up to 12 hours. The key can only record that you took part, and signing out switches it off."
        action={
          !grant && (
            <Button variant="primary" onClick={go} busy={approving} disabled={!session}>
              {approving ? "Waiting for your passkey" : "Turn on"}
            </Button>
          )
        }
      />
      {err && (
        <div className="mt-3">
          <Notice tone="danger">{err}</Notice>
        </div>
      )}
      {log.length > 0 && (
        <ul className="font-mono mt-3 space-y-1 border-t border-[var(--line)] pt-3 text-[11px] text-[var(--muted)]">
          {log.slice(0, 5).map((c) => (
            <li key={`${c.session}-${c.at}`} className="flex items-center gap-2">
              <Dot tone={c.ok ? "ok" : "danger"} />
              <span className="truncate">{c.session}</span>
              <span className="ml-auto shrink-0 text-[var(--faint)]">
                {new Date(c.at * 1000).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const identitySurface: MurmurModule = {
  id: "identity",
  title: "Profile",
  tagline: "Your membership, check-ins and connected accounts",
  icon: Fingerprint,
  order: 0,
  kind: "core",
  backend: "Your passkey",
  Panel,
};
