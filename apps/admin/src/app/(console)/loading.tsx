export default function ConsoleLoading() {
  return (
    <div className="console-loading" role="status" aria-label="Loading console page">
      <div className="console-loading__heading" />
      <div className="console-loading__summary">
        {Array.from({ length: 4 }, (_, index) => (
          <span key={index} />
        ))}
      </div>
      <div className="console-loading__panel">
        <i />
        <i />
        <i />
        <i />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
