import { Pressable, View } from 'react-native';
import { useTheme } from '../theme/theme';
import { Txt } from './Txt';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** One of a few: a label and its options side by side, the chosen one filled. */
export function Choice<T extends string>({ label, options, value, onChange }: Props<T>) {
  const theme = useTheme();
  const c = theme.color;
  return (
    <View style={{ gap: theme.space[2] }}>
      <Txt variant="label">{label}</Txt>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
        {options.map((option) => {
          const chosen = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: chosen }}
              onPress={() => onChange(option.value)}
              style={{
                minHeight: theme.touch,
                justifyContent: 'center',
                paddingHorizontal: theme.space[4],
                borderRadius: theme.radius.md,
                borderWidth: 1.5,
                borderColor: chosen ? c.accent : c.borderStrong,
                backgroundColor: chosen ? c.accentSoft : 'transparent',
              }}
            >
              <Txt color={chosen ? c.accent : c.text} style={{ fontFamily: chosen ? theme.font.medium : theme.font.regular }}>
                {option.label}
              </Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
