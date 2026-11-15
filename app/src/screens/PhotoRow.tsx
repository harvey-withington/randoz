import { ActivityIndicator, Image, Pressable, View } from 'react-native';
import { Check, Download } from 'lucide-react-native';
import { Avatar } from '../components/Avatar';
import { Tags } from '../components/Tags';
import { Txt } from '../components/Txt';
import { t } from '../i18n';
import { labelOf, sizeLabel } from '../lib/gallery';
import type { Item } from '../lib/types';
import { toUri } from '../store/node';
import { useTheme } from '../theme/theme';

interface Props {
  item: Item;
  /** True while photos are being selected: a tap then toggles this one. */
  selecting: boolean;
  selected: boolean;
  onPress: () => void;
  onLongPress: () => void;
}

const THUMB = 64;

/**
 * One photo in the details list: its thumbnail, title, description and
 * tags, then who shared it, when, and how big it is.
 */
export function PhotoRow({ item, selecting, selected, onPress, onLongPress }: Props) {
  const theme = useTheme();
  const c = theme.color;
  const who = item.mine ? t('viewer.byYou') : t('viewer.by', { name: item.by?.name ?? '' });
  const when = new Date(item.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const facts = [item.by?.name ?? '', when, sizeLabel(item.size)].filter(Boolean).join(' · ');

  return (
    <Pressable
      accessibilityRole={selecting ? 'checkbox' : 'button'}
      accessibilityState={selecting ? { checked: selected } : undefined}
      accessibilityLabel={`${labelOf(item)}. ${who}`}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space[3],
        paddingVertical: theme.space[2],
        paddingHorizontal: theme.space[3],
        borderBottomWidth: 1,
        borderBottomColor: c.border,
        backgroundColor: selected ? c.accentSoft : pressed ? c.surface2 : c.bg,
      })}
    >
      <View
        style={{
          width: THUMB,
          height: THUMB,
          borderRadius: theme.radius.sm,
          overflow: 'hidden',
          backgroundColor: c.surface2,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {item.files.thumbnail ? (
          <Image source={{ uri: toUri(item.files.thumbnail) }} style={{ width: THUMB, height: THUMB }} />
        ) : (
          <ActivityIndicator color={c.textFaint} />
        )}
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Txt numberOfLines={1} style={{ fontFamily: theme.font.medium }}>
          {labelOf(item)}
        </Txt>
        {item.description ? (
          <Txt variant="muted" numberOfLines={2}>
            {item.description}
          </Txt>
        ) : null}
        <Tags tags={item.tags} mine={item.myTags} small />
        <Txt variant="faint" numberOfLines={1}>
          {facts}
        </Txt>
      </View>
      {item.saved ? <Download size={16} color={c.success} accessibilityLabel={t('group.savedMark')} /> : null}
      {selecting ? (
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            borderWidth: 1.5,
            borderColor: c.accent,
            backgroundColor: selected ? c.accent : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {selected ? <Check size={15} color={c.accentText} /> : null}
        </View>
      ) : item.by ? (
        <Avatar person={item.by} size={28} />
      ) : null}
    </Pressable>
  );
}
