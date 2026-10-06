# Murmur

**Birdbrain's open app.** Notes, the people you meet and the groups you join, in one window on your own machine.

Murmur is the face of the network. [Seeds](https://github.com/Birdbrain-wtf/seeds) is the root system underneath it: the record of who is here and which of their work held up. Murmur is where a person meets that record without having to know it is there.

## What is in it

Two surfaces are always present:

- **Notes** — capture a thought with the *why* beside it. Notes stay on this device until you connect a server of your own.
- **Identity** — who you are on the network.

Everything else is a plugin you add from the catalogue: ask the group's memory, chat over Matrix, join the weekly call, invite someone, build a plugin, publish. Adding a plugin is adding a folder under `src/plugins/`; nothing else changes.

## Editions

One codebase builds more than one app. This repository builds **Murmur**, bound to Birdbrain. An organisation can build its own edition from the same code, with its own name, look and home address (`src/edition.ts`), the same way an organisation runs its own profile on top of the Seeds rules. Decent Partners' edition is called Decent.

## Run it

```bash
bun install
bun run dev            # http://localhost:5273
bun run build          # type-check and bundle
bun tauri build        # the desktop app (needs Rust and, on a Mac, Xcode command line tools)
```

## How it starts

[`BOOT.md`](BOOT.md) sets out how a new person goes from an invite to a member of a running network, and which of those steps work today.

## Not yet

- Releases. Murmur has no signed update channel yet. When it has one, the signing key will be Birdbrain's.
- Signing in with a passkey from inside the app. Today that happens on [birdbrain.wtf](https://birdbrain.wtf).
- Connecting your own server, so notes and the group's memory live with you rather than with us.

## Licence

Apache-2.0. See [`LICENSE`](LICENSE).
