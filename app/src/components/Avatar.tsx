import { Image, View } from 'react-native';
import type { Person } from '../lib/types';
import { toUri } from '../store/node';
import { useTheme } from '../theme/theme';
import { Txt } from './Txt';

interface Props {
  person: Person;
  size?: number;
  /** Sits on a photo, so it needs its own opaque ground to stay readable. */
  onPhoto?: boolean;
}

/**
 * A member's mark: their picture, or their initials on their own colour. Colour is never the
 * only signal, so the name is always shown beside it or read out with it.
 *
 * Where it is known whether they are connected, a dot sits on the corner:
 * filled green when they are, a hollow grey ring when they are not.
 */
export function Avatar({ person, size = 32, onPhoto }: Props) {
  const theme = useTheme();
  const initials = person.name
    .split(' ')
    .map((word) => word[0])
    .join('');
  const dot = Math.max(9, Math.round(size * 0.32));
  const ground = onPhoto ? theme.color.surface : theme.color.bg;
  return (
    <View accessible={false} style={{ width: size, height: size }}>
      <View
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
        {person.icon ? (
          <Image
            source={{ uri: toUri(person.icon) }}
            style={{ width: size - 3, height: size - 3, borderRadius: size / 2 }}
          />
        ) : (
          <Txt color={theme.tint(person.hue)} style={{ fontFamily: theme.font.semibold, fontSize: size * 0.38 }}>
            {initials}
          </Txt>
        )}
      </View>
      {person.online === undefined ? null : (
        <View
          style={{
            position: 'absolute',
            right: -2,
            bottom: -2,
            width: dot,
            height: dot,
            borderRadius: dot / 2,
            backgroundColor: person.online ? theme.color.success : ground,
            borderWidth: 1.5,
            borderColor: person.online ? ground : theme.color.textFaint,
          }}
        />
      )}
    </View>
  );
}
