# Observability

LocZ emits one searchable identifier and one structured event vocabulary across the
stack. Monitoring must help reconstruct a failure without collecting the content a
person typed, searched for, or sent.

## Signals

| Surface       | Signal                                                      | Destination                                |
| ------------- | ----------------------------------------------------------- | ------------------------------------------ |
| API           | `http_request` with route, status, duration, correlation ID | structured runtime logs                    |
| API           | unexpected exceptions                                       | configured Sentry-compatible DSN           |
| Public web    | page views and Core Web Vitals                              | Vercel Web Analytics and Speed Insights    |
| Web and admin | `next_server_error`                                         | Vercel runtime logs                        |
| Web and admin | `next_client_error`                                         | same-origin ingestion route → runtime logs |
| Mobile        | uncaught Flutter, platform and zone errors                  | optional Sentry-compatible DSN             |

API requests and responses use `X-Correlation-Id`. A support report should begin with
that value or the error page's digest, then be filtered in runtime logs.

## Privacy boundary

Telemetry excludes request bodies, query strings, authorization headers, cookies,
search terms, chat content, listing descriptions, phone numbers, and email addresses.
Mobile error messages additionally redact contact details, credentials, OTP-like
fields, and URL queries before transmission. The API may attach an internal user UUID;
it never attaches a phone number, name, or email.

## Production configuration

- API: set `SENTRY_DSN`, `SENTRY_ENVIRONMENT=production`, and an intentional
  `SENTRY_TRACES_SAMPLE_RATE`.
- Mobile: set `MOBILE_SENTRY_DSN` and `APP_ENV=production` in the gitignored
  `firebase.json` build-definition file. This is a public ingestion DSN, never a
  Sentry auth token.
- Vercel: enable Web Analytics for the public web project and Speed Insights for both
  the web and admin projects. The packages are already mounted in their root layouts.
- Configure a Vercel log drain on Pro/Enterprise, or retain a documented dashboard/CLI
  review rotation on plans without drains.

## Release checks

After deployment:

1. Visit representative public and admin routes and confirm Speed Insights requests.
2. Confirm the public project emits a Web Analytics view request.
3. Filter runtime logs for `next_server_error`, `next_client_error`, and API
   `http_request` events with status `>= 500`.
4. Trigger a controlled non-production error and confirm its correlation ID or digest
   reaches the configured destination.
5. Alert on sustained API 5xx rate, readiness failure, queue backlog, and notification
   delivery failures. Do not alert on ordinary 4xx validation traffic.

Production credentials are intentionally absent from the repository; preflight reports
missing API error reporting as a warning rather than inventing a destination.
