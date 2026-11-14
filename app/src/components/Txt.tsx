import { Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';
import { useTheme } from '../theme/theme';

type Variant = 'body' | 'muted' | 'faint' | 'label' | 'title' | 'heading';

interface Props extends TextProps {
  variant?: Variant;
  /** Overrides the variant's colour; pass a token, never a literal. */
  color?: string;
  center?: boolean;
  style?: StyleProp<TextStyle>;
}

/** All text in the app, so font, size and colour come from the theme. */
export function Txt({ variant = 'body', color, center, style, ...rest }: Props) {
  const theme = useTheme();
  const { fontSize, font, color: c } = theme;
  const variants: Record<Variant, TextStyle> = {
    body: { fontSize: fontSize.md, fontFamily: font.regular, color: c.text, lineHeight: fontSize.md * 1.45 },
    muted: { fontSize: fontSize.sm, fontFamily: font.regular, color: c.textMuted, lineHeight: fontSize.sm * 1.45 },
    faint: { fontSize: fontSize.xs, fontFamily: font.regular, color: c.textFaint, lineHeight: fontSize.xs * 1.4 },
    label: { fontSize: fontSize.sm, fontFamily: font.medium, color: c.textMuted },
    title: { fontSize: fontSize.lg, fontFamily: font.semibold, color: c.text },
    heading: { fontSize: fontSize.xl, fontFamily: font.semibold, color: c.text, lineHeight: fontSize.xl * 1.25 },
  };
  return (
    <Text
      {...rest}
      style={[variants[variant], color ? { color } : null, center ? { textAlign: 'center' } : null, style]}
    />
  );
}
