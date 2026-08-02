/**
 * LocZ design tokens — the single source for colour, type, spacing and elevation
 * across web, admin and the Flutter app.
 *
 * The palette is built around a warm teal rather than the blue every classifieds site
 * uses, with a saffron accent for prices and offers. LocZ should read as local and
 * trustworthy, not as an enterprise dashboard.
 *
 * Admin reuses the same tokens at a denser scale — same system, tighter spacing.
 */

export const color = {
  // Brand
  primary50: '#e8f3ef',
  primary100: '#cce4dc',
  primary200: '#a8d2c5',
  primary300: '#73b5a2',
  primary400: '#3e8c77',
  primary500: '#125b4c', // primary action
  primary600: '#0c483c',
  primary700: '#0a3b32',
  primary800: '#173f35',
  primary900: '#102d26',

  // Accent — prices, offers, "free" badges
  accent50: '#fff3dc',
  accent100: '#fee6b6',
  accent200: '#fbd488',
  accent300: '#f6be60',
  accent400: '#f1a63a',
  accent500: '#dc8616',
  accent600: '#ad670a',

  // Neutrals
  neutral0: '#ffffff',
  neutral50: '#f7f4ed',
  neutral100: '#f0ede6',
  neutral200: '#e7e1d6',
  neutral300: '#d2cabd',
  neutral400: '#9aa59f',
  neutral500: '#718078',
  neutral600: '#4c5b54',
  neutral700: '#33433c',
  neutral800: '#24312c',
  neutral900: '#18241f',

  // Status
  success: '#12855c',
  successSurface: '#e6f6ef',
  warning: '#b26a00',
  warningSurface: '#fff4e0',
  danger: '#c0392b',
  dangerSurface: '#fdecea',
  info: '#1668b3',
  infoSurface: '#e8f2fb',
} as const;

/**
 * Semantic aliases. Components reference these, never the raw scale — which is what
 * makes a dark theme a token swap rather than a component rewrite.
 */
export const semantic = {
  light: {
    background: color.neutral50,
    surface: color.neutral0,
    surfaceMuted: color.neutral100,
    border: color.neutral200,
    borderStrong: color.neutral300,
    textPrimary: color.neutral900,
    textSecondary: color.neutral600,
    textMuted: color.neutral500,
    textInverse: color.neutral0,
    actionPrimary: color.primary500,
    actionPrimaryHover: color.primary600,
    actionSecondary: color.neutral100,
    focusRing: color.primary400,
    price: color.neutral900,
    offer: color.accent600,
  },
  dark: {
    background: color.neutral900,
    surface: color.neutral800,
    surfaceMuted: color.neutral700,
    border: color.neutral700,
    borderStrong: color.neutral600,
    textPrimary: color.neutral50,
    textSecondary: color.neutral300,
    textMuted: color.neutral400,
    textInverse: color.neutral900,
    actionPrimary: color.primary400,
    actionPrimaryHover: color.primary300,
    actionSecondary: color.neutral700,
    focusRing: color.primary300,
    price: color.neutral0,
    offer: color.accent300,
  },
} as const;

/**
 * Type scale. Telugu and Hindi glyphs are taller than Latin at the same size, so line
 * heights are deliberately generous — a scale tuned only for English clips Devanagari
 * matras and Telugu vowel signs.
 */
export const typography = {
  fontFamily: {
    sans: "'Inter', 'Noto Sans', 'Noto Sans Telugu', 'Noto Sans Devanagari', system-ui, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, monospace",
  },
  size: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
    '3xl': '1.875rem',
    '4xl': '2.25rem',
  },
  lineHeight: {
    tight: 1.3,
    snug: 1.45,
    normal: 1.6,
    relaxed: 1.75,
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
} as const;

/** 4px base grid. Admin uses the lower half of the scale for density. */
export const spacing = {
  0: '0',
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  5: '1.25rem',
  6: '1.5rem',
  8: '2rem',
  10: '2.5rem',
  12: '3rem',
  16: '4rem',
  20: '5rem',
} as const;

export const radius = {
  none: '0',
  sm: '6px',
  md: '10px',
  lg: '14px',
  xl: '20px',
  full: '9999px',
} as const;

export const shadow = {
  none: 'none',
  sm: '0 1px 2px rgba(20, 26, 26, 0.06)',
  md: '0 2px 8px rgba(20, 26, 26, 0.08)',
  lg: '0 8px 24px rgba(20, 26, 26, 0.10)',
  focus: `0 0 0 3px ${color.primary200}`,
} as const;

/** Mobile-first. Most Indian traffic is a phone, so these are minimums, not maximums. */
export const breakpoint = {
  sm: '480px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
} as const;

export const zIndex = {
  base: 0,
  dropdown: 100,
  sticky: 200,
  overlay: 300,
  modal: 400,
  toast: 500,
} as const;

/**
 * Deterministic artwork primitives for businesses without photography.
 *
 * These are intentionally a small palette plus broad category-group glyphs, not one asset
 * per directory category. A consumer can hash the stable business id into `palette` and
 * combine it with initials and one glyph without making millions of shops look templated.
 * Every colour is paired for the theme it appears on; consumers must not swap individual
 * background and foreground values between pairs.
 */
export const businessCardGraphics = {
  palette: [
    {
      name: 'mango',
      light: { background: '#FFF1D6', foreground: '#653B05', accent: '#D77A0B' },
      dark: { background: '#39280F', foreground: '#FFE2A6', accent: '#F3A53A' },
    },
    {
      name: 'leaf',
      light: { background: '#E1F1E6', foreground: '#174A31', accent: '#3C8A5B' },
      dark: { background: '#173126', foreground: '#BDE8CB', accent: '#5FC181' },
    },
    {
      name: 'lagoon',
      light: { background: '#DDF2F0', foreground: '#124D49', accent: '#248C83' },
      dark: { background: '#143331', foreground: '#B9ECE7', accent: '#54C3B8' },
    },
    {
      name: 'clay',
      light: { background: '#F8E3DB', foreground: '#683326', accent: '#C4664E' },
      dark: { background: '#3B241F', foreground: '#F7C9BC', accent: '#E7856D' },
    },
    {
      name: 'indigo',
      light: { background: '#E6E8F8', foreground: '#343B72', accent: '#6873C4' },
      dark: { background: '#252943', foreground: '#D5D9FF', accent: '#909AF0' },
    },
    {
      name: 'plum',
      light: { background: '#F0E3EF', foreground: '#60355B', accent: '#A25C98' },
      dark: { background: '#382438', foreground: '#F0C9EC', accent: '#CF82C4' },
    },
    {
      name: 'sky',
      light: { background: '#DFEEF8', foreground: '#24516B', accent: '#4A8DB4' },
      dark: { background: '#1B303D', foreground: '#C5E7F8', accent: '#68B4DD' },
    },
    {
      name: 'rose',
      light: { background: '#F9E2E5', foreground: '#6B3039', accent: '#C45D6D' },
      dark: { background: '#3B2228', foreground: '#F9C7CE', accent: '#EA7D8D' },
    },
    {
      name: 'olive',
      light: { background: '#ECEDD8', foreground: '#4B4F20', accent: '#83893D' },
      dark: { background: '#2D2F1B', foreground: '#E3E6AD', accent: '#B2B95B' },
    },
    {
      name: 'slate',
      light: { background: '#E6ECEA', foreground: '#334A43', accent: '#647E75' },
      dark: { background: '#242F2C', foreground: '#D1E0DA', accent: '#88A89E' },
    },
  ],
  glyphs: {
    food: {
      viewBox: '0 0 24 24',
      paths: ['M6 3v7a3 3 0 0 0 3 3V3M6 7h3M7.5 13v8M16 3v18M16 3c3 2 3 7 0 10'],
    },
    retail: {
      viewBox: '0 0 24 24',
      paths: [
        'M4 10v10h16V10M3 10l2-6h14l2 6M3 10a3 3 0 0 0 5 2 3 3 0 0 0 4 0 3 3 0 0 0 4 0 3 3 0 0 0 5-2M9 20v-5h6v5',
      ],
    },
    services: {
      viewBox: '0 0 24 24',
      paths: ['m14 6 4-3 3 3-3 4-2-2-7 7 2 2-4 4-4-4 4-4 2 2 7-7-2-2Z'],
    },
    health: {
      viewBox: '0 0 24 24',
      paths: [
        'M12 21S4 16.5 4 10a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6.5-8 11-8 11ZM12 8v7M8.5 11.5h7',
      ],
    },
    education: {
      viewBox: '0 0 24 24',
      paths: ['m3 9 9-5 9 5-9 5-9-5ZM7 12v4c3 2 7 2 10 0v-4M21 9v7'],
    },
    vehicles: {
      viewBox: '0 0 24 24',
      paths: ['M4 15V9l2-4h12l2 4v6M3 12h18M7 16v2M17 16v2M7 12h.01M17 12h.01M6 15h12'],
    },
    home: {
      viewBox: '0 0 24 24',
      paths: ['m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7'],
    },
    other: {
      viewBox: '0 0 24 24',
      paths: ['M4 4h6v6H4V4ZM14 4h6v6h-6V4ZM4 14h6v6H4v-6ZM17 14v6M14 17h6'],
    },
  },
} as const;

export const tokens = {
  color,
  semantic,
  typography,
  spacing,
  radius,
  shadow,
  breakpoint,
  zIndex,
  businessCardGraphics,
} as const;

export type Tokens = typeof tokens;
export default tokens;
