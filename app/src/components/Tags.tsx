import { View } from 'react-native';
import { t } from '../i18n';
import { tagHue } from '../lib/gallery';
import { useTheme } from '../theme/theme';
import { Txt } from './Txt';

interface Props {
  /** The sharer's tags, which the whole group sees. */
  tags: string[];
  /** Your own tags, drawn with a dashed edge and read out as private. */
  mine?: string[];
  /** Smaller, for a row in a list. */
  small?: boolean;
}

/**
 * A photo's tags as small pills, each in its own colour: the hue comes from
 * the tag's letters, so a tag looks the same wherever it appears.
 */
export function Tags({ tags, mine = [], small }: Props) {
  const theme = useTheme();
  if (tags.length + mine.length === 0) return null;
  const pill = (tag: string, own: boolean) => {
    const hue = tagHue(tag);
    return (
      <View
        key={(own ? 'm:' : 's:') + tag}
        accessible
        accessibilityLabel={own ? `${tag}, ${t('tags.private')}` : tag}
        style={{
          paddingHorizontal: small ? theme.space[2] : theme.space[3],
          paddingVertical: small ? 1 : theme.space[1],
          borderRadius: theme.radius.lg,
          borderWidth: 1,
          borderStyle: own ? 'dashed' : 'solid',
          borderColor: theme.tint(hue),
          backgroundColor: theme.tintSoft(hue),
        }}
      >
        <Txt variant={small ? 'faint' : 'muted'} color={theme.tint(hue)} style={{ fontFamily: theme.font.medium }}>
          #{tag}
        </Txt>
      </View>
    );
  };
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: small ? theme.space[1] : theme.space[2] }}>
      {tags.map((tag) => pill(tag, false))}
      {mine.filter((tag) => !tags.includes(tag)).map((tag) => pill(tag, true))}
    </View>
  );
}
