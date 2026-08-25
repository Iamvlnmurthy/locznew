# CI/CD deploy — one-time setup

`.github/workflows/deploy.yml` builds the app on a GitHub Linux runner and ships the finished
artifacts to the VPS, so `next build`/`nest build` **never run on the 15GB prod box** again (the
build-OOM that OOM-killed Postgres is gone), and **argon2 is rebuilt from source on every deploy**
(the silent api core-dump is gone).

## What you must add (I can't set repo secrets for you)

In GitHub → the `locznew` repo → **Settings → Secrets and variables → Actions → New repository secret**,
add these three:

| Secret        | Value                                                                                                                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VPS_HOST`    | `76.13.242.93`                                                                                                                                                                                                                                                |
| `VPS_USER`    | `root`                                                                                                                                                                                                                                                        |
| `VPS_SSH_KEY` | the **private** SSH key that logs into that box (the whole file, incl. the `-----BEGIN/END-----` lines). Use the same key your local `onrol` host uses, or generate a dedicated deploy key and add its **public** half to the box's `~/.ssh/authorized_keys`. |

> Prefer a **dedicated deploy key** over reusing your personal key: `ssh-keygen -t ed25519 -f deploy_key -N ""`, add `deploy_key.pub` to the VPS `authorized_keys`, paste `deploy_key` (private) into `VPS_SSH_KEY`.

## How it runs

- On every push to `master` (or manually via **Actions → Build & Deploy → Run workflow**).
- Steps: install → prisma generate → build api+web on the runner → sync source on the VPS to the
  exact commit → rsync the prebuilt `.next` + `dist` over it → `npm install` + `argon2` rebuild +
  `db:generate` + `pm2 restart` → health-check `https://locz.in/` returns 200.

## First run

Push a trivial change (or use **Run workflow**) and watch the Actions tab. The **first run is the
one to babysit** — if the rsync/ssh step fails it's almost always a secret/permissions issue (wrong
key, or the key's public half isn't in the box's `authorized_keys`).

## Relationship to the shell scripts

`scripts/deploy-web.sh` and `scripts/deploy-api.sh` stay as the **manual fallback** (they still build
on-box, but with the memory guard + argon2 rebuild). Once CI is green you'll rarely need them —
prefer CI so the box never builds.
