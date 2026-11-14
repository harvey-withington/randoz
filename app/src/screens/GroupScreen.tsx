import { useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ImagePlus, UserPlus, Users } from 'lucide-react-native';
import { Avatar } from '../components/Avatar';
import { Button, IconButton } from '../components/Button';
import { Txt } from '../components/Txt';
import { plural, t } from '../i18n';
import { pickPhotos, prepare } from '../lib/photos';
import type { InGroupState, Item } from '../lib/types';
import { useShell } from '../shell/shell';
import { toUri, useNode } from '../store/node';
import { useTheme } from '../theme/theme';
import { InviteSheet } from './InviteSheet';
import { MembersSheet } from './MembersSheet';
import { Viewer } from './Viewer';

interface Props {
  state: InGroupState;
}

const COLUMNS = 3;

/** The group: who you are, who's here, and everyone's photos. */
export function GroupScreen({ state }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const node = useNode();
  const shell = useShell();
  const { width } = useWindowDimensions();
  const [inviting, setInviting] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const c = theme.color;
  const gap = theme.space[1];
  const cell = (width - gap * (COLUMNS - 1)) / COLUMNS;
  // Newest first, as a camera roll shows them.
  const items = [...state.items].reverse();
  const viewed = viewing ? state.items.find((item) => item.id === viewing) : undefined;

  const share = async () => {
    try {
      const photos = await pickPhotos();
      if (photos.length === 0) return;
      const ok = await shell.confirm({
        title: photos.length === 1 ? t('confirmShare.titleOne') : t('confirmShare.title', { count: photos.length }),
        message: t('confirmShare.message', { group: state.group.name }),
        confirmLabel: t('confirmShare.confirm'),
      });
      if (!ok) return;
      for (let done = 0; done < photos.length; done++) {
        setProgress({ done, total: photos.length });
        await node.call('shareItem', await prepare(photos[done]));
      }
      shell.toast(plural(photos.length, 'group.sharedOne', 'group.shared'), 'success');
    } catch (err) {
      shell.toast(t('group.shareFailed', { reason: (err as Error).message }), 'error');
    } finally {
      setProgress(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space[2],
          paddingLeft: theme.space[4],
          paddingRight: theme.space[2],
          paddingVertical: theme.space[2],
          borderBottomWidth: 1,
          borderBottomColor: c.border,
          backgroundColor: c.surface,
        }}
      >
        <Avatar person={state.me} size={36} />
        <View style={{ flex: 1 }}>
          <Txt variant="title" numberOfLines={1} accessibilityRole="header">
            {state.group.name}
          </Txt>
          <Txt variant="muted" numberOfLines={1}>
            {state.group.writable ? t('group.you', { name: state.me.name }) : t('group.joiningAs')}
          </Txt>
          <Txt variant="faint" numberOfLines={1}>
            {state.peers > 0 ? t('group.connected', { count: state.peers }) : t('group.offline')}
          </Txt>
        </View>
        <IconButton label={t('group.invite')} icon={UserPlus} onPress={() => setInviting(true)} />
        <IconButton
          label={`${t('menu.members')}: ${plural(state.members.length, 'group.membersOne', 'group.members')}`}
          icon={Users}
          onPress={() => setShowMembers(true)}
        />
      </View>

      <FlatList
        // Hidden from screen readers while the viewer covers it.
        importantForAccessibility={viewed ? 'no-hide-descendants' : 'auto'}
        data={items}
        keyExtractor={(item) => item.id}
        numColumns={COLUMNS}
        columnWrapperStyle={{ gap }}
        contentContainerStyle={{ gap, paddingBottom: insets.bottom + theme.touch + theme.space[6], flexGrow: 1 }}
        renderItem={({ item }) => <Tile item={item} size={cell} onPress={() => setViewing(item.id)} />}
        ListEmptyComponent={
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.space[6], gap: theme.space[2] }}>
            <Txt variant="title">{t('group.empty')}</Txt>
            <Txt variant="muted" center>
              {t('group.emptyHint')}
            </Txt>
          </View>
        }
      />

      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + theme.space[4], alignItems: 'center' }}
      >
        <Button
          label={progress ? t('group.sharing', { done: progress.done + 1, total: progress.total }) : t('group.share')}
          kind="primary"
          icon={ImagePlus}
          busy={progress !== null}
          disabled={!state.group.writable}
          onPress={share}
          style={{ alignSelf: 'center', elevation: 4 }}
        />
      </View>

      {inviting ? <InviteSheet state={state} onClose={() => setInviting(false)} /> : null}
      {showMembers ? <MembersSheet state={state} onClose={() => setShowMembers(false)} /> : null}
      {viewed ? <Viewer item={viewed} onClose={() => setViewing(null)} /> : null}
    </View>
  );
}

interface TileProps {
  item: Item;
  size: number;
  onPress: () => void;
}

function Tile({ item, size, onPress }: TileProps) {
  const theme = useTheme();
  const who = item.mine ? t('viewer.byYou') : t('viewer.by', { name: item.by?.name ?? '' });
  return (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel={`${item.name}. ${who}`}
      onPress={onPress}
      style={{ width: size, height: size, backgroundColor: theme.color.surface2 }}
    >
      {item.files.thumbnail ? (
        <Image source={{ uri: toUri(item.files.thumbnail) }} style={{ width: size, height: size }} />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.space[1] }}>
          <ActivityIndicator color={theme.color.textFaint} />
          <Txt variant="faint">{t('group.loading')}</Txt>
        </View>
      )}
      {item.by ? (
        <View style={{ position: 'absolute', left: theme.space[1], bottom: theme.space[1] }}>
          <Avatar person={item.by} size={22} onPhoto />
        </View>
      ) : null}
    </Pressable>
  );
}
