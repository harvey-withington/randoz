// Design tokens. Components never hardcode a colour or a size: they read
// these through useTheme(). The palette, type scale, spacing and radii are
// UNCLI's (its styles/theme.css), so the two apps look like siblings.
// See docs/UI-CONVENTIONS.md.

export interface Palette {
  bg: string;
  surface: string;
  surface2: string;
  surface3: string;
  text: string;
  textMuted: string;
  textFaint: string;
  border: string;
  borderStrong: string;
  accent: string;
  accentSoft: string;
  accentText: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  success: string;
  scrim: string;
  /** QR codes scan only on a light ground, in either theme. */
  qrGround: string;
  qrInk: string;
  /** Lightness for a member's colour: `hsl(hue, 100%, tintL)`. */
  tintL: number;
}

export const light: Palette = {
  bg: '#f7f6f3',
  surface: '#ffffff',
  surface2: '#f1efea',
  surface3: '#e8e5df',
  text: '#1d1b18',
  textMuted: '#6d6962',
  textFaint: '#9c978e',
  border: '#e4e0d8',
  borderStrong: '#d3cec4',
  accent: '#4f46e5',
  accentSoft: 'rgba(79, 70, 229, 0.09)',
  accentText: '#ffffff',
  danger: '#c2410c',
  dangerSoft: 'rgba(194, 65, 12, 0.09)',
  warning: '#a16207',
  success: '#15803d',
  scrim: 'rgba(29, 27, 24, 0.32)',
  qrGround: '#ffffff',
  qrInk: '#1d1b18',
  tintL: 40,
};

export const dark: Palette = {
  bg: '#111113',
  surface: '#18181b',
  surface2: '#202024',
  surface3: '#2a2a2f',
  text: '#ececef',
  textMuted: '#a1a1aa',
  textFaint: '#71717a',
  border: '#29292e',
  borderStrong: '#3a3a40',
  accent: '#8b8cf8',
  accentSoft: 'rgba(139, 140, 248, 0.13)',
  accentText: '#111113',
  danger: '#fb923c',
  dangerSoft: 'rgba(251, 146, 60, 0.12)',
  warning: '#facc15',
  success: '#4ade80',
  scrim: 'rgba(0, 0, 0, 0.55)',
  qrGround: '#ffffff',
  qrInk: '#111113',
  tintL: 62,
};

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48 } as const;
export const radius = { sm: 6, md: 10, lg: 14 } as const;

// UNCLI's scale is tuned for a desktop window; these are one step up, for
// reading at arm's length on a phone.
export const fontSize = { xs: 12, sm: 13.5, md: 15.5, lg: 17.5, xl: 22 } as const;

export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
} as const;

/** The smallest size anything tappable may be. */
export const touch = 44;

export const motion = { fast: 120, normal: 200 } as const;
