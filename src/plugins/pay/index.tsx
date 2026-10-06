import { useState } from "react";
import {
  Wallet,
  Loader2,
  CreditCard,
  Plus,
  RefreshCw,
  Coins,
  Eye,
  EyeOff,
} from "lucide-react";
import type { MurmurPlugin, PluginContext } from "../../host/types";
import {
  walletBalance,
  walletInit,
  walletTransactions,
  walletCard,
  accountUrn,
  accountBalance,
  accountName,
  cardInfo,
  isCardAccount,
  type WalletAccount,
  type WalletTx,
} from "../../lib/wallet";

function Panel({ instance, identity }: PluginContext) {
  // Wallet calls share the instance's Decent space origin (same as birdbrain).
  const base = instance.birdbrainBase;

  const [alias, setAlias] = useState((identity.handle ?? "").replace(/^@/, ""));
  const [phase, setPhase] = useState<"idle" | "loading" | "ready">("idle");
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<WalletAccount[] | null>(null);
  const [creating, setCreating] = useState(false);

  const [selected, setSelected] = useState<string | null>(null);
  const [txLoading, setTxLoading] = useState(false);
  const [txs, setTxs] = useState<WalletTx[] | null>(null);

  // Reveal the live card face (Pomelo secure iframe) — fetched fresh on click.
  const [revealUrn, setRevealUrn] = useState<string | null>(null);
  const [revealUrl, setRevealUrl] = useState<string | null>(null);
  const [revealLoading, setRevealLoading] = useState(false);

  async function connect(e?: React.FormEvent) {
    e?.preventDefault();
    const a = alias.trim().replace(/^@/, "");
    if (!a) return;
    setPhase("loading");
    setError(null);
    setTxs(null);
    setSelected(null);
    try {
      setAccounts(await walletBalance(base, a));
      setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not reach Decent Pay");
      setPhase("idle");
    }
  }

  // Provisions a real Bloque pocket + card — only on explicit request.
  async function createWallet() {
    const a = alias.trim().replace(/^@/, "");
    if (!a) return;
    setCreating(true);
    setError(null);
    try {
      setAccounts(await walletInit(base, a));
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not create wallet");
    } finally {
      setCreating(false);
    }
  }

  async function openAccount(a: WalletAccount) {
    const urn = accountUrn(a);
    if (!urn) return;
    setSelected(urn);
    setTxLoading(true);
    setTxs(null);
    try {
      setTxs(await walletTransactions(base, urn));
    } catch {
      setTxs([]);
    } finally {
      setTxLoading(false);
    }
  }

  async function toggleReveal(a: WalletAccount) {
    const urn = accountUrn(a);
    if (!urn) return;
    if (revealUrn === urn) {
      setRevealUrn(null);
      setRevealUrl(null);
      return;
    }
    const a2 = alias.trim().replace(/^@/, "");
    setRevealUrn(urn);
    setRevealUrl(null);
    setRevealLoading(true);
    try {
      const face = await walletCard(base, a2, urn);
      setRevealUrl(face.cardUrl ?? null);
    } catch {
      setRevealUrl(null);
    } finally {
      setRevealLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-[var(--line)] px-8 pt-7 pb-5">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--faint)]">
          <Wallet className="h-3.5 w-3.5" />
          pay
        </div>
        <h1 className="font-tight mt-2 text-2xl font-medium">Decent Pay</h1>
        <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">
          A programmable stablecoin wallet for the flock — balances, a card and
          payments, on Bloque. Creators get paid here.
        </p>
      </header>

      {/* connect bar */}
      <div className="px-8 pt-6">
        <form
          onSubmit={connect}
          className="prism-hover flex items-center gap-3 rounded-[var(--radius)] border border-[var(--line-strong)] bg-[var(--card)] px-4 py-3"
          data-active={phase === "loading"}
        >
          {phase === "loading" ? (
            <Loader2 className="h-4 w-4 animate-spin text-[var(--muted)]" />
          ) : (
            <Coins className="h-4 w-4 text-[var(--muted)]" />
          )}
          <span className="font-mono text-[13px] text-[var(--faint)]">alias</span>
          <input
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="your-decent-handle"
            className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-[var(--faint)]"
          />
          <button
            type="submit"
            disabled={phase === "loading" || !alias.trim()}
            className="prism-hover flex items-center gap-1.5 rounded-full border border-[var(--line-strong)] px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            {phase === "ready" ? (
              <>
                <RefreshCw className="h-3.5 w-3.5" /> refresh
              </>
            ) : (
              <>connect</>
            )}
          </button>
        </form>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {error && (
          <div className="mb-4 rounded-[var(--radius)] border border-[#ff3b30]/30 bg-[#ff3b30]/5 px-4 py-3 text-sm text-[#c1271d]">
            Decent Pay — {error}
          </div>
        )}

        {phase === "idle" && !error && (
          <div className="text-sm text-[var(--muted)]">
            Connect with your Decent alias to see your wallet.
          </div>
        )}

        {phase === "ready" && accounts && accounts.length === 0 && (
          <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--card)] px-5 py-6 text-center">
            <CreditCard className="mx-auto h-6 w-6 text-[var(--faint)]" />
            <div className="font-tight mt-3 text-base font-medium">
              No wallet yet
            </div>
            <p className="mx-auto mt-1 max-w-sm text-sm text-[var(--muted)]">
              Create a Decent wallet for{" "}
              <span className="font-mono text-[var(--fg)]">
                {alias.trim().replace(/^@/, "")}
              </span>{" "}
              — a stablecoin pocket and a linked card on Bloque.
            </p>
            <button
              onClick={createWallet}
              disabled={creating}
              className="prism-hover mt-4 inline-flex items-center gap-2 rounded-[var(--radius)] border border-[var(--line-strong)] px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> creating…
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" /> Create wallet
                </>
              )}
            </button>
          </div>
        )}

        {accounts &&
          accounts.length > 0 &&
          (() => {
            const cards = accounts.filter(isCardAccount);
            const others = accounts.filter((a) => !isCardAccount(a));
            return (
              <div className="flex flex-col gap-6">
                {/* Card mediums — the branded Decent card face. */}
                {cards.map((a, i) => {
                  const urn = accountUrn(a);
                  const bal = accountBalance(a);
                  const info = cardInfo(a);
                  const name = accountName(a) || "Decent Card";
                  const isOpen = urn != null && urn === selected;
                  const isRevealed = urn != null && urn === revealUrn;
                  const kind =
                    info?.card_type === "VIRTUAL" ? "Virtual debit" : "Debit";
                  return (
                    <div key={urn ?? `card-${i}`} className="flex flex-col">
                      <button
                        onClick={() => openAccount(a)}
                        data-active={isOpen}
                        aria-label={`${name} — ${info?.card_provider ?? "VISA"} ${kind}`}
                        className="prism-hover flex flex-col items-start rounded-[var(--radius)] border border-[var(--line)] bg-[var(--card)] px-4 py-4 text-left data-[active=true]:border-[var(--line-strong)]"
                      >
                        <div className="flex w-full items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <CreditCard className="h-4 w-4 shrink-0 text-[var(--muted)]" />
                            <span className="font-tight truncate text-sm font-medium">
                              {name}
                            </span>
                          </div>
                          <span className="font-mono shrink-0 text-[10px] uppercase tracking-[0.18em] text-[var(--faint)]">
                            {kind}
                          </span>
                        </div>
                        <div className="font-tight mt-3 text-2xl font-medium">
                          {bal ?? "—"}
                        </div>
                        <div className="font-mono mt-2 flex w-full flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--muted)]">
                          <span className="tracking-[0.18em]">
                            ···· {info?.card_last_four ?? "····"}
                          </span>
                          <span className="text-[var(--faint)]">·</span>
                          <span>{info?.card_provider ?? "VISA"}</span>
                          {info?.card_status && (
                            <>
                              <span className="text-[var(--faint)]">·</span>
                              <span className="uppercase tracking-[0.18em]">
                                {info.card_status.toLowerCase()}
                              </span>
                            </>
                          )}
                        </div>
                      </button>
                      <div className="mt-3 flex justify-end">
                        <button
                          onClick={() => toggleReveal(a)}
                          className="prism-hover flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--line-strong)] px-3 py-1.5 text-xs font-medium"
                        >
                          {isRevealed ? (
                            <>
                              <EyeOff className="h-3.5 w-3.5" /> Hide
                            </>
                          ) : (
                            <>
                              <Eye className="h-3.5 w-3.5" /> Reveal card
                            </>
                          )}
                        </button>
                      </div>
                      {isRevealed && (
                        <div className="mt-3 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--card)]">
                          {revealLoading ? (
                            <div className="flex items-center gap-2 px-4 py-6 text-sm text-[var(--muted)]">
                              <Loader2 className="h-4 w-4 animate-spin" /> loading
                              card…
                            </div>
                          ) : revealUrl ? (
                            <iframe
                              src={revealUrl}
                              title="Card details"
                              className="block h-[230px] w-full border-0 bg-white"
                            />
                          ) : (
                            <div className="px-4 py-6 text-sm text-[var(--muted)]">
                              Card details unavailable right now.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Non-card accounts (treasury / virtual pockets). */}
                {others.length > 0 && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {others.map((a, i) => {
                      const urn = accountUrn(a);
                      const bal = accountBalance(a);
                      const name = accountName(a) || "Wallet";
                      return (
                        <button
                          key={urn ?? `acct-${i}`}
                          onClick={() => openAccount(a)}
                          data-active={urn != null && urn === selected}
                          className="prism-hover flex flex-col items-start rounded-[var(--radius)] border border-[var(--line)] bg-[var(--card)] px-4 py-4 text-left data-[active=true]:border-[var(--line-strong)]"
                        >
                          <div className="flex w-full items-center gap-2">
                            <Wallet className="h-4 w-4 text-[var(--muted)]" />
                            <span className="font-tight text-sm font-medium">
                              {name}
                            </span>
                          </div>
                          <div className="font-tight mt-3 text-2xl font-medium">
                            {bal ?? "—"}
                          </div>
                          {urn && (
                            <div className="font-mono mt-2 w-full truncate text-[10px] text-[var(--faint)]">
                              {urn}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

        {selected && (
          <div className="mt-6">
            <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--faint)]">
              <RefreshCw className="h-3 w-3" />
              transactions
            </div>
            {txLoading && (
              <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
                <Loader2 className="h-4 w-4 animate-spin" /> loading…
              </div>
            )}
            {!txLoading && txs && txs.length === 0 && (
              <div className="text-sm text-[var(--muted)]">No movements yet.</div>
            )}
            <div className="flex flex-col gap-1.5">
              {!txLoading &&
                txs?.map((t, i) => (
                  <div
                    key={t.id ?? i}
                    className="flex items-center gap-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--card)] px-4 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">
                        {t.description || t.direction || t.status || "movement"}
                      </div>
                      {t.createdAt && (
                        <div className="font-mono text-[10px] text-[var(--faint)]">
                          {fmtDate(t.createdAt)}
                        </div>
                      )}
                    </div>
                    {t.amount != null && (
                      <div className="font-mono text-sm">
                        {String(t.amount)}
                        {t.currency ? ` ${t.currency}` : ""}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function fmtDate(s: string): string {
  const d = new Date(s);
  return isNaN(d.getTime())
    ? s
    : d.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

export const payPlugin: MurmurPlugin = {
  id: "pay",
  title: "Pay",
  tagline: "Your Decent wallet — balances, card & payments (Bloque)",
  icon: Wallet,
  order: 25,
  kind: "plugin",
  backend: "Bloque · Decent Pay",
  Panel,
};
