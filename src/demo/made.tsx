import {
  BookOpen,
  Briefcase,
  CalendarDays,
  ClipboardList,
  Clapperboard,
  Heart,
  MapPin,
  Package,
  Sprout,
  Store,
  Tv,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { MurmurModule, PluginContext } from "../host/types";
import { email } from "../host/support";
import { edition, shaped } from "../edition";
import { Button, Card, List, Notice, Page, PageBody, PageHeader, Row, Section, Status } from "../ui";
import type { IconName, Made, Shape } from "./shape";
import { demoNote } from "./note";
import { logoUrl } from "../host/useSkin";

/**
 * A plugin made for one organisation's own work, sketched for a visitor's group
 * ("What are you looking for?", `./shape.ts`): Events for a venue, Projects for
 * a production company, a Rota for volunteers. It shows what the plugin would
 * hold, with sample items. In a real app it is built for the group as a custom
 * plugin, by Decent's builders and agents.
 */

const ICON: Record<IconName, LucideIcon> = {
  calendar: CalendarDays,
  briefcase: Briefcase,
  users: Users,
  package: Package,
  "map-pin": MapPin,
  clipboard: ClipboardList,
  film: Clapperboard,
  heart: Heart,
  store: Store,
  sprout: Sprout,
  book: BookOpen,
  wrench: Wrench,
  tv: Tv,
};

function panelFor(m: Made, id: string) {
  const Icon = ICON[m.icon];
  return function MadePanel(_: PluginContext) {
    const name = edition.instance.name;
    return (
      <Page>
        <PageHeader
          icon={Icon}
          eyebrow={`made for ${name.toLowerCase()} · ${m.live ? "live from the lab" : "sample"}`}
          title={m.title}
          lede={m.tagline}
          actions={
            m.live ? (
              <a href={m.live.src} target="_blank" rel="noopener" className="text-[13px] text-[var(--muted)] underline underline-offset-4">
                Open on its own
              </a>
            ) : (
              <Button onClick={() => demoNote(`In your own app this adds to ${m.title}, in ${name}'s record.`)}>
                Add
              </Button>
            )
          }
        />
        <PageBody>
          {m.live && (
            <figure className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-black">
              <iframe
                src={m.live.src}
                title={m.title}
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                allowFullScreen
                className="block aspect-video max-h-[78vh] w-full border-0"
              />
              {m.live.label && (
                <figcaption className="font-mono bg-[var(--card)] px-3 py-2 text-[11px] text-[var(--faint)]">{m.live.label}</figcaption>
              )}
            </figure>
          )}
          {!m.live && m.hero && (
            <figure className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)]">
              <img src={logoUrl(m.hero.src)} alt={m.hero.alt} className="block aspect-[21/9] w-full object-cover" />
              {m.hero.credit && (
                <figcaption className="font-mono bg-[var(--card)] px-3 py-2 text-[11px] text-[var(--faint)]">{m.hero.credit}</figcaption>
              )}
            </figure>
          )}
          {!m.live && <Notice>
            {shaped?.alice || shaped?.source === "pack" ? "A plugin made for this group." : "Sketched from what you told us."} In your own app it is made to fit how {name}{" "}
            works, and changes when that does.
          </Notice>}
          {m.sections.map((s) => (
            <Section key={s.label} label={s.label}>
              <List>
                {s.items.map((it) => (
                  <Row
                    key={it.title}
                    title={it.title}
                    status={it.status ? <Status tone={/gap|help|wait|need|due/i.test(it.status) ? "warn" : "live"}>{it.status}</Status> : undefined}
                    detail={it.detail}
                  />
                ))}
              </List>
            </Section>
          ))}
          <Card tone="dashed">
            <p className="text-[13px] leading-relaxed text-[var(--muted)]">
              Custom plugins follow the same rules as the rest, with their own levels under "Who can use what". What
              people add stays theirs. One made for {name} can later be offered to other groups.
            </p>
          </Card>
        </PageBody>
      </Page>
    );
  };
}

/** The plugins a sketch was made with, as modules the host can mount (`made-1` to `made-3`). */
export function madeModules(s: Shape | null): MurmurModule[] {
  if (!s) return [];
  return s.made.map((m, i) => {
    const id = `made-${i + 1}`;
    return {
      id,
      title: m.title,
      tagline: m.tagline,
      icon: ICON[m.icon],
      order: 3 + i,
      kind: "plugin",
      support: email(id),
      backend: `made for ${s.name} (a sketch)`,
      Panel: panelFor(m, id),
    } satisfies MurmurModule;
  });
}
