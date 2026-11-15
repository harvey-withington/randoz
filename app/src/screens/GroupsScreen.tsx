import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Animated, Image, PanResponder, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, GripVertical, Images, QrCode, Settings, UserRound } from 'lucide-react-native';
import { Button, IconButton } from '../components/Button';
import { ConnectionDot } from '../components/ConnectionDot';
import { SearchBox } from '../components/SearchBox';
import { Txt } from '../components/Txt';
import { plural, t } from '../i18n';
import type { Group, JoiningGroup, NodeState } from '../lib/types';
import { useShell } from '../shell/shell';
import { toUri, useNode } from '../store/node';
import { useTheme } from '../theme/theme';

interface Props {
  state: NodeState;
  /** The group that is open beside the list on a wide screen, to mark it. */
  selected?: string | null;
  onOpen: (group: string) => void;
  onStart: () => void;
  onJoin: () => void;
  onProfile: () => void;
  onPreferences: () => void;
}

/** Every row is this tall, so a dragged row knows how far one place is. */
const ROW = 104;
/** Dragging within this distance of the list's top or bottom scrolls it, this far each frame. */
const EDGE = 72;
const CREEP = 12;

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

const matches = (group: Group, search: string): boolean => {
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const text = [group.name, group.sharedName, group.description, group.sharedDescription].join(' ').toLowerCase();
  return words.every((word) => text.includes(word));
};

/**
 * Every group this phone is in or joining, and the way to start or join
 * another. The list can be searched by name and description, and put in any
 * order by dragging a row's handle.
 */
export function GroupsScreen({ state, selected, onOpen, onStart, onJoin, onProfile, onPreferences }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const node = useNode();
  const c = theme.color;
  const gap = theme.space[2];
  const step = ROW + gap;
  const [search, setSearch] = useState('');
  // The row being dragged: where it started and where it would land.
  const [drag, setDrag] = useState<{ id: string; from: number; to: number } | null>(null);
  // The order just dropped, shown until the core's state says the same.
  const [dropped, setDropped] = useState<string[] | null>(null);
  const lift = useRef(new Animated.Value(0)).current;
  // For scrolling the list while a row is dragged near its top or bottom.
  const list = useRef<ComponentRef<typeof ScrollView>>(null);
  const scroll = useRef({ y: 0, start: 0, most: 0, top: 0, bottom: 0 });
  const finger = useRef({ id: '', dy: 0, y: 0 });
  const creep = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopCreep = () => {
    if (creep.current) clearInterval(creep.current);
    creep.current = null;
  };
  useEffect(() => stopCreep, []);

  const joining = state.groups.filter((group): group is JoiningGroup => group.joining);
  const joined = state.groups.filter((group): group is Group => !group.joining);
  const ids = joined.map((group) => group.id).join();
  useEffect(() => setDropped(null), [ids]);

  const ordered = dropped
    ? [...joined].sort((a, b) => dropped.indexOf(a.id) - dropped.indexOf(b.id))
    : joined;
  const shown = ordered.filter((group) => matches(group, search));
  const sortable = search.trim() === '' && shown.length > 1;

  // How far the row has moved is how far the finger has, plus how far the
  // list has scrolled under it since the drag began.
  const place = (id: string, dy: number) => {
    const from = shown.findIndex((group) => group.id === id);
    if (from === -1) return;
    const least = -from * step;
    const most = (shown.length - 1 - from) * step;
    const by = Math.max(least, Math.min(most, dy + scroll.current.y - scroll.current.start));
    lift.setValue(by);
    const to = from + Math.round(by / step);
    setDrag((current) => (current && current.id === id && current.to === to ? current : { id, from, to }));
  };
  const placing = useRef(place);
  placing.current = place;

  const move = (id: string, dy: number, y: number) => {
    if (finger.current.id !== id) scroll.current.start = scroll.current.y; // a new drag
    finger.current = { id, dy, y };
    place(id, dy);
    // Near the top or bottom of the list: keep scrolling that way until the finger moves off.
    const way = y < scroll.current.top + EDGE ? -1 : y > scroll.current.bottom - EDGE ? 1 : 0;
    if (way === 0) return stopCreep();
    if (creep.current) return;
    creep.current = setInterval(() => {
      const edge = finger.current.y < scroll.current.top + EDGE ? -1 : 1;
      const next = Math.max(0, Math.min(scroll.current.most, scroll.current.y + edge * CREEP));
      if (next === scroll.current.y) return;
      scroll.current.y = next;
      list.current?.scrollTo({ y: next, animated: false });
      placing.current(finger.current.id, finger.current.dy);
    }, 16);
  };

  const drop = () => {
    stopCreep();
    finger.current = { id: '', dy: 0, y: 0 };
    lift.setValue(0);
    setDrag(null);
    if (!drag || drag.from === drag.to) return;
    const next = shown.map((group) => group.id);
    next.splice(drag.to, 0, ...next.splice(drag.from, 1));
    setDropped(next);
    node.call('setGroupOrder', { ids: next }).catch(() => setDropped(null));
  };

  // While one row is dragged, the rows it passes step aside by one place.
  const aside = (index: number): number => {
    if (!drag) return 0;
    if (drag.to > drag.from && index > drag.from && index <= drag.to) return -step;
    if (drag.to < drag.from && index < drag.from && index >= drag.to) return step;
    return 0;
  };

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
        <Txt variant="heading" accessibilityRole="header" numberOfLines={1} style={{ flex: 1 }}>
          {t('groups.title')}
        </Txt>
        <IconButton label={t('prefs.title')} icon={Settings} onPress={onPreferences} />
        <IconButton label={t('groups.profile')} icon={UserRound} onPress={onProfile} />
      </View>
      {joined.length > 1 ? (
        <View style={{ flexDirection: 'row', paddingHorizontal: theme.space[3], paddingBottom: theme.space[2] }}>
          <SearchBox label={t('search.groups')} value={search} onChange={setSearch} />
        </View>
      ) : null}

      <ScrollView
        ref={list}
        onScroll={(event) => {
          if (!creep.current) scroll.current.y = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        onLayout={(event) => {
          const { height } = event.nativeEvent.layout;
          list.current?.measureInWindow((_x, y) => {
            scroll.current.top = y;
            scroll.current.bottom = y + height;
          });
        }}
        onContentSizeChange={(_width, height) => {
          scroll.current.most = Math.max(0, height - (scroll.current.bottom - scroll.current.top));
        }}
        scrollEnabled={!drag}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: theme.space[3], gap }}
      >
        {joining.map((group) => (
          <JoiningRow key={group.id} group={group} />
        ))}
        {shown.map((group, index) => {
          const dragging = drag?.id === group.id;
          return (
            <Animated.View
              key={group.id}
              style={{
                zIndex: dragging ? 1 : 0,
                elevation: dragging ? 6 : 0,
                transform: [{ translateY: dragging ? lift : aside(index) }],
              }}
            >
              <GroupRow
                group={group}
                connected={state.online}
                selected={selected === group.id}
                onPress={() => onOpen(group.id)}
                onDrag={sortable ? (dy, y) => move(group.id, dy, y) : undefined}
                onDrop={drop}
              />
            </Animated.View>
          );
        })}
        {joined.length > 0 && shown.length === 0 ? (
          <Txt variant="muted" center style={{ padding: theme.space[5] }}>
            {t('search.noGroups')}
          </Txt>
        ) : null}
      </ScrollView>

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
  selected: boolean;
  onPress: () => void;
  /** Called with how far the handle has been dragged and where the finger is on the screen; absent when the list can't be reordered. */
  onDrag?: (dy: number, y: number) => void;
  onDrop: () => void;
}

function GroupRow({ group, connected, selected, onPress, onDrag, onDrop }: RowProps) {
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

  // The handle keeps hold of the drag; the newest callbacks are read through refs.
  const handlers = useRef({ onDrag, onDrop });
  handlers.current = { onDrag, onDrop };
  const handle = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (_event, gesture) => handlers.current.onDrag?.(0, gesture.y0),
        onPanResponderMove: (_event, gesture) => handlers.current.onDrag?.(gesture.dy, gesture.moveY),
        onPanResponderRelease: () => handlers.current.onDrop(),
        onPanResponderTerminate: () => handlers.current.onDrop(),
      }),
    [],
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={[group.name, group.description, counts, label].filter(Boolean).join('. ')}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space[3],
        height: ROW,
        paddingLeft: theme.space[3],
        borderRadius: theme.radius.md,
        borderWidth: selected ? 1.5 : 1,
        borderColor: selected ? c.accent : c.border,
        backgroundColor: pressed ? c.surface2 : selected ? c.accentSoft : c.surface,
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
      <View style={{ flex: 1, gap: 1 }}>
        <Txt variant="title" numberOfLines={1}>
          {group.name}
        </Txt>
        <Txt variant="muted" numberOfLines={1}>
          {group.description || counts}
        </Txt>
        {group.description ? (
          <Txt variant="faint" numberOfLines={1}>
            {counts}
          </Txt>
        ) : null}
        <ConnectionDot online={connected} label={label} />
      </View>
      {onDrag ? (
        <View
          accessibilityLabel={t('groups.reorder')}
          {...handle.panHandlers}
          style={{ width: theme.touch, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' }}
        >
          <GripVertical size={20} color={c.textFaint} />
        </View>
      ) : (
        <View style={{ width: theme.touch, alignItems: 'center' }}>
          <ChevronRight size={20} color={c.textFaint} />
        </View>
      )}
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
