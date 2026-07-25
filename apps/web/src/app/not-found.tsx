import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="container not-found">
      <img src="/illustrations/empty-neighbourhood.webp" alt="" width="420" height="340" />
      <span className="section-kicker">Lost locally?</span>
      <h1>We couldn’t find that place.</h1>
      <p>The listing may have moved, expired, or found a new home.</p>
      <Link href="/" className="btn btn--primary">
        Back to LocZ
      </Link>
    </div>
  );
}
