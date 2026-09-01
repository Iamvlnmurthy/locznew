import type { ReactNode, SVGProps } from 'react';

type TradeIconProps = SVGProps<SVGSVGElement> & { slug?: string };

function iconKey(slug = ''): string {
  if (/hospital|clinic|health|medical/.test(slug)) return 'health';
  if (/beauty|salon|spa|hair/.test(slug)) return 'beauty';
  if (/car-repair|auto-repair|automotive-service|garage/.test(slug)) return 'carRepair';
  if (/account|bookkeep|tax/.test(slug)) return 'accounting';
  if (/professional|consult|legal/.test(slug)) return 'professional';
  if (/property|real-estate/.test(slug)) return 'property';
  if (/interior|decor/.test(slug)) return 'interiors';
  if (/home-service|handyman|builder|contractor/.test(slug)) return 'homeService';
  if (/travel|tour|flight/.test(slug)) return 'travel';
  if (/electric|power/.test(slug)) return 'electrical';
  if (/plumb|water/.test(slug)) return 'plumbing';
  if (/appliance|refrigerator|washing-machine/.test(slug)) return 'appliance';
  if (/clean|housekeeping/.test(slug)) return 'cleaning';
  if (/pest|termite/.test(slug)) return 'pest';
  return 'general';
}

const softFill = { fill: 'currentColor', stroke: 'none', opacity: 0.12 } as const;

const icons: Record<string, ReactNode> = {
  health: (
    <>
      <rect x="7" y="4" width="18" height="24" rx="4" {...softFill} />
      <path d="M8.5 28V7.5A3.5 3.5 0 0 1 12 4h8a3.5 3.5 0 0 1 3.5 3.5V28" />
      <path d="M5 28h22M12 10h8M16 6v8M12 19h2M18 19h2M12 24h2M18 24h2" />
    </>
  ),
  beauty: (
    <>
      <circle cx="11" cy="10" r="5" {...softFill} />
      <circle cx="11" cy="22" r="5" {...softFill} />
      <circle cx="9" cy="9" r="4" />
      <circle cx="9" cy="23" r="4" />
      <path d="m12.5 12.5 13 13M12.5 19.5l13-13M23 5l2.5 1.5L24 9M23 23l2.5 2-2 2" />
    </>
  ),
  carRepair: (
    <>
      <path d="M5 19h22v7H5z" {...softFill} />
      <path d="m6 18 2.5-7h15l2.5 7v7H6zM3 17h3M26 17h3M10 24h.01M22 24h.01M10 11l2-4h8l2 4" />
      <path d="m23 8 4-4M24 3l5 5" />
    </>
  ),
  accounting: (
    <>
      <rect x="6" y="4" width="20" height="24" rx="4" {...softFill} />
      <rect x="6" y="3" width="20" height="26" rx="4" />
      <path d="M10 8h12v5H10zM10 18h2M16 18h2M22 18h.01M10 23h2M16 23h2M22 23h.01" />
    </>
  ),
  professional: (
    <>
      <rect x="4" y="10" width="24" height="17" rx="4" {...softFill} />
      <path d="M5 10h22a2 2 0 0 1 2 2v13a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V12a2 2 0 0 1 2-2ZM11 10V7h10v3M3 17h26M13 17v3h6v-3" />
    </>
  ),
  property: (
    <>
      <path d="m4 15 12-10 12 10v13H4z" {...softFill} />
      <path d="m3 15 13-11 13 11M6 13v15h20V13M11 28v-9h10v9" />
      <circle cx="24" cy="8" r="3" />
      <path d="m22 10-5 5" />
    </>
  ),
  interiors: (
    <>
      <path d="M7 17h18v10H7z" {...softFill} />
      <path d="M7 27v-9a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v9M5 21h22M9 27v2M23 27v2" />
      <path d="M22 5h6l-3 6h-3l-3-6h3v9" />
    </>
  ),
  homeService: (
    <>
      <path d="m4 15 12-10 12 10v13H4z" {...softFill} />
      <path d="m3 15 13-11 13 11M6 13v15h12M24 15v4" />
      <path d="M23 19a5 5 0 0 0 6 6l-6 6-4-4 6-6a5 5 0 0 0-2-2Z" />
    </>
  ),
  travel: (
    <>
      <rect x="6" y="12" width="20" height="16" rx="4" {...softFill} />
      <rect x="6" y="11" width="20" height="17" rx="4" />
      <path d="M12 11V7h8v4M10 15v9M22 15v9M3 8l10-4-3 6M29 4l-8 5 7 1" />
    </>
  ),
  electrical: (
    <>
      <circle cx="16" cy="16" r="12" {...softFill} />
      <path d="m17 3-8 14h7l-1 12 9-16h-7V3Z" />
      <path d="M5 8 3 6M27 8l2-2M4 24l-2 1M28 24l2 1" />
    </>
  ),
  plumbing: (
    <>
      <path d="M4 6h14v8H9v7" {...softFill} />
      <path d="M4 5h14v8H9v7M18 8h5a5 5 0 0 1 5 5v3M3 20h12v5H3z" />
      <path d="M27 18s-4 4.4-4 7a4 4 0 0 0 8 0c0-2.6-4-7-4-7Z" />
    </>
  ),
  appliance: (
    <>
      <rect x="4" y="3" width="20" height="26" rx="4" {...softFill} />
      <rect x="4" y="3" width="20" height="26" rx="4" />
      <circle cx="14" cy="18" r="6" />
      <path d="M8 8h2M14 8h6M26 20a5 5 0 0 0 4 6l-5 5-4-4 5-5" />
    </>
  ),
  cleaning: (
    <>
      <path d="M7 14h13l3 15H5z" {...softFill} />
      <path d="M9 13h10l3 16H6zM11 13V8h7l3 3M15 8V5h8M25 9l3-2M26 13h4" />
      <path d="m5 5 .8 2.2L8 8l-2.2.8L5 11l-.8-2.2L2 8l2.2-.8Z" />
    </>
  ),
  pest: (
    <>
      <path d="M16 8c6 0 10 5 10 11s-4 10-10 10S6 25 6 19 10 8 16 8Z" {...softFill} />
      <path d="M16 10c5 0 8 4 8 9s-3 8-8 8-8-3-8-8 3-9 8-9ZM16 10V6M12 7l-3-3M20 7l3-3M8 15H4M24 15h4M8 22H4M24 22h4M12 13v12M20 13v12" />
      <path d="m13 18 2 2 4-5" />
    </>
  ),
  general: (
    <>
      <circle cx="12" cy="20" r="8" {...softFill} />
      <path d="m19 8 5-5 5 5-5 5M3 29l12-12" />
      <path d="M10 7a6 6 0 0 0 7 7L9 22l-4 1-2 6 6-3 1-4 8-8" />
    </>
  ),
};

export function ServiceTradeIcon({ slug, ...props }: TradeIconProps) {
  const key = iconKey(slug);
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      data-service-icon={key}
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {icons[key]}
    </svg>
  );
}
