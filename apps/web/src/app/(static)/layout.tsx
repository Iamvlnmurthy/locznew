/**
 * Shared shell for the static information pages. These are the pages a cautious user
 * checks before trusting a marketplace with their phone number, so they get real content
 * rather than lorem ipsum — and they are indexable, unlike the app pages.
 */
export default function StaticLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container">
      <article
        style={{
          maxWidth: 720,
          margin: '0 auto',
          padding: 'var(--locz-space-8) 0 var(--locz-space-12)',
        }}
      >
        {children}
      </article>
    </div>
  );
}
