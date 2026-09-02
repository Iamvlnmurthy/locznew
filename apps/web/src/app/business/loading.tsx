/**
 * Route-level skeleton for the business directory ONLY.
 *
 * The global `loading.tsx` was deliberately demoted to a plain component (see route-skeleton.tsx)
 * because a Suspense boundary flushes HTML and locks the 200 status, turning every unknown
 * `[slug]` into a soft 404. This route is different: `/business` is a static directory that never
 * calls `notFound()`, and it is the one page the audit measured at ~5–6s. A scoped skeleton here
 * gives immediate directory-shaped feedback (chips + filters aside + card grid) without risking
 * status codes on the millions of dynamic pages.
 */
export { default } from '@/components/route-skeleton';
