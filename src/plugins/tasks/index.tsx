import { useEffect, useState } from "react";
import { ClipboardList, ExternalLink } from "lucide-react";
import { edition } from "../../edition";
import type { MurmurPlugin } from "../../host/types";
import { issues } from "../../host/support";
import { openInBrowser } from "../../identity/passkey";
import { Button, Card, Empty, List, Notice, Page, PageBody, PageHeader, Row, Section, Status, Waiting } from "../../ui";

/**
 * Tasks: the jobs a network needs done, read from the collective's own address
 * (`edition.tasks`, infra/services/kabocha-tasks on Birdbrain's box). The same
 * board as birdbrain.wtf/networks/kabocha/tasks, whose source of truth is the
 * public repo github.com/Birdbrain-wtf/kabocha-tasks. Read-only: offering a plan
 * opens the offer form in the browser. Nothing here is paid until holders vote a
 * budget, and the copy never says otherwise.
 */

const base = edition.tasks?.base ?? null;
const RUNG: Record<number, string> = { 1: "Rung 1", 2: "Rung 2", 3: "Rung 3" };
const NAME: Record<string, string> = { node: "plain node", rpc: "public endpoint", collator: "collator", archive: "archive node" };
const gbp = (r: [number, number] | null) => (r ? `£${r[0]} to £${r[1]} a month` : "not priced");
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

type Board = {
  repo: string;
  read: string;
  board: any | null;
  offers: { number: number; title: string; state: string; url: string; opened: string; comments: number; job: string | null }[];
  errors: { board: string | null; issues: string | null };
  checks: { every_minutes: number; window_days: number };
};

function Panel() {
  const [data, setData] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!base) return;
    let live = true;
    setError(null);
    fetch(`${base}/api/kabocha-tasks`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30_000) })
      .then(async (r) => {
        const d = (await r.json()) as Board;
        if (!d.board) throw new Error(d.errors?.board || `status ${r.status}`);
        return d;
      })
      .then((d) => live && setData(d))
      .catch((e) => live && setError(String(e.message || e)));
    return () => {
      live = false;
    };
  }, [attempt]);

  const page = `${base}/networks/kabocha/tasks`;
  const header = (
    <PageHeader
      icon={ClipboardList}
      eyebrow="tasks"
      title="Kabocha"
      lede="The jobs Kabocha needs done, each with a test run from outside. Offer a plan, not a price, and build a record one rung at a time."
      actions={
        base ? (
          <Button variant="quiet" icon={ExternalLink} onClick={() => void openInBrowser(page)}>
            Public page
          </Button>
        ) : undefined
      }
    />
  );

  if (!base)
    return (
      <Page>
        {header}
        <PageBody>
          <Empty>{edition.instance.name} has no task board of its own yet.</Empty>
        </PageBody>
      </Page>
    );

  if (error)
    return (
      <Page>
        {header}
        <PageBody>
          <Card tone="dashed">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-tight text-sm font-medium">Couldn't read the board</div>
                <div className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">{error}. The board also lives at github.com/Birdbrain-wtf/kabocha-tasks.</div>
              </div>
              <Button variant="primary" onClick={() => setAttempt((n) => n + 1)}>
                Try again
              </Button>
            </div>
          </Card>
        </PageBody>
      </Page>
    );

  if (!data)
    return (
      <Page>
        {header}
        <PageBody>
          <Waiting>Reading the board…</Waiting>
        </PageBody>
      </Page>
    );

  const b = data.board;
  const ops: any[] = b.operators || [];
  const offer = () => void openInBrowser(`${data.repo}/issues/new?template=offer.yml`);
  const open = data.offers.filter((o) => o.state === "open");

  return (
    <Page>
      {header}
      <PageBody width="wide">
        <Section label="What Kabocha needs" lede="Kusama's validators secure Kabocha, so it needs no validators of its own. It needs people running it besides Birdbrain.">
          <List>
            {(b.needs || []).map((n: any) => {
              const have = ops.filter((o) => o.job === n.job || (n.job === "rpc" && o.check?.rpc)).length;
              return (
                <Row
                  key={n.job}
                  title={`${cap(NAME[n.job] || n.job)}${n.want > 1 ? "s" : ""}: ${have} of ${n.want}`}
                  detail={n.note ? cap(n.note) : undefined}
                  status={<Status tone={have >= n.want ? "ok" : "warn"}>{have >= n.want ? "covered" : "wanted"}</Status>}
                />
              );
            })}
          </List>
        </Section>

        <Section label="The jobs" aside={<Button variant="primary" onClick={offer}>Offer a plan</Button>}>
          <List>
            {b.jobs.map((j: any) => {
              const offers = open.filter((o) => o.job === j.id).length;
              return (
                <Row
                  key={j.id}
                  title={`${RUNG[j.rung] || "After rung 1"}: ${j.title}`}
                  status={
                    <>
                      <Status>{j.needs_key ? "session key" : "no key"}</Status>
                      <Status>{j.needs_vote ? "holders' vote" : "no vote"}</Status>
                      {offers > 0 && <Status tone="live">{offers} open offer{offers > 1 ? "s" : ""}</Status>}
                    </>
                  }
                  detail={
                    <>
                      {j.summary}
                      <br />
                      Test: {String(j.test).replace(/\.$/, "")}. Passes: {j.pass}.
                      <br />
                      {j.pay
                        ? `Proposed: hardware ${gbp(j.pay.hardware_gbp_month)}, labour ${gbp(j.pay.labour_gbp_month_per_operator)} per operator. ${cap(j.pay.basis)}.`
                        : "No pay. This rung is how a record starts."}
                    </>
                  }
                  action={
                    <Button variant="quiet" icon={ExternalLink} onClick={() => void openInBrowser(`${data.repo}/blob/main/${j.page}`)}>
                      Full job
                    </Button>
                  }
                />
              );
            })}
          </List>
          <div className="mt-3">
            <Notice tone="warn">
              Nothing here is paid yet. Kabocha's holders have not voted an operator budget. Running a node before then builds the record a paid seat would need. It does not create a claim to back pay.
            </Notice>
          </div>
        </Section>

        <Section label="Who is on the board">
          {ops.length ? (
            <List>
              {ops.map((o) => (
                <Row
                  key={`${o.who}-${o.job}`}
                  title={`${o.who}, ${NAME[o.job] || o.job}`}
                  status={<Status tone="ok">{RUNG[o.rung] || ""} since {day(o.since)}</Status>}
                  detail={
                    <>
                      {o.host}
                      {o.independent === false ? ". Birdbrain's own, so it does not count as independent" : ""}
                      {(o.record || []).map((r: any) => (
                        <span key={r.kind}>
                          <br />
                          {r.passed} of {r.checks} checks passed since {day(r.first)}
                          {r.lastOk ? "" : `, last check failed (${r.why || "no answer"})`}
                        </span>
                      ))}
                    </>
                  }
                />
              ))}
            </List>
          ) : (
            <Empty>Nobody yet.</Empty>
          )}
        </Section>

        <Section label="Offers">
          {open.length ? (
            <List>
              {open.map((o) => (
                <Row
                  key={o.number}
                  title={o.title}
                  detail={`${o.job ? cap(NAME[o.job]) : "Job not stated"} · opened ${day(o.opened)} · ${o.comments} comment${o.comments === 1 ? "" : "s"}`}
                  action={
                    <Button variant="quiet" icon={ExternalLink} onClick={() => void openInBrowser(o.url)}>
                      Open
                    </Button>
                  }
                />
              ))}
            </List>
          ) : (
            <Empty>No offers yet. The first rung needs no key and no vote.</Empty>
          )}
        </Section>
      </PageBody>
    </Page>
  );
}

export const tasksPlugin: MurmurPlugin = {
  id: "tasks",
  title: "Tasks",
  tagline: "Jobs the network needs done",
  icon: ClipboardList,
  order: 62,
  kind: "plugin",
  lab: true,
  support: issues("tasks"),
  backend: "the collective's own address, from a public board anyone can read",
  Panel,
};
