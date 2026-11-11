import { useEffect, useState } from "react";
import { Link2, ExternalLink } from "lucide-react";
import { edition } from "../../edition";
import type { MurmurPlugin, PluginContext } from "../../host/types";
import { issues } from "../../host/support";
import { openInBrowser } from "../../identity/passkey";
import { PasskeySignIn } from "../../identity/SignIn";
import { sessionRejected } from "../../identity/session";
import { useIdentity } from "../../identity/useIdentity";
import { hasHub, checked, hubClient } from "../../lib/hub";
import { countMembers } from "../../lib/kreivo";
import { Button, Card, Empty, Facts, List, Notice, Page, PageBody, PageHeader, Row, Section, Status, Waiting } from "../../ui";

/**
 * On chain: the collective as the chains see it (infra/services/explorer).
 *
 * The group's own explorer, served from the collective's own address
 * (`edition.explorer`): where it came from, who can change it, what it holds and
 * which of its claims the chains confirm, all read when asked. Members are counted
 * in public. Inside the app a member also sees who else is in the group: the app
 * sends its session, the door checks on chain that the member holds a membership,
 * and only then are names joined to holders.
 */

const base = edition.explorer?.base ?? null;

type Check = { ok: boolean | null; detail: string; link: string };
type Explorer = {
  readAt: string;
  group: any;
  recorded?: { registered?: string; line?: string };
  assetHub: any;
  seeds: any;
  proofs: { label: string; date?: string; note?: string; check: Check }[];
};
type Members = { block: number; members: { name: string | null; address: string; memberships: number[]; you: boolean }[]; unnamed: number; line: string };

/**
 * The member count again, read through the light client on this computer
 * (src/lib/kreivo.ts) the same way the explorer reads it.
 */
function Recount({ community, claimed }: { community: number; claimed: number }) {
  const [state, setState] = useState<"idle" | "reading" | "done" | "error">("idle");
  const [result, setResult] = useState<{ count: number; block: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!hasHub) return null;
  const run = async () => {
    setState("reading");
    setErr(null);
    try {
      const r = await countMembers(await hubClient("kreivo"), community);
      setResult({ count: r.count, block: r.block });
      setState("done");
    } catch (e: any) {
      setErr(String(e?.message ?? e));
      setState("error");
    }
  };
  const agrees = result && result.count === claimed;
  return (
    <Row
      title={checked ? "Counted on this computer" : "Counted again from a public server"}
      status={
        state === "done" ? (
          <Status tone={agrees ? "ok" : "danger"}>{agrees ? "agrees" : "differs"}</Status>
        ) : state === "reading" ? (
          <Status tone="warn" pulse>reading</Status>
        ) : undefined
      }
      detail={
        state === "done" && result
          ? `${result.count} members at block ${result.block.toLocaleString("en-GB")}${agrees ? ", the same as the explorer." : `. The explorer said ${claimed}. It may have read an earlier block, so count again in a moment.`}`
          : state === "error"
            ? `Couldn't count: ${err}`
            : state === "reading"
              ? "Following Kusama and Kreivo to read the memberships. The first time takes a minute or two."
              : checked
                ? "Read the memberships from Kreivo yourself, checked against the chain's own proofs, and compare."
                : "In the desktop app this is checked against the chain's own proofs."
      }
      action={state !== "reading" && <Button onClick={() => void run()}>{state === "done" ? "Count again" : "Count here"}</Button>}
    />
  );
}

const short = (a: string) => (a.length > 20 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a);

function Panel({ identity }: PluginContext) {
  const { signIn } = useIdentity();
  const [data, setData] = useState<Explorer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<Members | null>(null);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const session = identity.session ?? null;

  useEffect(() => {
    if (!base) return;
    let live = true;
    fetch(`${base}/api/explorer`, { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`The explorer answered ${r.status}.`))))
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!base || !session) return;
    let live = true;
    setMembersError(null);
    fetch(`${base}/api/explorer/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ session }),
    })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (r.status === 401) sessionRejected(session);
        if (!r.ok) throw new Error(j.error || `The explorer answered ${r.status}.`);
        return j as Members;
      })
      .then((m) => live && setMembers(m))
      .catch((e) => live && setMembersError(e.message));
    return () => {
      live = false;
    };
  }, [session]);

  if (!base)
    return (
      <Page>
        <PageHeader icon={Link2} eyebrow="on chain" title={edition.instance.name} />
        <PageBody>
          <Empty>{edition.instance.name} has no explorer of its own yet. It comes with the collective's own address.</Empty>
        </PageBody>
      </Page>
    );

  const g = data?.group && !data.group.error ? data.group : null;
  const ah = data?.assetHub && !data.assetHub.error ? data.assetHub : null;

  return (
    <Page>
      <PageHeader
        icon={Link2}
        eyebrow="on chain"
        title={edition.instance.name}
        lede="Where the group came from, who can change it, what it holds and what it can prove, read from the chains when you open this."
        actions={
          <Button variant="quiet" icon={ExternalLink} onClick={() => void openInBrowser(`${base}/explorer`)}>
            Public page
          </Button>
        }
      />
      <PageBody width="wide">
        {error && <Notice tone="danger">{error}</Notice>}
        {!data && !error && <Waiting>Reading the chains…</Waiting>}
        {data?.group?.error && <Notice tone="warn">{data.group.error}</Notice>}

        {g && (
          <Section label="The group">
            <List>
              <Row title={`${g.members.count} members`} detail={`Community ${g.community} on Kreivo, read at block ${g.block.number.toLocaleString("en-GB")}`} status={<Status tone="ok">{g.state}</Status>} />
              <Recount community={g.community} claimed={g.members.count} />
              <Row
                title="Who can change it"
                detail={
                  g.governedBy?.kind === "key"
                    ? `One key, ${short(g.governedBy.address)}${g.governedBy.isOperator ? ", the collective's own operator" : ", not the operator we recorded"}`
                    : g.governedBy?.kind === "community"
                      ? `Community ${g.governedBy.community} governs itself`
                      : "No origin maps to this community"
                }
              />
              {g.lineage.map((l: any) => (
                <Row key={l.community} title={`Part of ${l.name}`} detail={`Its community account holds membership ${l.item} of community ${l.community}`} status={<Status tone="ok">on chain</Status>} />
              ))}
              {data?.recorded?.registered && <Row title="Registered" detail={`${data.recorded.registered}. ${data.recorded.line ?? ""}`} status={<Status>recorded</Status>} />}
              <Row title={`${g.openProposals} open proposals`} detail={g.decisionMethod === "membership" ? "One member, one vote" : g.decisionMethod ?? undefined} />
            </List>
          </Section>
        )}

        <Section label="Who is in it" lede="Only members see names. Each name is the one the door holds for an account that holds a membership now.">
          {!session && !asking && (
            <Card tone="dashed">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-[13px] text-[var(--muted)]">Sign in to see who else is in {edition.instance.name}.</span>
                <Button variant="primary" onClick={() => setAsking(true)}>
                  Sign in
                </Button>
              </div>
            </Card>
          )}
          {!session && asking && <PasskeySignIn onSignedIn={(who) => { signIn(who); setAsking(false); }} title={`Sign in to ${edition.instance.name}`} />}
          {session && !members && !membersError && <Waiting>Asking the door…</Waiting>}
          {membersError && <Notice tone="warn">{membersError}</Notice>}
          {members && (
            <>
              <List>
                {members.members.map((m) => (
                  <Row
                    key={m.address}
                    title={m.name ?? "Unnamed"}
                    detail={`${short(m.address)} · membership ${m.memberships.join(", ")}`}
                    status={m.you ? <Status tone="live">you</Status> : undefined}
                  />
                ))}
              </List>
              <Notice>{members.line}</Notice>
            </>
          )}
        </Section>

        {data && (
          <Section label="What it can prove">
            {data.proofs.length ? (
              <List>
                {data.proofs.map((p) => (
                  <Row
                    key={p.label}
                    title={p.label}
                    detail={`${p.check.detail}${p.note ? `. ${p.note}` : ""}`}
                    status={<Status tone={p.check.ok === true ? "ok" : p.check.ok === false ? "danger" : "idle"}>{p.check.ok === true ? "checked" : p.check.ok === false ? "does not hold" : "not read"}</Status>}
                    action={p.check.link ? <Button variant="quiet" icon={ExternalLink} onClick={() => void openInBrowser(p.check.link)}>Chain</Button> : undefined}
                  />
                ))}
              </List>
            ) : (
              <Empty>Nothing recorded yet. The first proof shows here the moment one is written down.</Empty>
            )}
          </Section>
        )}

        {ah && (
          <Section label="What it holds">
            <List>
              {ah.accounts.map((a: any) => (
                <Row key={a.address} title={a.label} detail={`${a.what} · ${short(a.address)}`} status={<Status>{a.dUSD} dUSD</Status>} />
              ))}
              {ah.contracts.map((x: any) => (
                <Row key={x.address} title={x.label} detail={`${x.what} · ${short(x.address)}`} status={<Status tone={x.deployed ? "ok" : x.deployed === false ? "danger" : "idle"}>{x.deployed ? "deployed" : x.deployed === false ? "no code" : "not read"}</Status>} />
              ))}
            </List>
          </Section>
        )}

        {data && <Facts items={[["read", new Date(data.readAt).toLocaleString("en-GB")], ["from", base.replace(/^https:\/\//, "")]]} />}
      </PageBody>
    </Page>
  );
}

export const onchainPlugin: MurmurPlugin = {
  id: "onchain",
  title: "On chain",
  tagline: "Your group as the chains see it",
  icon: Link2,
  order: 60,
  kind: "plugin",
  support: issues("onchain"),
  backend: "infra/services/explorer, on the collective's own address",
  Panel,
};
