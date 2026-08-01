# Child-safety operations

This is a controlled operating template, not legal advice. Do not place credentials,
evidence, provider hashes, case references or personal contact details in this repository.

## What the law actually requires

Two obligations apply to LocZ today, and they are smaller than the rest of this document
might suggest:

1. **A named Grievance Officer**, whose name and contact are published on the site, under the
   IT Rules 2021. For a founder-run platform the founder is a normal and sufficient choice.
   Naming someone is not a commitment to hire anyone.
2. **Preserve and report** child sexual abuse material if it is ever found, under the POCSO
   Act. Preserve means do not delete it — the legal-hold machinery in this codebase exists
   for exactly that.

Everything below is how LocZ meets those two obligations without anybody having to view
material they should not view. It is deliberately more careful than the minimum, because the
cost of getting this wrong is not a fine.

## Approval record

One accountable person signs this off. That person may be the founder while LocZ is small;
the point of recording it is that somebody is answerable, not that a committee met.

Store the signed record outside this repository and copy only its non-secret metadata into
the deployment environment:

| Field               | Required decision                                                  |
| ------------------- | ------------------------------------------------------------------ |
| Policy version      | Immutable identifier used by `CHILD_SAFETY_RUNBOOK_VERSION`        |
| Approved by         | The accountable person's organisational identifier                 |
| Approved at         | ISO-8601 timestamp used by `CHILD_SAFETY_RUNBOOK_APPROVED_AT`      |
| Review at           | Future ISO-8601 timestamp used by `CHILD_SAFETY_RUNBOOK_REVIEW_AT` |
| Primary officer     | The account that handles cases. May be the same person while small |
| Backup officer      | Somebody who can act during leave. Leave blank and say so if there |
|                     | is nobody yet — an empty field is honest, an invented name is not  |
| Reporting route     | Where a confirmed case is reported                                 |
| Retention authority | Who can set, extend, release or delete a legal hold                |
| Incident escalation | Who is contacted when a case is opened                             |

`CHILD_SAFETY_RUNBOOK_APPROVED_BY` records an organisational identifier, not a personal
email address or credential.

**When counsel becomes necessary.** Engage a lawyer before the first confirmed case is
reported, and before LocZ crosses the threshold for a significant social media intermediary.
Until then, a named accountable person and a working reporting route are what is required —
waiting for counsel to launch would leave the platform running with nobody accountable at
all, which is the worse position.

## Case handling

1. Do not download, forward, duplicate or place suspected evidence in tickets, chat,
   ordinary logs or email.
2. Start with the metadata-only case view. Evidence remains on legal hold in private
   object storage.
3. View evidence only when the approved procedure requires it. Record a case-specific
   justification before requesting the short-lived preview.
4. Use the reporting route recorded above and record only its opaque acknowledgement in
   LocZ. Never paste report contents into the case note.
5. Mark the case reported, then close active handling only after the approved follow-up is
   complete. Closing does not remove the legal hold.
6. Release a hold only through the false-positive procedure. Release returns media to
   ordinary human review; it never publishes the image.

The National Cyber Crime Reporting Portal provides a dedicated women/child reporting path:
<https://cybercrime.gov.in/>. Counsel must confirm whether that route, another authority,
or multiple reports apply to LocZ's circumstances. Provider reporting does not replace
LocZ's own obligations unless the accountable person records that conclusion, taking legal advice where the case warrants it.

## Provider and platform outages

- Timeout, throttling, authentication failure, malformed response and provider outage are
  `UNAVAILABLE`, never `NO_MATCH`.
- Affected uploads remain private and must not generate public renditions.
- The incident lead records the outage without image identifiers or provider payloads.
- Recovery uses the provider's benign fixtures before traffic resumes.
- Quota exhaustion and credential expiry require the same fail-closed response as an
  outage.

## Evidence retention and deletion

This repository deliberately defines no retention duration. Counsel must approve the
authority, duration, jurisdiction, extension conditions, release criteria and deletion
process before any automated purge is implemented. Until then, `CLOSED` evidence remains
on `LEGAL_HOLD`.

Any future deletion workflow must require separate authorization, preserve a tamper-evident
audit record, refuse active or reported cases, and prove that object storage, derivatives,
backups and search references follow the approved disposition.

## Access and audit review

- Review active role holders after every staffing change and at each policy review.
- Remove access immediately when an officer changes duties.
- Investigate every evidence preview without a case-specific justification.
- Verify the super-administrator wildcard still cannot grant `safety:*`.
- Keep ordinary moderators, support staff and platform operators outside the restricted
  role.

## Rehearsal

Use only provider-supplied benign integration hits or LocZ's explicitly synthetic local
fixture. Never source or create illegal test material.

```bash
npm run verify:safety-readiness -- --env infrastructure/docker/.env
ALLOW_SYNTHETIC_SAFETY_VERIFICATION=1 npm run verify:safety
```

Attach the secret-free outputs to the release record. Production is no-go if readiness
reports any failure; warnings require a named owner and written launch decision.
