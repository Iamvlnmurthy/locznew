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
  primary50: '#eafaf7',
  primary100: '#c6f1e9',
  primary200: '#94e4d7',
  primary300: '#5bd2c1',
  primary400: '#2bbaa7',
  primary500: '#0f9e8c', // primary action
  primary600: '#0b7f72',
  primary700: '#0a655c',
  primary800: '#0a4f49',
  primary900: '#09403c',

  // Accent — prices, offers, "free" badges
  accent50: '#fff6e6',
  accent100: '#ffe7bd',
  accent200: '#ffd489',
  accent300: '#ffbe52',
  accent400: '#ffa726',
  accent500: '#f28c00',
  accent600: '#c66d00',

  // Neutrals
  neutral0: '#ffffff',
  neutral50: '#f8fafa',
  neutral100: '#f1f4f4',
  neutral200: '#e3e8e8',
  neutral300: '#cbd3d3',
  neutral400: '#9aa5a5',
  neutral500: '#6b7676',
  neutral600: '#4d5757',
  neutral700: '#374040',
  neutral800: '#222929',
  neutral900: '#141a1a',

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

export const tokens = {
  color,
  semantic,
  typography,
  spacing,
  radius,
  shadow,
  breakpoint,
  zIndex,
} as const;

export type Tokens = typeof tokens;
export default tokens;
