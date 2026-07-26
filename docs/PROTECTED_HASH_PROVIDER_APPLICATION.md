# Protected-hash provider application packet

Use this packet when applying for Microsoft PhotoDNA Cloud Service or Thorn Safer. It
contains verified technical facts about LocZ and explicit placeholders for information
that must come from the legal entity, counsel and trust-and-safety owner. Do not add API
keys, provider hashes, evidence, case references or personal contact details to this file.

## Applicant information to complete

| Field                                 | Owner-supplied value                                 |
| ------------------------------------- | ---------------------------------------------------- |
| Legal entity name                     | `[REQUIRED]`                                         |
| Registered address and jurisdiction   | `[REQUIRED]`                                         |
| Public website and privacy-policy URL | `[REQUIRED]`                                         |
| Authorized applicant                  | `[REQUIRED — submit through provider portal]`        |
| Trust-and-safety lead                 | `[REQUIRED — store in restricted compliance system]` |
| Legal/compliance contact              | `[REQUIRED — store in restricted compliance system]` |
| Launch countries                      | India initially; counsel must confirm the final list |
| Expected monthly image volume         | `[REQUIRED — measure from launch forecast]`          |
| Peak requests per second              | `[REQUIRED — measure from load forecast]`            |
| Requested environments                | Benign integration/sandbox, staging and production   |
| Reporting authorities/routes          | `[REQUIRED — counsel-approved by jurisdiction]`      |

## Product description

LocZ is a location-first marketplace and local-discovery platform. Users can publish
classifieds, products, services, jobs, rentals, events, offers and business profiles with
images. Images are user-generated content and must pass private pre-publication processing
before a public rendition can exist.

The platform needs known-material protected-hash matching. General image classification
and LocZ's own duplicate-image fingerprints are separate controls and are not represented
as substitutes for PhotoDNA or Safer.

## Implemented technical controls

- Originals upload to private S3-compatible quarantine storage.
- The API validates file signatures, MIME type, parseable image structure and size before
  scanning.
- Accepted local formats are JPEG, PNG, WebP and HEIC, with a 10 MiB default limit.
- Protected-hash matching runs before public renditions are generated.
- Provider timeout, throttling, transport error, authentication error or malformed output
  becomes `UNAVAILABLE`; it never becomes `NO_MATCH`.
- Provider output is reduced to `NO_MATCH`, `MATCH` or `UNAVAILABLE`, a bounded provider
  name, a bounded reason code and an opaque provider reference. Raw hashes and vendor
  payloads cannot cross the adapter boundary.
- A confirmed match places the private original on `LEGAL_HOLD`, escalates the listing and
  queues removal of a previously public listing from search.
- Ordinary moderators and the super-administrator wildcard cannot access restricted cases.
- Only explicitly assigned child-safety officers can read case metadata or request
  evidence previews.
- Case detail never returns storage keys, hashes, image bytes or signed URLs.
- Evidence access requires a written justification and creates an audit record before a
  short-lived URL is signed.
- Report, false-positive release and closure are separate race-safe state transitions.
- Production preflight rejects the placeholder provider and provider names not compiled
  into the candidate.

## Data-flow summary

```text
Browser
  → private upload URL
  → quarantine object storage
  → signature/size validation
  → protected-hash adapter
      NO_MATCH     → image classifier → review/approval → sanitized public renditions
      MATCH        → legal hold → restricted case → approved reporting procedure
      UNAVAILABLE  → private human-review state; no public rendition
```

The adapter will send only the content and metadata required by the approved provider
contract. The final request shape, region, authentication mechanism and data-retention
representation will be implemented only from subscriber documentation.

## Questions requiring provider confirmation

1. What eligibility, vetting and re-verification steps apply to an Indian UGC platform?
2. Is there a benign integration environment that produces deterministic simulated hits?
3. Which image formats, dimensions and maximum payload sizes are accepted?
4. Does the service accept bytes, URLs, locally generated hashes, or a provider SDK?
5. Which regions process data, and what is retained in each environment?
6. What authentication, key rotation, IP restriction and least-privilege options exist?
7. What are the rate limits, concurrency limits, timeout guidance and retry semantics?
8. Is there an idempotency key or request identifier suitable for safe retries?
9. Which response fields distinguish no-match, confirmed match, retryable failure and
   permanent request failure?
10. Which opaque reference may LocZ retain for reporting and provider support?
11. How are false positives, appeals, corpus updates and provider incidents handled?
12. What reporting integrations exist, and which obligations remain with LocZ in India?
13. What audit, usage-monitoring and incident-notification terms apply?
14. What production readiness or certification evidence must LocZ submit?

## Benign integration acceptance

The adapter is not production-eligible until provider-supplied benign fixtures prove:

- deterministic no-match and simulated-match behavior;
- no public rendition before a match decision;
- malformed and unknown responses fail closed;
- timeout, throttling, authentication failure and outage fail closed;
- bounded retries do not create duplicate cases;
- opaque references survive report and support workflows;
- provider payloads, credentials and content never enter normal application logs;
- quota and latency alerts fire before service exhaustion;
- both named officers can process the case independently;
- the provider's reporting handoff matches the counsel-approved operating procedure.

Attach secret-free test output to the release record. Never check provider fixtures into
the public application repository unless the provider explicitly authorizes it.

## Draft application narrative

> LocZ is an India-focused local marketplace and discovery platform that hosts
> user-generated listing and business images. We are implementing proactive
> pre-publication matching for known child sexual abuse material. Originals remain in
> private quarantine until automated and human safety controls permit sanitized public
> renditions. Confirmed matches enter a restricted legal-hold workflow available only to
> explicitly assigned child-safety officers; evidence access and every lifecycle action
> are audited. Provider outages and malformed responses fail closed. We seek vetted
> access, subscriber API documentation and benign integration fixtures so we can complete
> and validate the vendor adapter without possessing illegal test material.

The authorized applicant must review and adapt this narrative before submission.

## Official provider material

- [Microsoft PhotoDNA Cloud Service](https://www.microsoft.com/en-us/photodna/CloudService)
- [Microsoft PhotoDNA documentation](https://www.microsoft.com/en-us/PhotoDNA/Documentation)
- [Microsoft PhotoDNA FAQ](https://www.microsoft.com/en-us/PhotoDNA/FAQ)
- [Thorn Safer Match announcement](https://www.thorn.org/blog/safer-match/)

Microsoft states that detailed API access follows onboarding and that its integration
environment uses benign images to simulate a hit. Thorn describes Safer Match as an
API-based known-material hashing and matching service. Vendor-specific implementation
must follow the approved subscriber contract rather than this public summary.
