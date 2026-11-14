import { ActivityIndicator, Image, Pressable, View } from 'react-native';
import { Check, Download } from 'lucide-react-native';
import { Avatar } from '../components/Avatar';
import { Txt } from '../components/Txt';
import { t } from '../i18n';
import type { Item } from '../lib/types';
import { toUri } from '../store/node';
import { useTheme } from '../theme/theme';

interface Props {
  item: Item;
  size: number;
  /** True while photos are being selected: a tap then toggles this one. */
  selecting: boolean;
  selected: boolean;
  onPress: () => void;
  onLongPress: () => void;
}

/**
 * One photo in the gallery grid: its thumbnail, who shared it (bottom left),
 * whether it is saved to this phone (bottom right) and, while selecting,
 * whether it is selected (top right).
 */
export function PhotoTile({ item, size, selecting, selected, onPress, onLongPress }: Props) {
  const theme = useTheme();
  const c = theme.color;
  const who = item.mine ? t('viewer.byYou') : t('viewer.by', { name: item.by?.name ?? '' });
  const marks = [who, item.saved ? t('group.savedMark') : '', selected ? t('group.selectedMark') : ''];
  const inset = theme.space[1];

  return (
    <Pressable
      accessibilityRole={selecting ? 'checkbox' : 'imagebutton'}
      accessibilityState={selecting ? { checked: selected } : undefined}
      accessibilityLabel={`${item.name}. ${marks.filter(Boolean).join(', ')}`}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
      style={{ width: size, height: size, backgroundColor: c.surface2 }}
    >
      {item.files.thumbnail ? (
        <Image
          source={{ uri: toUri(item.files.thumbnail) }}
          style={{ width: size, height: size, opacity: selected ? 0.6 : 1 }}
        />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.space[1] }}>
          <ActivityIndicator color={c.textFaint} />
          <Txt variant="faint">{t('group.loading')}</Txt>
        </View>
      )}

      {item.by ? (
        <View style={{ position: 'absolute', left: inset, bottom: inset }}>
          <Avatar person={item.by} size={22} onPhoto />
        </View>
      ) : null}

      {item.saved ? (
        <Badge style={{ right: inset, bottom: inset }} fill={c.surface} edge={c.success}>
          <Download size={13} color={c.success} />
        </Badge>
      ) : null}

      {selecting ? (
        <Badge style={{ right: inset, top: inset }} fill={selected ? c.accent : c.surface} edge={c.accent}>
          {selected ? <Check size={14} color={c.accentText} /> : null}
        </Badge>
      ) : null}
    </Pressable>
  );
}

interface BadgeProps {
  children: React.ReactNode;
  fill: string;
  edge: string;
  style: { left?: number; right?: number; top?: number; bottom?: number };
}

/** A small round mark in a corner of a tile, on its own opaque ground. */
function Badge({ children, fill, edge, style }: BadgeProps) {
  return (
    <View
      style={[
        {
          position: 'absolute',
          width: 22,
          height: 22,
          borderRadius: 11,
          borderWidth: 1.5,
          borderColor: edge,
          backgroundColor: fill,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
