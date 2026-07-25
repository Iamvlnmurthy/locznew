import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { name: string };

const paths: Record<string, React.ReactNode> = {
  search: <path d="m21 21-4.35-4.35m2.35-5.15A7.5 7.5 0 1 1 4 11.5a7.5 7.5 0 0 1 15 0Z" />,
  location: (
    <>
      <path d="M20 10c0 5.2-8 11-8 11S4 15.2 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  home: (
    <>
      <path d="m3 11 9-8 9 8" />
      <path d="M5.5 9.5V21h13V9.5M9 21v-7h6v7" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  heart: (
    <path d="M20.8 4.7a5.5 5.5 0 0 0-7.8 0L12 5.8l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.5a5.5 5.5 0 0 0 0-7.8Z" />
  ),
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  shield: (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  phone: (
    <>
      <rect x="6" y="2" width="12" height="20" rx="2.5" />
      <path d="M10 18h4" />
    </>
  ),
  laptop: (
    <>
      <rect x="4" y="4" width="16" height="12" rx="2" />
      <path d="M2 20h20M9 16v4m6-4v4" />
    </>
  ),
  car: (
    <>
      <path d="m5 11 2-5h10l2 5" />
      <path d="M3 11h18v7H3z" />
      <circle cx="7" cy="18" r="1.5" />
      <circle cx="17" cy="18" r="1.5" />
    </>
  ),
  bike: (
    <>
      <circle cx="6" cy="17" r="4" />
      <circle cx="18" cy="17" r="4" />
      <path d="m6 17 4-8 4 8m-6-4h8l2-4h2M9 7h3" />
    </>
  ),
  sofa: (
    <>
      <path d="M5 12V7a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v5" />
      <path d="M3 10a2 2 0 0 1 2 2v4h14v-4a2 2 0 1 1 2 2v6H3v-6a2 2 0 1 1 0-4Z" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V4h6v3m-12 6h18m-11 0v2h4v-2" />
    </>
  ),
  store: (
    <>
      <path d="M4 10v11h16V10M3 4h18l-2 6H5L3 4Z" />
      <path d="M8 21v-6h8v6" />
    </>
  ),
  tools: (
    <>
      <path d="m14 6 4-4 4 4-4 4M13 7 3 17a2.8 2.8 0 0 0 4 4L17 11" />
      <path d="m12 12-3-3" />
    </>
  ),
  homeCategory: (
    <>
      <path d="m3 11 9-8 9 8" />
      <path d="M5 9v12h14V9M9 21v-7h6v7" />
    </>
  ),
  tag: (
    <>
      <path d="M20 13 13 20 3 10V3h7l10 10Z" />
      <circle cx="7.5" cy="7.5" r="1" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </>
  ),
  box: (
    <>
      <path d="m4 7 8-4 8 4-8 4-8-4Z" />
      <path d="M4 7v10l8 4 8-4V7M12 11v10" />
    </>
  ),
};

export function Icon({ name, className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...props}
    >
      {paths[name] ?? paths.box}
    </svg>
  );
}

export function categoryIconName(iconKey: string | null): string {
  if (!iconKey) return 'box';
  const aliases: Record<string, string> = {
    device: 'phone',
    tv: 'phone',
    code: 'laptop',
    chart: 'briefcase',
    truck: 'car',
    wrench: 'tools',
    book: 'box',
    heart: 'heart',
    home: 'homeCategory',
    utensils: 'store',
    bed: 'homeCategory',
    scissors: 'tools',
    bag: 'store',
    stethoscope: 'tools',
  };
  return paths[iconKey] ? iconKey : (aliases[iconKey] ?? 'box');
}

export function categoryImageName(iconKey: string | null): string {
  if (!iconKey) return 'shopping';
  const aliases: Record<string, string> = {
    device: 'phones',
    phone: 'phones',
    laptop: 'phones',
    tv: 'phones',
    car: 'vehicles',
    bike: 'vehicles',
    truck: 'vehicles',
    sofa: 'furniture',
    briefcase: 'jobs',
    code: 'jobs',
    chart: 'jobs',
    store: 'business',
    tools: 'services',
    wrench: 'services',
    home: 'rentals',
    bed: 'rentals',
    tag: 'offers',
    calendar: 'events',
    bag: 'shopping',
    book: 'education',
    utensils: 'food',
    heart: 'services',
    scissors: 'services',
    stethoscope: 'services',
  };
  return aliases[iconKey] ?? 'shopping';
}
