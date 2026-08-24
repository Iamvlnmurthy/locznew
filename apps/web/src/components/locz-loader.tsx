import Image from 'next/image';

export function LoczLoader({ label, compact = false }: { label: string; compact?: boolean }) {
  return (
    <div
      className={`locz-loader${compact ? ' locz-loader--compact' : ''}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span className="locz-loader__visual" aria-hidden="true">
        <span className="locz-loader__orbit locz-loader__orbit--outer" />
        <span className="locz-loader__orbit locz-loader__orbit--inner" />
        <span className="locz-loader__mark">
          <Image src="/brand/app-icon-premium-v2.svg" alt="" width={72} height={72} priority />
        </span>
        <span className="locz-loader__signal locz-loader__signal--one" />
        <span className="locz-loader__signal locz-loader__signal--two" />
        <span className="locz-loader__signal locz-loader__signal--three" />
      </span>
      <span className="locz-loader__copy">
        <strong>LocZ</strong>
        <span>{label}</span>
      </span>
    </div>
  );
}
