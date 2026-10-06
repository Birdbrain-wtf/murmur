import {
  Play,
  Radio,
  Disc3,
  CreditCard,
  Boxes,
  Landmark,
  ArrowUpRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { MurmurPlugin, PluginContext } from "../../host/types";

const PILLARS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Disc3,
    title: "The publication",
    body: "Shows, sets and drops with rich, relational metadata — the flock's own canon of music and culture.",
  },
  {
    icon: CreditCard,
    title: "Creators paid directly",
    body: "Stablecoin payments through Decent Pay — micropayments, passes and memberships, no middle layer.",
  },
  {
    icon: Boxes,
    title: "Bring-your-own storage",
    body: "Media lives on Fangorn: flexible, private, low-cost decentralised storage.",
  },
  {
    icon: Landmark,
    title: "Governed by the flock",
    body: "Ownership, attribution and moderation handled by the Crevo DAO.",
  },
];

function Panel({ open }: PluginContext) {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-[var(--line)] px-8 pt-7 pb-5">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--faint)]">
          <Radio className="h-3.5 w-3.5" />
          watch
        </div>
        <h1 className="font-tight mt-2 text-2xl font-medium">Four to the Floor</h1>
        <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">
          The flock's publication — decentralised music and culture, with
          creators paid directly through Decent Pay.
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {/* now-playing placeholder — first broadcast is not live yet */}
        <div className="relative overflow-hidden rounded-[calc(var(--radius)+4px)] border border-[var(--line)] bg-[var(--card)]">
          <div className="spectrum-bar" />
          <div className="flex aspect-[16/7] flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--line-strong)] text-[var(--muted)]">
              <Play className="h-5 w-5" />
            </div>
            <div className="font-tight text-base font-medium">
              Not broadcasting yet
            </div>
            <p className="max-w-sm text-sm text-[var(--muted)]">
              The first drop is in production. When it lands, it plays here.
            </p>
          </div>
        </div>

        {/* what it is */}
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {PILLARS.map((p) => {
            const Icon = p.icon;
            return (
              <article
                key={p.title}
                className="prism-hover rounded-[var(--radius)] border border-[var(--line)] bg-[var(--card)] px-4 py-4"
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-[var(--muted)]" />
                  <span className="font-tight text-sm font-medium">
                    {p.title}
                  </span>
                </div>
                <p className="font-serif mt-1.5 text-[13.5px] leading-relaxed text-[var(--muted)]">
                  {p.body}
                </p>
              </article>
            );
          })}
        </div>

        {/* cross-link to pay */}
        <div className="prism-hover mt-6 flex items-center gap-4 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--card)] px-5 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius)] border border-[var(--line-strong)]">
            <CreditCard className="h-5 w-5 text-[var(--muted)]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-tight text-sm font-medium">
              Creators are paid through Decent Pay
            </div>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Set up your wallet so payments land the moment a drop sells.
            </p>
          </div>
          <button
            onClick={() => open("pay")}
            className="prism-hover flex shrink-0 items-center gap-1 rounded-full border border-[var(--line-strong)] px-3 py-1.5 text-xs font-medium"
          >
            open Pay <ArrowUpRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

export const watchPlugin: MurmurPlugin = {
  id: "watch",
  title: "Watch",
  tagline: "Four to the Floor — the flock's publication",
  icon: Play,
  order: 35,
  kind: "plugin",
  backend: "Four to the Floor (Decent publication)",
  Panel,
};
