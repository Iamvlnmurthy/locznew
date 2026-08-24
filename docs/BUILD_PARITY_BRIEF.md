# Brief for Codex — VPS web build fails at prerender (build-parity)

**Owner: Codex** (`apps/web`). Symptom is deploy-blocking. My `scripts/deploy-web.sh` is the safety
net (it restores the previous build and aborts on any unknown failure), so prod is protected — but
your newest city-page work **cannot go live until `next build` passes on the VPS**.

## The pattern

`npm run build -w @locz/web` **compiles cleanly, then fails during static prerender/export** — and
it has now failed on **two different special pages**, while you report the build passing locally:

| Push                    | VPS build fails on | Error                                                               |
| ----------------------- | ------------------ | ------------------------------------------------------------------- |
| city guides + ads       | `/_global-error`   | `TypeError: Cannot read properties of null (reading 'useContext')`  |
| latest city-page polish | `/_not-found`      | `TypeError: Cannot read properties of undefined (reading 'length')` |

`/_not-found` failing _instead of_ `/_global-error` suggests the latest push moved the first one past
prerender and exposed the next. **Your local "production build passed" is not catching this**, so the
core issue is **build parity**: your build environment differs from the VPS.

## VPS build environment (match this to reproduce)

- Linux x86_64, **Node v22.22.2**, npm 10.9.7, Next **16.2.12**, React **19.2.8**.
- Build command the VPS runs (env matters — `NEXT_PUBLIC_*` are baked at build):
  ```
  cd /home/locz/app && set -a && . ./.env && set +a && npm run build -w @locz/web
  ```
- Ruled out: dup React (single copy), OOM (9 GB free), Node version (fails on both 20 and 22).
- So it's **platform/prerender-time**: almost certainly one of the special pages (or a shared import
  they pull — `getLocale` → `headers()`/`cookies()`, `getTranslator`, i18n `MESSAGES`) reads
  something that is `undefined`/`null` **during static export on Linux**, where your local env happens
  to provide it.

## What to do

1. **Reproduce on Linux.** Build in a Linux container matching the above (e.g. `node:22-bookworm`)
   with the repo `.env` sourced, before claiming the build passes. This will surface both failures.
2. **Make the special pages prerender-safe** (they must render with NO request context):
   - `not-found.tsx`: it calls `await getLocale()` which uses `headers()`/`cookies()`. During the
     special-page export there is no request, so make it resilient — e.g. `export const dynamic =
'force-dynamic'`, or don't resolve locale from request in not-found (use `DEFAULT_LOCALE`), or
     guard the `.length` read the stack points at. The page must not depend on request-time data.
   - `global-error.tsx`: keep it a minimal client component with **no context/hook usage** and no
     imports that touch app providers (the current one is already minimal — verify nothing it imports
     pulls a context at module scope).
3. **If it's a genuine Next 16.2.12 prerender bug**, test the bump to **16.3.2** (latest) — but do it
   **on your machine + a Linux build**, across the monorepo (root `next`, not a single workspace, or
   hoisting leaves a mismatched copy — that mismatch 500'd prod when I tried it in place). Push only
   after a clean Linux `next build`.

## Deploy contract (so nothing breaks again)

- Deploy web **only** via `sudo -u locz bash scripts/deploy-web.sh` on the VPS. It backs up `.next`,
  builds, injects the stub manifest **only** for the known `/_global-error` export failure, and
  **restores + aborts** on any other failure. Never run a bare `npm run build -w @locz/web` on the
  VPS without a `.next` backup (a failed build wiped the manifest and caused the 24 Aug 503).
- When your build is clean on Linux, the stub logic becomes a no-op and deploys are fully clean.

## Definition of done

`next build` exits 0 on a Linux/Node-22 build with `.env` sourced (both `/_global-error` and
`/_not-found` prerender), verified before push; then `deploy-web.sh` ships it with no stub needed.
