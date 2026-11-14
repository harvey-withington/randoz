import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { dark, font, fontSize, light, motion, radius, space, touch, type Palette } from './tokens';

export interface Theme {
  scheme: 'light' | 'dark';
  color: Palette;
  space: typeof space;
  radius: typeof radius;
  fontSize: typeof fontSize;
  font: typeof font;
  touch: number;
  motion: typeof motion;
  /** A member's own colour: fully saturated, at the theme's lightness. */
  tint(hue: number): string;
  /** The same colour as a soft fill behind text or an icon. */
  tintSoft(hue: number): string;
}

function build(scheme: 'light' | 'dark'): Theme {
  const color = scheme === 'dark' ? dark : light;
  return {
    scheme,
    color,
    space,
    radius,
    fontSize,
    font,
    touch,
    motion,
    tint: (hue) => `hsl(${hue}, 100%, ${color.tintL}%)`,
    tintSoft: (hue) => `hsla(${hue}, 100%, ${color.tintL}%, 0.16)`,
  };
}

const ThemeContext = createContext<Theme>(build('light'));

interface Props {
  children: ReactNode;
}

/** Follows the phone's light or dark setting. */
export function ThemeProvider({ children }: Props) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = useMemo(() => build(scheme), [scheme]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export const useTheme = (): Theme => useContext(ThemeContext);
