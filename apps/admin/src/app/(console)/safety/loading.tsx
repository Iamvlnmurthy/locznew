export default function SafetyLoading() {
  return (
    <div className="safety-workspace" aria-busy="true" aria-label="Loading safety cases">
      <div className="safety-skeleton safety-skeleton--hero" />
      <div className="safety-skeleton safety-skeleton--note" />
      <div className="safety-skeleton safety-skeleton--row" />
      <div className="safety-skeleton safety-skeleton--row" />
      <div className="safety-skeleton safety-skeleton--row" />
    </div>
  );
}
