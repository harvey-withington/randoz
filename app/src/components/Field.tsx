import { TextInput, View } from 'react-native';
import { useTheme } from '../theme/theme';
import { Txt } from './Txt';

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** A line under the field saying what it is for. */
  hint?: string;
  maxLength?: number;
  autoFocus?: boolean;
  /** Called when the keyboard's Done key is pressed. */
  onSubmit?: () => void;
}

/** A labelled one-line text field. UNCLI's `.input`. */
export function Field({ label, value, onChange, placeholder, hint, maxLength, autoFocus, onSubmit }: Props) {
  const theme = useTheme();
  const c = theme.color;
  return (
    <View style={{ gap: theme.space[2] }}>
      <Txt variant="label">{label}</Txt>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.textFaint}
        autoFocus={autoFocus}
        maxLength={maxLength}
        returnKeyType="done"
        onSubmitEditing={onSubmit}
        style={{
          minHeight: theme.touch,
          borderWidth: 1,
          borderColor: c.borderStrong,
          borderRadius: theme.radius.md,
          paddingHorizontal: theme.space[3],
          color: c.text,
          backgroundColor: c.bg,
          fontFamily: theme.font.regular,
          fontSize: theme.fontSize.md,
        }}
      />
      {hint ? <Txt variant="muted">{hint}</Txt> : null}
    </View>
  );
}
