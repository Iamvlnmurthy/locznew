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

The scanner itself is behind `ImageScanProvider`. The production classifier adapter uses
AWS Rekognition `DetectModerationLabels`; select it with
`IMAGE_SCANNER_PROVIDER=rekognition`. It sends private bytes directly rather than exposing
the R2 quarantine bucket, and normalizes WebP/HEIC to JPEG because Rekognition accepts JPEG
and PNG.

The policy mapping is intentionally narrow: high-confidence `Explicit` is rejected;
violence, weapons, drugs, self-harm, hate symbols, ambiguous explicit results, and unknown
future categories remain private for contextual review. Thresholds are environment
settings and must satisfy `min <= review <= reject`.

Without Rekognition configuration, the built-in quarantine provider gives every
otherwise-valid upload `IMAGE_SCANNER_NOT_CONFIGURED` and holds it for a person. Provider
calls have a bounded timeout and retry count; exhausted errors become
`IMAGE_SCANNER_UNAVAILABLE`, not approval and not a deleted upload. Account age or seller
reputation cannot override either result.

### What does not happen, and must before launch

**Nothing here can see what a photograph shows.** There is no classifier. A picture of
ivory, a weapon, drugs or a person is, to this system, sixty-four bits describing the shape
of the light in it.

Adding a plausible-looking classifier would be worse than having none. A moderation control
that is believed and does not work is how illegal material stays up while everyone assumes
it is being handled.

Two things must be procured before launch:

**1. Content-classification production enablement.** The AWS Rekognition adapter and its
tests are present, but the production AWS account, restricted `rekognition:DetectModerationLabels`
permission, region, billing, and representative threshold calibration must be completed.
Rekognition is a classifier, not proof that an image is legal, and its model version must
be monitored for taxonomy changes.

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
named, trained officers through the approved access procedure; the super-administrator
wildcard remains the emergency bootstrap path.

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
