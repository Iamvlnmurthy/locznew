export type ConsoleIconName =
  | 'overview'
  | 'moderation'
  | 'reports'
  | 'listings'
  | 'users'
  | 'categories'
  | 'audit'
  | 'system'
  | 'arrow'
  | 'pulse'
  | 'search'
  | 'building'
  | 'briefcase'
  | 'tag'
  | 'shield'
  | 'flag'
  | 'database';

const PATHS: Record<ConsoleIconName, React.ReactNode> = {
  overview: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </>
  ),
  moderation: (
    <>
      <path d="M12 3 4.5 6v5.3c0 4.5 3.2 8.7 7.5 9.7 4.3-1 7.5-5.2 7.5-9.7V6L12 3Z" />
      <path d="m8.8 12 2.1 2.1 4.5-4.6" />
    </>
  ),
  reports: (
    <>
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 3.7 2.7 17a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z" />
    </>
  ),
  listings: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
    </>
  ),
  categories: (
    <>
      <path d="M20.6 13.6 11 3H4v7l9.6 9.6a2 2 0 0 0 2.8 0l4.2-4.2a2 2 0 0 0 0-2.8Z" />
      <circle cx="7.5" cy="6.5" r="1" />
    </>
  ),
  audit: (
    <>
      <path d="M9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </>
  ),
  system: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </>
  ),
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  pulse: <path d="M3 12h4l2.5-7 5 14 2.5-7h4" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  building: (
    <>
      <path d="M4 21V5l8-3v19M4 9h8M4 13h8M4 17h8M12 8h8v13M16 12h.01M16 16h.01" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" />
    </>
  ),
  tag: (
    <>
      <path d="M20.6 13.6 11 3H4v7l9.6 9.6a2 2 0 0 0 2.8 0l4.2-4.2a2 2 0 0 0 0-2.8Z" />
      <circle cx="7.5" cy="6.5" r="1" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 4.5 6v5.3c0 4.5 3.2 8.7 7.5 9.7 4.3-1 7.5-5.2 7.5-9.7V6L12 3Z" />
      <path d="M9 12h6M12 9v6" />
    </>
  ),
  flag: (
    <>
      <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="5" rx="7" ry="3" />
      <path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </>
  ),
};

export function ConsoleIcon({ name, size = 18 }: { name: ConsoleIconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </svg>
  );
}
