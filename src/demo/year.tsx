import { useMemo, useState } from "react";
import { Card, Status } from "../ui";
import type { Made } from "./shape";

/**
 * A made plugin whose items carry dates is drawn as the year at a glance: one
 * small month each, the event days filled in, today ringed. Tap a day or a name
 * to read about it. An item's `date` is a day ("2026-12-06"), several possible
 * days, or a month alone ("2027-01") when the day is not set yet. `end` makes a run.
 */

type Item = Made["sections"][number]["items"][number];
interface Placed {
  item: Item;
  /** "YYYY-MM" this sits in */
  month: string;
  /** the days of that month it covers; empty when only the month is known */
  days: number[];
  /** the days are alternatives ("the 12th or the 19th"), not a run */
  either: boolean;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEK = ["M", "T", "W", "T", "F", "S", "S"];
const INK = "var(--ink, var(--accent))";

export const dated = (m: Made) => m.sections.some((s) => s.items.some((it) => it.date));
/** the name without the date written after it: "Winter Fair, 6 December" → "Winter Fair" */
const short = (t: string) => t.split(",")[0];
const tone = (s?: string) => (/gap|help|wait|need|due|tentative/i.test(s ?? "") ? "warn" : "live") as "warn" | "live";

function place(items: Item[]): Placed[] {
  const out: Placed[] = [];
  for (const item of items) {
    const starts = ([] as string[]).concat(item.date ?? []);
    const byMonth = new Map<string, number[]>();
    for (const s of starts) {
      const month = s.slice(0, 7);
      const days = byMonth.get(month) ?? [];
      const d = Number(s.slice(8, 10));
      if (d) {
        const last = item.end && item.end.slice(0, 7) === month ? Number(item.end.slice(8, 10)) : d;
        for (let n = d; n <= Math.max(d, last); n++) days.push(n);
      }
      byMonth.set(month, days);
    }
    byMonth.forEach((days, month) => out.push({ item, month, days, either: starts.length > 1 }));
  }
  return out;
}

function span(placed: Placed[]): string[] {
  const keys = placed.map((p) => p.month).sort();
  if (!keys.length) return [];
  const out: string[] = [];
  let [y, m] = keys[0].split("-").map(Number);
  const end = keys[keys.length - 1];
  for (let i = 0; i < 24; i++) {
    const k = `${y}-${String(m).padStart(2, "0")}`;
    out.push(k);
    if (k === end) break;
    if (++m > 12) (m = 1), y++;
  }
  return out;
}

function when(p: Placed): string {
  if (!p.days.length) return "";
  if (p.either) return p.days.join(" or ");
  const first = p.days[0];
  const last = p.days[p.days.length - 1];
  return first === last ? String(first) : `${first}–${last}`;
}

export function YearView({ m }: { m: Made }) {
  const items = useMemo(() => m.sections.flatMap((s) => s.items).filter((it) => it.date), [m]);
  const placed = useMemo(() => place(items), [items]);
  const months = useMemo(() => span(placed), [placed]);
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [picked, setPicked] = useState<Item | undefined>(() => items.find((it) => /next/i.test(it.status ?? "")) ?? items[0]);

  return (
    <div className="grid gap-4">
      {picked && (
        <Card tone="quiet">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-tight text-base font-medium">{picked.title}</span>
            {picked.status && <Status tone={tone(picked.status)}>{picked.status}</Status>}
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">{picked.detail}</p>
        </Card>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {months.map((key) => {
          const [y, mo] = key.split("-").map(Number);
          const here = placed.filter((p) => p.month === key);
          const lead = (new Date(y, mo - 1, 1).getDay() + 6) % 7;
          const length = new Date(y, mo, 0).getDate();
          const byDay = new Map<number, Item>();
          here.forEach((p) => p.days.forEach((d) => byDay.set(d, p.item)));
          return (
            <div
              key={key}
              className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--card)] px-3 py-3"
              style={{ opacity: here.length || key === thisMonth ? 1 : 0.55 }}
            >
              <div className="mb-2 flex items-baseline justify-between">
                <span className="font-tight text-sm font-medium">{MONTHS[mo - 1]}</span>
                <span className="font-mono text-[10px] text-[var(--faint)]">{y}</span>
              </div>
              <div className="grid grid-cols-7 gap-y-0.5 text-center" aria-hidden={!here.length}>
                {WEEK.map((d, i) => (
                  <span key={i} className="font-mono text-[9px] text-[var(--faint)]">
                    {d}
                  </span>
                ))}
                {Array.from({ length: lead }, (_, i) => (
                  <span key={`b${i}`} />
                ))}
                {Array.from({ length }, (_, i) => {
                  const d = i + 1;
                  const it = byDay.get(d);
                  const today = key === thisMonth && d === now.getDate();
                  const maybe = /tentative/i.test(it?.status ?? "");
                  const done = /done/i.test(it?.status ?? "");
                  const cls = "mx-auto flex h-6 w-6 items-center justify-center rounded-full text-[11px] leading-none";
                  if (!it)
                    return (
                      <span key={d} className={`${cls} text-[var(--faint)]`} style={today ? { boxShadow: "inset 0 0 0 1px var(--fg)", color: "var(--fg)" } : undefined}>
                        {d}
                      </span>
                    );
                  return (
                    <button
                      key={d}
                      type="button"
                      title={it.title}
                      aria-label={it.title}
                      onClick={() => setPicked(it)}
                      className={`${cls} font-medium`}
                      style={
                        maybe
                          ? { border: `1.5px dashed ${INK}`, color: "var(--fg)" }
                          : { background: INK, color: "#fff", opacity: done ? 0.55 : 1, outline: picked === it ? "2px solid var(--fg)" : undefined, outlineOffset: 1 }
                      }
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 grid gap-1">
                {here.map((p) => (
                  <button
                    key={p.item.title}
                    type="button"
                    onClick={() => setPicked(p.item)}
                    className="flex items-baseline gap-1.5 text-left text-[12px] leading-snug"
                    style={{ color: picked === p.item ? "var(--fg)" : "var(--muted)" }}
                  >
                    <span className="font-mono shrink-0 text-[10px] text-[var(--faint)]">{when(p) || "tbc"}</span>
                    <span className={picked === p.item ? "underline underline-offset-4" : ""}>{short(p.item.title)}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="font-mono flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--faint)]">
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: INK }} /> date set
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ border: `1.5px dashed ${INK}` }} /> not confirmed
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ boxShadow: "inset 0 0 0 1px var(--fg)" }} /> today
        </span>
      </div>
    </div>
  );
}
