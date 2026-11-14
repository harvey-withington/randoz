import { View } from 'react-native';
import { useTheme } from '../theme/theme';
import { Txt } from './Txt';

interface Props {
  online: boolean;
  /** What the dot means, in words. Colour is never the only signal. */
  label: string;
}

/** Whether something is connected: a dot (green on, grey off) and its label. */
export function ConnectionDot({ online, label }: Props) {
  const theme = useTheme();
  const c = theme.color;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[1] + 2 }}>
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: online ? c.success : 'transparent',
          borderWidth: 1.5,
          borderColor: online ? c.success : c.textFaint,
        }}
      />
      <Txt variant="faint" color={online ? c.textMuted : c.textFaint} numberOfLines={1}>
        {label}
      </Txt>
    </View>
  );
}
