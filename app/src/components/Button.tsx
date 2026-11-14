import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../theme/theme';
import { Txt } from './Txt';

type Kind = 'primary' | 'default' | 'ghost' | 'danger';

interface Props {
  label: string;
  onPress: () => void;
  kind?: Kind;
  icon?: LucideIcon;
  disabled?: boolean;
  /** Shows a spinner in place of the icon and blocks presses. */
  busy?: boolean;
  /** Fills the width of its container. */
  wide?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** The app's button. UNCLI's `.btn` with `primary`, `ghost` and `danger`. */
export function Button({ label, onPress, kind = 'default', icon: Icon, disabled, busy, wide, style }: Props) {
  const theme = useTheme();
  const c = theme.color;
  const off = disabled || busy;
  const fill = kind === 'primary' ? c.accent : kind === 'ghost' ? 'transparent' : c.surface;
  const ink = kind === 'primary' ? c.accentText : kind === 'danger' ? c.danger : c.text;
  const edge = kind === 'primary' || kind === 'ghost' ? 'transparent' : kind === 'danger' ? c.danger : c.borderStrong;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: theme.touch,
          paddingHorizontal: theme.space[4],
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: edge,
          backgroundColor: fill,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.space[2],
          opacity: off ? 0.5 : pressed ? 0.8 : 1,
          alignSelf: wide ? 'stretch' : 'flex-start',
        },
        style,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={ink} /> : Icon ? <Icon size={18} color={ink} /> : null}
      <Txt color={ink} style={{ fontFamily: theme.font.medium }}>
        {label}
      </Txt>
    </Pressable>
  );
}

interface IconButtonProps {
  /** What the button does, for screen readers; it has no visible text. */
  label: string;
  icon: LucideIcon;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
  /** A small mark on the icon, such as a count. */
  badge?: ReactNode;
}

/** An icon-only button, never smaller than the touch target. */
export function IconButton({ label, icon: Icon, onPress, color, disabled, badge }: IconButtonProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        width: theme.touch,
        height: theme.touch,
        borderRadius: theme.radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? theme.color.surface2 : 'transparent',
        opacity: disabled ? 0.4 : 1,
      })}
    >
      <Icon size={22} color={color ?? theme.color.text} />
      {badge ? <View style={{ position: 'absolute', top: 4, right: 4 }}>{badge}</View> : null}
    </Pressable>
  );
}
