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

### What does not happen, and must before launch

**Nothing here can see what a photograph shows.** There is no classifier. A picture of
ivory, a weapon, drugs or a person is, to this system, sixty-four bits describing the shape
of the light in it.

Adding a plausible-looking classifier would be worse than having none. A moderation control
that is believed and does not work is how illegal material stays up while everyone assumes
it is being handled.

Two things must be procured before launch:

**1. Content classification.** Google Cloud Vision SafeSearch, AWS Rekognition Moderation,
or Hive. Any of them classifies adult content, violence, weapons and drugs with a
confidence score. The binding point is `ImageModerationService`, which is written to take
one — the same shape as the text provider in [ADR-0008](../DECISIONS.md), so it plugs in
without touching the pipeline.

**2. Child sexual abuse material detection.** This is not the same problem and cannot be
solved by the same tools. It requires hash matching against a maintained corpus —
Microsoft **PhotoDNA**, or **Thorn Safer** — both access-controlled, and rightly so. A
perceptual hash of our own is no substitute: it only recognises what a moderator has
already seen, which is exactly the wrong model for material no moderator should ever have
to see.

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

### The gap this does not close

**Renditions are made public before anything has looked at the image.** Processing writes
`public/listings/...` objects and only then does anything assess the upload, so a new
picture is fetchable at a stable URL from the moment it is processed. Pulling the listing
back into review — which this does — takes it off the shelf and out of the index, and
leaves the object exactly where it was. Anyone holding the URL keeps it.

For a re-upload of something already blocked, that is fine: it never reaches the rendition
step. For a picture nobody has ever seen, it is not fine at all, and no amount of
fingerprinting changes it. The fix is a quarantine-first upload state — private storage
until a scan and, where needed, a human says otherwise, failing closed when the scanner is
unavailable rather than publishing on the assumption it would have passed.

Until then, the honest description of image safety on LocZ is: a moderator's decision
holds, repeats are refused, stolen and first-time-account photographs are flagged, and a
first upload of new illegal material is publicly reachable until a person removes it.

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
