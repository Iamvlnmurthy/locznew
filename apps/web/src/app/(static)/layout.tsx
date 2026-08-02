/**
 * Shared shell for the static information pages. These are the pages a cautious user
 * checks before trusting a marketplace with their phone number, so they get real content
 * rather than lorem ipsum — and they are indexable, unlike the app pages.
 */
export default function StaticLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="info-experience">
      <div className="container info-experience__layout">
        <article className="info-card">{children}</article>
      </div>
    </main>
  );
}
