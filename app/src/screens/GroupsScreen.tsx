import { ActivityIndicator, FlatList, Image, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, Images, QrCode, UserRound } from 'lucide-react-native';
import { Button, IconButton } from '../components/Button';
import { ConnectionDot } from '../components/ConnectionDot';
import { Txt } from '../components/Txt';
import { plural, t } from '../i18n';
import type { Group, JoiningGroup, NodeState } from '../lib/types';
import { useShell } from '../shell/shell';
import { toUri, useNode } from '../store/node';
import { useTheme } from '../theme/theme';

interface Props {
  state: NodeState;
  onOpen: (group: string) => void;
  onStart: () => void;
  onJoin: () => void;
  onProfile: () => void;
}

/**
 * How a group's connection reads in one line: first whether this phone is
 * connected at all, then how many of the others are.
 */
export function connectionLabel(group: Group, connected: boolean): string {
  if (!connected) return t('conn.notConnected');
  const others = group.members.filter((member) => !member.me);
  if (others.length === 0) return t('conn.alone');
  const online = others.filter((member) => member.online).length;
  return online > 0 ? t('conn.count', { online, total: others.length }) : t('conn.none');
}

/** Every group this phone is in or joining, and the way to start or join another. */
export function GroupsScreen({ state, onOpen, onStart, onJoin, onProfile }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const c = theme.color;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: theme.space[4],
          paddingRight: theme.space[2],
          paddingVertical: theme.space[2],
        }}
      >
        <Txt variant="heading" accessibilityRole="header" style={{ flex: 1 }}>
          {t('groups.title')}
        </Txt>
        <IconButton
          label={t('groups.profile')}
          icon={UserRound}
          onPress={onProfile}
        />
      </View>

      <FlatList
        data={state.groups}
        keyExtractor={(group) => group.id}
        contentContainerStyle={{ padding: theme.space[3], gap: theme.space[2] }}
        renderItem={({ item }) =>
          item.joining ? (
            <JoiningRow group={item} />
          ) : (
            <GroupRow group={item} connected={state.online} onPress={() => onOpen(item.id)} />
          )
        }
      />

      <View
        style={{
          flexDirection: 'row',
          gap: theme.space[2],
          paddingHorizontal: theme.space[3],
          paddingTop: theme.space[3],
          paddingBottom: insets.bottom + theme.space[4],
          borderTopWidth: 1,
          borderTopColor: c.border,
          backgroundColor: c.surface,
        }}
      >
        <Button label={t('home.start')} kind="primary" icon={Images} onPress={onStart} style={{ flex: 1 }} />
        <Button label={t('home.join')} icon={QrCode} onPress={onJoin} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

interface RowProps {
  group: Group;
  /** Whether this phone is connected to the network. */
  connected: boolean;
  onPress: () => void;
}

function GroupRow({ group, connected, onPress }: RowProps) {
  const theme = useTheme();
  const c = theme.color;
  const latest = [...group.items].reverse().find((item) => item.files.thumbnail);
  const counts = `${plural(group.members.length, 'groups.peopleOne', 'groups.people')} · ${plural(
    group.items.length,
    'groups.photosOne',
    'groups.photos',
    'groups.photosNone',
  )}`;
  const label = connectionLabel(group, connected);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${group.name}. ${counts}. ${label}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space[3],
        padding: theme.space[3],
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: pressed ? c.surface2 : c.surface,
      })}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: theme.radius.sm,
          overflow: 'hidden',
          backgroundColor: c.surface3,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {latest?.files.thumbnail ? (
          <Image source={{ uri: toUri(latest.files.thumbnail) }} style={{ width: 56, height: 56 }} />
        ) : (
          <Images size={24} color={c.textFaint} />
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="title" numberOfLines={1}>
          {group.name}
        </Txt>
        <Txt variant="muted" numberOfLines={1}>
          {counts}
        </Txt>
        <ConnectionDot online={connected} label={label} />
      </View>
      <ChevronRight size={20} color={c.textFaint} />
    </Pressable>
  );
}

interface JoiningProps {
  group: JoiningGroup;
}

/** A group this phone is still getting into: what is happening, and the way to give up. */
function JoiningRow({ group }: JoiningProps) {
  const theme = useTheme();
  const node = useNode();
  const shell = useShell();
  const c = theme.color;
  const refused = group.joinError !== '';
  const stop = () => {
    node.call('leaveGroup', { group: group.id }).catch((err: Error) => shell.toast(err.message, 'error'));
  };
  return (
    <View
      style={{
        gap: theme.space[2],
        padding: theme.space[3],
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: refused ? c.danger : c.border,
        backgroundColor: c.surface,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
        {refused ? null : <ActivityIndicator color={c.accent} />}
        <View style={{ flex: 1 }}>
          <Txt variant="title">{t('groups.joining')}</Txt>
          <Txt variant="muted" color={refused ? c.danger : undefined}>
            {t(refused ? 'groups.refused' : 'groups.joiningHint')}
          </Txt>
        </View>
      </View>
      <Button label={t(refused ? 'groups.remove' : 'groups.stop')} onPress={stop} style={{ alignSelf: 'flex-end' }} />
    </View>
  );
}
