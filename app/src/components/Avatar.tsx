import { View } from 'react-native';
import type { Person } from '../lib/types';
import { useTheme } from '../theme/theme';
import { Txt } from './Txt';

interface Props {
  person: Person;
  size?: number;
  /** Sits on a photo, so it needs its own opaque ground to stay readable. */
  onPhoto?: boolean;
}

/**
 * A member's mark: their initials on their own colour. Colour is never the
 * only signal, so the name is always shown beside it or read out with it.
 */
export function Avatar({ person, size = 32, onPhoto }: Props) {
  const theme = useTheme();
  const initials = person.name
    .split(' ')
    .map((word) => word[0])
    .join('');
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: onPhoto ? theme.color.surface : theme.tintSoft(person.hue),
        borderWidth: 1.5,
        borderColor: theme.tint(person.hue),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Txt color={theme.tint(person.hue)} style={{ fontFamily: theme.font.semibold, fontSize: size * 0.38 }}>
        {initials}
      </Txt>
    </View>
  );
}
