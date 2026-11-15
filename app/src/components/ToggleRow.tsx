import { Switch, View } from 'react-native';
import { useTheme } from '../theme/theme';
import { Txt } from './Txt';

interface Props {
  label: string;
  /** What turning it on does, under the label. */
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

/** A setting that is on or off: its label, what it does, and a switch. */
export function ToggleRow({ label, hint, value, onChange }: Props) {
  const theme = useTheme();
  const c = theme.color;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3], minHeight: theme.touch }}>
      <View style={{ flex: 1 }}>
        <Txt>{label}</Txt>
        {hint ? <Txt variant="muted">{hint}</Txt> : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: c.surface3, true: c.accentSoft }}
        thumbColor={value ? c.accent : c.textFaint}
      />
    </View>
  );
}
