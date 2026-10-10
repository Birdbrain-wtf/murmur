import { Mail, ShieldCheck, Server, KeyRound } from "lucide-react";
import type { MurmurModule, PluginContext } from "../../host/types";
import { issues } from "../../host/support";

/**
 * Contact plugin — email.
 *
 * The sovereign correspondence layer: Decent's own mail under decent.partners,
 * moving off Google Workspace over time. This is the heaviest sovereignty step
 * (IP reputation, PTR, DKIM/SPF/DMARC), so v0.1 is an honest roadmap surface —
 * it does not send mail yet. It comes online once the mail server and DNS
 * (SPF/DKIM/DMARC) are stood up.
 */

const STAGES = [
  {
    icon: Server,
    title: "Stand up the mail server",
    body: "A mail stack (e.g. Stalwart / Maddy) on a Decent-owned box — IMAP + SMTP, the same Hetzner playbook as chat and meet.",
  },
  {
    icon: ShieldCheck,
    title: "Earn deliverability",
    body: "SPF, DKIM and DMARC on decent.partners, plus reverse DNS. Add these alongside the existing Google MX first — reversible, and it lifts current mail too.",
  },
  {
    icon: KeyRound,
    title: "One identity, one inbox",
    body: "Your Decent passkey identity is the mailbox — no separate account. Correspondence joins chat, notes and meet under a single sign-in.",
  },
];

function Panel({ instance }: PluginContext) {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-[var(--line)] px-8 pt-7 pb-5">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--faint)]">
          <Mail className="h-3.5 w-3.5" />
          contact
        </div>
        <h1 className="font-tight mt-2 text-2xl font-medium">
          Your own correspondence
        </h1>
        <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">
          Sovereign email under{" "}
          <span className="font-mono text-[var(--fg)]">{instance.slug}.partners</span>{" "}
          — owned, not rented. Not live yet; here's the path.
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        <div className="flex flex-col gap-2">
          {STAGES.map((s, i) => {
            const Icon = s.icon;
            return (
              <article
                key={s.title}
                className="prism-hover flex gap-4 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--card)] px-5 py-4"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--line-strong)]">
                  <Icon className="h-4 w-4 text-[var(--muted)]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-[var(--faint)]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="font-tight text-sm font-medium">
                      {s.title}
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">
                    {s.body}
                  </p>
                </div>
              </article>
            );
          })}
        </div>

        <p className="font-mono mt-6 text-[11px] leading-relaxed text-[var(--faint)]">
          Sequenced after chat (Matrix) on the sovereignty ladder — DNS
          consolidation first, then SPF/DMARC, then the mail server. Until then
          this surface stays a plan, not a promise.
        </p>
      </div>
    </div>
  );
}

export const contactPlugin: MurmurModule = {
  id: "contact",
  title: "Contact",
  tagline: "Sovereign email under decent.partners",
  icon: Mail,
  order: 40,
  kind: "plugin",
  support: issues("contact"),
  backend: "Self-hosted email",
  Panel,
};
