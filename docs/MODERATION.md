# Moderation

What LocZ refuses, what it holds for a person, and — the part that matters most — what it
cannot see at all.

---

## Text

`apps/api/prisma/banned-keywords.ts` holds **197 terms across 27 categories**, each naming
the statute or policy it rests on. 131 refuse a listing outright; 66 hold it for a human.

The split is the design. Severity 2 is reserved for things with no innocent reading —
ivory, `katta`, `mtp kit`, a betting id. Anything a lawful trader might advertise sits at
severity 1: a chemist selling prescription medicines, an air rifle, an antique coin, a spy
camera. A wrong rejection is invisible to us and final to the seller, who is told their
advert broke the rules and cannot see how.

Matching is on word boundaries. It used to be `String.includes`, which auto-rejected
"Unisex salon chair for sale".

Three structural rules catch what a word list cannot: a job advert asking the candidate for
money, personal requirements in a job advert, tenant filtering in a rental.

The reasoning behind the hardest calls — why discrimination is held rather than refused,
why beef and bhang are deliberately absent — is in [ADR-0013](../DECISIONS.md).

---

## Images

### What happens today

Every uploaded image is fingerprinted twice during processing:

| Fingerprint              | Answers                     | Survives                                             |
| ------------------------ | --------------------------- | ---------------------------------------------------- |
| SHA-256                  | "Is this the same file?"    | nothing — any re-save defeats it                     |
| Difference hash (64-bit) | "Is this the same picture?" | re-compression, resizing, format change, small crops |

That gives three controls:

**A refusal sticks.** When a moderator blocks an image
(`POST /moderation/media/:id/block`), both hashes are recorded. Re-uploading the same
photograph is refused during processing, before it is stored or served — and so is a
re-crop, a re-save or a screenshot of it. Without this, removing a listing does nothing:
the same picture is back a minute later under a new title.

**A stolen photograph is flagged.** The same image appearing under a different account
returns the listing to review. It is not proof of anything — a shop and its employee
legitimately share pictures — but it is the strongest single signal that a listing is for
something the seller has not got.

**Pictures are judged after the words were.** Moderation runs when a listing is submitted,
and images are uploaded afterwards, so publication was decided before anyone could see
them. Any image from an account with fewer than three published listings pulls the listing
back into the queue and out of the search index.

### The quarantine boundary

Original uploads now live only under the private `quarantine/` storage prefix. A review
decision produces private, sanitized renditions with status `REVIEW_REQUIRED`; public
listing reads return only `READY` media and never turn a quarantine key into a CDN URL.

When a moderator approves the listing, its reviewed renditions are copied to the public
prefix before the listing is published or indexed. A failed copy leaves the image in
review, so an object-store outage cannot accidentally publish it. Moderators inspect a
review image through a short-lived signed preview URL rather than a permanent public link.

Known blocked images are marked `REJECTED`, their private original is deleted, and the
uploader receives a neutral policy message. Internal categories and moderator notes are
not disclosed because they would reveal how a match was made.

The scanner itself is behind `ImageScanProvider`. The default is `nsfwjs`: the model ships
inside the `nsfwjs` package and runs in the API process on the pure-JavaScript CPU backend,
costing roughly a second per upload. It is self-hosted on purpose. Four million records and
a continuous upload stream make per-image pricing a standing bill, and — the reason that
decided it — every network hop is another dependency that can be unreachable. An
unreachable scanner is exactly what put 100% of production media behind a grey placeholder
for weeks with no error and no alert.

The mapping is narrow. `Porn` and `Hentai` are summed, because the model routinely splits
one explicit picture across both, and `NSFWJS_EXPLICIT_REVIEW_SCORE` sends the result to a
moderator. `Sexy` is tested alone against a much higher bar, because it fires on swimwear,
on a saree and on any close portrait — all ordinary things to be selling.

**The provider never rejects.** A probability about pixels is not enough to destroy an
honest seller's photograph with an accusation attached and no way to argue, so everything
the model objects to goes to a person. That is only a real option because
`POST /moderation/media/:id/approve` exists to release it again.

`IMAGE_SCANNER_PROVIDER=rekognition` selects the AWS `DetectModerationLabels` adapter
instead. It sends private bytes directly rather than exposing the R2 quarantine bucket,
normalizes WebP/HEIC to JPEG, rejects high-confidence `Explicit`, and holds violence,
weapons, drugs, self-harm, hate symbols and unknown future categories for review. Its
thresholds must satisfy `min <= review <= reject`. `IMAGE_SCANNER_PROVIDER=quarantine`
gives every otherwise-valid upload `IMAGE_SCANNER_NOT_CONFIGURED` and holds it for a
person; it is a local fallback and production preflight refuses it.

### Failing open when the scanner is unavailable

Provider calls have a bounded timeout and retry count. When every attempt fails,
`ImageScanService` returns `UNAVAILABLE` — a third answer, distinct from `REVIEW`, that a
provider is not permitted to return — logged at error level every single time.

`UNAVAILABLE` does not hold the image by itself:

|                         | clean   | flagged | scanner unavailable    |
| ----------------------- | ------- | ------- | ---------------------- |
| **established account** | publish | queue   | publish, logged loudly |
| **new account**         | queue   | queue   | queue                  |

Collapsing "we could not ask" into "a moderator should look at this" is the defect this
table exists to prevent. Because a held image still lets its listing publish, the failure
was invisible: the upload succeeded, the listing went live, and the only symptom was a grey
placeholder. A safety control that becomes a total outage the moment it cannot reach its
dependency is worse than no control, because nobody notices.

The same treatment covers a protected-hash provider that cannot be reached. That is the
heavier of the two calls, and it is made deliberately: with `PROTECTED_HASH_PROVIDER=unconfigured`
every upload carries a provider-unavailable reason, so treating it as an objection is by
itself enough to trap all media forever, which is what it did.

### Account age is what the classifier cannot see

A clean NSFW score is silent on stolen goods, a forged certificate, someone else's
shopfront, or a child in a photograph. Publishing on the classifier's word alone would be
trusting it with questions it was never asked. So a clean image publishes only for an
established account; a new account's images go to a person regardless of score. This is how
the listing _text_ rules have always worked — `NEW_ACCOUNT` is a scoring factor in
`RuleBasedModerationProvider` — and images now match.

### What does not happen, and must before launch

**The classifier only sees nudity.** nsfwjs answers one question, and the answer is a
probability. Ivory, a weapon, drugs, a forged certificate, a stolen shopfront photograph or
a child in the frame are all, to it, a clean image. Account age is what covers that gap, and
it covers it crudely: a person still has to look.

A moderation control that is believed and does not do what people think it does is how
illegal material stays up while everyone assumes it is being handled. Two things remain:

**1. Threshold calibration on real listing photographs.** The defaults were chosen from the
model's behaviour on ordinary product images, not measured against LocZ's own corpus. The
`Sexy` class in particular needs a false-positive rate measured on real Indian retail
photographs — sarees, swimwear, close portraits — before anyone trusts its number. Enabling
`IMAGE_SCANNER_PROVIDER=rekognition` instead remains an option and needs the production AWS
account, restricted `rekognition:DetectModerationLabels` permission, region and billing.

**2. Child sexual abuse material detection.** This is not the same problem and cannot be
solved by the same tools. It requires hash matching against a maintained corpus —
Microsoft **PhotoDNA**, or **Thorn Safer** — both access-controlled, and rightly so. A
perceptual hash of our own is no substitute: it only recognises what a moderator has
already seen, which is exactly the wrong model for material no moderator should ever have
to see.

The protected-hash boundary and post-match controls are implemented without inventing a
vendor response:

- `ProtectedHashProvider` returns only `NO_MATCH`, `MATCH`, or `UNAVAILABLE`, plus an
  opaque provider case reference.
- `unconfigured` and exhausted provider calls return `UNAVAILABLE`; production preflight
  refuses to launch with that provider.
- A confirmed match becomes `LEGAL_HOLD` before any rendition is generated. Its listing is
  removed from search and cannot be approved while the hold exists.
- Ordinary `listing:moderate` preview rejects held media. Restricted case metadata requires
  `safety:case:read`; evidence requires the separate `safety:evidence:read` permission.
- Case detail is metadata-first: it returns provider acknowledgements, state timestamps, and
  the most recent 100 access events in chronological order, but never a storage key, image
  hash, signed URL, or image bytes. Each detail view is itself added to the restricted
  access log.
- An evidence justification is written to `media_safety_access_logs` before a short-lived
  signed original URL is issued.
- Reporting, false-positive release, and case closure require the independent
  `safety:case:report`, `safety:case:release`, and `safety:case:close` permissions. Every
  transition records the actor and justification in the restricted access log.
- State changes are conditional inside a database transaction, so a stale or duplicate
  action cannot overwrite a newer decision or manufacture a misleading audit event.
- `OPEN -> REPORTED` stores only the approved channel's opaque acknowledgement.
  `OPEN|REPORTED -> RELEASED` is the false-positive path and returns the image to
  `REVIEW_REQUIRED`; it never publishes it. `REPORTED -> CLOSED` ends active handling but
  deliberately leaves the original on `LEGAL_HOLD`.
- No raw provider hash, image bytes, or signed URL is written to application logs or the
  safety-case table.

None of the restricted read, evidence, or transition permissions is assigned to moderator
or administrator roles. `CHILD_SAFETY_OFFICER` is provisioned with exactly those five
permissions and no ordinary moderation or platform-administration powers. Assign it only to
named, trained officers through the approved access procedure. The super-administrator
wildcard explicitly does not confer any `safety:*` permission; an administrator who must
assist needs the same deliberate role grant and audit boundary as every other officer.

Closing a case is not evidence deletion. This implementation intentionally has no timed
purge for legal-hold objects: the reporting authority, retention period, release criteria,
and deletion authorization must be approved by counsel and encoded as a separate policy
before an automated retention job can exist.

Procuring it is not optional for a platform carrying user images in India:

- **IT Act 2000, s67B** — publishing or transmitting material depicting children in
  sexually explicit acts is an offence, and an intermediary that fails to act loses safe
  harbour.
- **IT Rules 2021, Rule 3(1)(b) and 4(4)** — an intermediary must inform users what they
  may not host and act on unlawful content; significant social media intermediaries must
  deploy automated tools for CSAM specifically.
- **POCSO Act 2012, ss19–20** — reporting is **mandatory**, and failure to report is itself
  an offence. Someone must be named as responsible for making that report, and the process
  must exist before the first one is needed, not after.

### The remaining provider gap

The quarantine-first boundary is now implemented: originals stay private, scanning fails
closed, and public renditions are generated only after approval. What remains is operational,
not architectural: production must use a vetted PhotoDNA or Thorn Safer account instead of
the deliberately unavailable placeholder provider, and named officers need an approved
reporting and retention procedure. Production preflight refuses the placeholder so this gap
cannot silently become a launch configuration.

The live API and database workflow can be regression-checked locally without illegal material
or a fabricated provider response:

```bash
ALLOW_SYNTHETIC_SAFETY_VERIFICATION=1 npm run verify:safety
```

The command refuses production and non-local databases, labels its harmless seed case
`SYNTHETIC_VERIFICATION`, and restores every touched row even when a check fails.

### Protected-hash provider onboarding gate

Do not add a provider name to `PROTECTED_HASH_PROVIDER` until all of these are true:

1. The organization has completed the provider's vetting and accepted its purpose and
   audit terms.
2. Engineering has the subscriber-only API schema and maps it into only `NO_MATCH`,
   `MATCH`, or `UNAVAILABLE`. Raw provider hashes and vendor payloads must not cross the
   adapter boundary.
3. A confirmed match includes a bounded provider name, reason code, and opaque reference.
   A malformed response, timeout, throttle, or authentication error must become
   `UNAVAILABLE`, never `NO_MATCH`.
4. The provider's benign integration environment proves no-match, simulated match,
   malformed-response, timeout, and throttling behavior without possessing illegal
   material.
5. Security verifies secret storage, rotation, least privilege, log redaction, quotas,
   regional data flow, retention, and incident contacts.
6. Legal and the named child-safety officer approve the reporting and evidence-retention
   procedure for every launch jurisdiction.

Microsoft states that PhotoDNA access and detailed API material follow vetting, provides a
benign integration environment for simulated hits, and does not retain submitted images.
See the official [PhotoDNA documentation](https://www.microsoft.com/en-us/PhotoDNA/Documentation)
and [FAQ](https://www.microsoft.com/en-us/PhotoDNA/FAQ). Thorn describes Safer Match as an
API-based known-material hashing and matching service; its vendor-specific contract must
likewise come from the approved customer documentation, not assumptions in this repository.

---

## For a moderator

```
GET  /moderation/queue                     listings waiting, with the reasons that flagged them
POST /moderation/listings/:id/approve      publish
POST /moderation/listings/:id/reject       refuse, with a reason the seller sees
POST /moderation/listings/:id/remove       take down something already published
POST /moderation/media/:id/block           refuse this picture from now on
POST /moderation/users/:id/suspend         stop the person, optionally for a set number of days
POST /moderation/users/:id/reinstate       lift a suspension early
```

Blocking an image and removing its listing are separate actions on purpose. Removing the
listing addresses this advert; blocking the image addresses the next one.

---

## Maintaining the word list

The corpus is seeded, not hard-coded, so a moderator can add a term during an incident
without waiting for a deployment:

```sql
INSERT INTO banned_keywords (id, keyword, severity, category, basis)
VALUES (gen_random_uuid(), 'new scam phrase', 1, 'SCAM_PATTERN', 'Observed 2026-08, ticket 431');
```

Severity 1 unless the phrase has no innocent reading. Re-running `db:seed` will not remove
what you added; it upserts its own terms and leaves everything else alone.

**The corpus needs a lawyer's review before launch.** It is a careful developer's reading
of Indian law, written to be specific and defensible rather than authoritative, and every
category it touches is a live area of law.
