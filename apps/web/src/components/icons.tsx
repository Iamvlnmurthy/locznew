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
  navigation: <path d="M3 11 21 3l-8 18-2.5-7.5L3 11Z" />,
  utensils: (
    <>
      <path d="M5 3v6a2 2 0 0 0 2 2 2 2 0 0 0 2-2V3M7 11v10" />
      <path d="M17 3c-1.7 0-3 2-3 5s1.3 4 3 4m0-9v18" />
    </>
  ),
  stethoscope: (
    <>
      <path d="M6 3v5a4 4 0 0 0 8 0V3" />
      <path d="M10 16a5 5 0 0 0 5 5 4 4 0 0 0 4-4v-3" />
      <circle cx="19" cy="10" r="2" />
    </>
  ),
  bag: (
    <>
      <path d="M6 8h12l1 12H5L6 8Z" />
      <path d="M9 8a3 3 0 0 1 6 0" />
    </>
  ),
  bed: (
    <>
      <path d="M3 8v11M3 13h18v6M21 13v-1a3 3 0 0 0-3-3H9v4" />
      <circle cx="6.5" cy="11" r="1.5" />
    </>
  ),
  home: (
    <>
      <path d="m3 11 9-8 9 8" />
      <path d="M5.5 9.5V21h13V9.5M9 21v-7h6v7" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m5 12 4 4L19 6" />,
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9" r="1.5" />
      <path d="m4 17 5-5 4 4 2-2 5 5" />
    </>
  ),
  sparkles: (
    <>
      <path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Z" />
      <path d="m19 14 .7 2.3L22 17l-2.3.7L19 20l-.7-2.3L16 17l2.3-.7L19 14Z" />
      <path d="m5 13 .7 2.3L8 16l-2.3.7L5 19l-.7-2.3L2 16l2.3-.7L5 13Z" />
    </>
  ),
  message: (
    <>
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3 1.5-4A7 7 0 0 1 3 13V8a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v7Z" />
      <path d="M8 10h8M8 14h5" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" />
      <path d="M10 21h4" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
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
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M20.2 15.6A8.5 8.5 0 0 1 8.4 3.8 8.5 8.5 0 1 0 20.2 15.6Z" />,
  share: (
    <>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" />
    </>
  ),
  expand: (
    <>
      <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
    </>
  ),
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 6h10M18 6h2M4 12h3M11 12h9M4 18h8M16 18h4" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="14" cy="18" r="2" />
    </>
  ),
  sort: <path d="M8 6h10M8 12h7M8 18h4M4 4v16" />,
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
