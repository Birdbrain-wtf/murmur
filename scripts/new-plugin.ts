#!/usr/bin/env bun
/**
 * Scaffold a new plugin.
 *
 *   bun run new-plugin <id>      # id is kebab-case, e.g. "ledger" or "good-news"
 *
 * Writes src/plugins/<id>/index.tsx with a minimal, valid MurmurModule. The
 * registry auto-discovers it (import.meta.glob over src/plugins/*), so there is
 * nothing else to wire — start `bun run dev` and the plugin shows in the catalog.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const id = process.argv[2];

if (!id) {
  console.error("usage: bun run new-plugin <id>   (kebab-case, e.g. ledger)");
  process.exit(1);
}
if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(id)) {
  console.error(`invalid id "${id}" — use kebab-case: ^[a-z][a-z0-9-]*$`);
  process.exit(1);
}

const dir = join(process.cwd(), "src", "plugins", id);
if (existsSync(dir)) {
  console.error(`plugin already exists: src/plugins/${id}/`);
  process.exit(1);
}

const title = id
  .split("-")
  .map((s) => s[0].toUpperCase() + s.slice(1))
  .join(" ");
const exportName =
  id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase()) + "Plugin";

const tpl = `import { Puzzle } from "lucide-react";
import type { MurmurModule, PluginContext } from "../../host/types";

/**
 * ${title} plugin — TODO: describe what this binds to and does.
 */
function Panel({ identity }: PluginContext) {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-[var(--line)] px-8 pt-7 pb-5">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--faint)]">
          <Puzzle className="h-3.5 w-3.5" />
          ${id}
        </div>
        <h1 className="font-tight mt-2 text-2xl font-medium">${title}</h1>
        <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">
          New plugin scaffold. Replace this panel with the real surface.
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-xl rounded-[var(--radius)] border border-dashed border-[var(--line-strong)] bg-[var(--raise)] px-5 py-4 text-[13px] leading-relaxed text-[var(--muted)]">
          Wire up <span className="font-mono">${id}</span> here.
          {identity.handle ? \` Signed in as \${identity.handle}.\` : ""}
        </div>
      </div>
    </div>
  );
}

export const ${exportName}: MurmurModule = {
  id: "${id}",
  title: "${title}",
  tagline: "TODO: one-line description for the catalog",
  icon: Puzzle,
  // ordering weight in the rail (lower = higher). Existing: understand 10,
  // chat 20, pay 25, meet 30, watch 35, contact 40, network 50. Adjust to taste.
  order: 60,
  kind: "plugin",
  // backend: "Sovereign target this binds to",
  Panel,
};
`;

mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "index.tsx"), tpl);

console.log(`✓ created src/plugins/${id}/index.tsx  (export: ${exportName})`);
console.log("  auto-discovered by the registry — run `bun run dev` to see it.");
console.log("  next: set order/backend, build the Panel, then `bun run build` to type-check.");
