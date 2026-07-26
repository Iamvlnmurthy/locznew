# Release status

## Where the candidate stands

Candidate `f3e51dc` produced a **valid, complete evidence run**: 17 of 18 gates passed, one
skipped by design, one failed. Evidence:
`artifacts/release-gate-2026-07-26T20-28-26.872Z.json`.

Reproduced, not observed once. Candidate `1f6db58` reached the same 17/18 earlier
(`release-gate-2026-07-26T20-03-41.433Z.json`), and a 16/18 run between the two failed its
HTTP stage because other commands were competing for the same machine — not because the
candidate changed.

Valid matters here. Earlier runs reached similar numbers while the tree was moving underneath
them, and a gate whose candidate changed mid-run has not measured anything. This run recorded
`Candidate commit and worktree stayed unchanged throughout the gate`, so the numbers describe
one specific commit.

```
PASS  immutable candidate            PASS  Flutter analysis
PASS  patch integrity                PASS  Flutter tests
PASS  reproducible install           PASS  browser interaction and accessibility
PASS  Prisma client generation       PASS  localized browser journey
PASS  production dependency audit    PASS  search browser journey
PASS  workspace typecheck            PASS  http acceptance suites
PASS  translation coverage           PASS  candidate stability
PASS  automated tests                SKIP  restricted safety workflow
PASS  production builds              FAIL  child-safety readiness
PASS  isolated candidate cleanup
```

The engineering work is verified. What remains is not code.

## The one failing gate, and why it should keep failing

`child-safety readiness` reports three passes and five failures:

```
PASS  Officer role has exactly the five restricted permissions
PASS  At least one active officer can authenticate to the restricted console
PASS  A second active officer provides operational continuity
FAIL  CHILD_SAFETY_RUNBOOK_VERSION is missing or still a placeholder
FAIL  CHILD_SAFETY_RUNBOOK_APPROVED_BY is missing or still a placeholder
FAIL  CHILD_SAFETY_RUNBOOK_APPROVED_AT must be a valid timestamp
FAIL  CHILD_SAFETY_RUNBOOK_REVIEW_AT must be a valid timestamp
FAIL  A vetted protected-hash provider is not configured
```

Each of these names a human commitment rather than a setting. `APPROVED_BY` is meant to hold
the name of a person who read the runbook and accepted responsibility for it; `APPROVED_AT` is
the date they did. A protected-hash provider is an access agreement with an organisation such
as PhotoDNA or Thorn, not a package to install.

They can be filled in with plausible-looking values in about a minute, and doing so would make
the gate pass while proving nothing. That is the specific outcome this gate exists to prevent,
so they have been left as they are.

Run `npm run verify:safety-readiness` after supplying them.

## What is blocked on infrastructure

None of this exists on the development machine, and none of it can be fabricated:

| Needed                                                | Checked by                     | Status                                 |
| ----------------------------------------------------- | ------------------------------ | -------------------------------------- |
| Docker daemon                                         | `npm run preflight:production` | `docker` not installed                 |
| TLS certificate and private key                       | preflight                      | absent; `openssl` not installed either |
| `infrastructure/docker/.env`                          | preflight                      | absent                                 |
| DNS pointing at the production host                   | `--dns`                        | unverifiable from here                 |
| Production Redis and object-storage secrets           | preflight                      | absent                                 |
| Real OTP provider credentials                         | preflight                      | running on `OTP_PROVIDER=mock`         |
| Image-scanner and protected-hash providers            | child-safety readiness         | not configured                         |
| Android upload keystore + four `LOCZ_UPLOAD_*` values | mobile release build           | absent; debug key correctly refused    |
| macOS host and Apple credentials                      | iOS build                      | unavailable                            |

## An unverified path worth knowing about

**The backup and restore drill has never been executed.** `scripts/restore-drill.sh` needs
`pg_dump` and `pg_restore`, and neither is installed here — the PostgreSQL client tools are
absent from this machine entirely.

This is deliberately _not_ worked around. The acceptance suites were moved off the `psql`
binary onto the `pg` driver because they only needed to run queries, and depending on an
external binary made them fail for reasons unrelated to the product. A restore drill is the
opposite case: its entire purpose is to prove that the real backup tooling produces a dump
that the real restore tooling can read. Reimplementing it in Node would produce a passing
check that tests nothing anybody would use in an emergency.

Run it on a host that has the PostgreSQL client tools, before launch. Until then, the
disaster-recovery path is untested rather than broken — but it is untested.

## Verification currently green

- 276 API unit tests
- HTTP acceptance: buyer and seller journey, filter and ordering semantics (67), public web,
  admin console, background jobs (25), security probes (99), plans and latency (17)
- Browser: interaction and accessibility (104), localized journey (10), search journey (6)
- Flutter analysis and tests
- Translation coverage across English, Hindi and Telugu; zero hardcoded user-visible copy
- Production dependency audit: zero vulnerabilities
- Schema and migrations: 13 applied, no table or column drift. `prisma migrate diff` reports
  only index differences, which are the PostGIS and GiST indexes created in raw SQL under
  ADR-0009 and deliberately not expressible in `schema.prisma`.

## Two things that will bite the next person

**The gate needs a quiet repository.** `immutable candidate` and `candidate stability` fail
whenever a commit lands or a file changes while it runs, which is correct behaviour and not a
defect — evidence gathered from a moving tree is not evidence. Producing this run required a
window with no concurrent commits.

**Sign-ins share one bucket.** Every suite and browser gate authenticates against the same
per-IP OTP limit. The gate waits four minutes between the browser stages and the HTTP suites
to let it drain (`LOCZ_GATE_COOLDOWN_SECONDS`). The temptation is to raise
`OTP_MAX_REQUESTS_PER_PHONE_PER_WINDOW` instead; that makes the security suite pass by
weakening the control it exists to prove.
