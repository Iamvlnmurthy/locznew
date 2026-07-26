# Child-safety operations

This is a controlled operating template, not legal advice. Counsel and the named
child-safety officers must complete and approve it for every launch jurisdiction. Do not
place credentials, evidence, provider hashes, case references or personal contact details
in this repository.

## Approval record

Store the signed record in the restricted compliance system and copy only its non-secret
metadata into the deployment environment:

| Field               | Required decision                                                  |
| ------------------- | ------------------------------------------------------------------ |
| Policy version      | Immutable identifier used by `CHILD_SAFETY_RUNBOOK_VERSION`        |
| Approved by         | Counsel or accountable compliance owner                            |
| Approved at         | ISO-8601 timestamp used by `CHILD_SAFETY_RUNBOOK_APPROVED_AT`      |
| Review at           | Future ISO-8601 timestamp used by `CHILD_SAFETY_RUNBOOK_REVIEW_AT` |
| Primary officer     | Active, trained account holding only the explicit safety role      |
| Backup officer      | Independently trained account for leave and incident continuity    |
| Reporting route     | Authority/channel approved for the relevant jurisdiction           |
| Retention authority | Who can set, extend, release or delete a legal hold                |
| Incident escalation | Restricted contacts for legal, security and executive response     |

`CHILD_SAFETY_RUNBOOK_APPROVED_BY` records the accountable approver's organizational
identifier, not a personal email address or credential.

## Case handling

1. Do not download, forward, duplicate or place suspected evidence in tickets, chat,
   ordinary logs or email.
2. Start with the metadata-only case view. Evidence remains on legal hold in private
   object storage.
3. View evidence only when the approved procedure requires it. Record a case-specific
   justification before requesting the short-lived preview.
4. Use the counsel-approved reporting route and record only its opaque acknowledgement in
   LocZ. Never paste report contents into the case note.
5. Mark the case reported, then close active handling only after the approved follow-up is
   complete. Closing does not remove the legal hold.
6. Release a hold only through the false-positive procedure. Release returns media to
   ordinary human review; it never publishes the image.

The National Cyber Crime Reporting Portal provides a dedicated women/child reporting path:
<https://cybercrime.gov.in/>. Counsel must confirm whether that route, another authority,
or multiple reports apply to LocZ's circumstances. Provider reporting does not replace
LocZ's own obligations unless counsel records that conclusion.

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
