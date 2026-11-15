import { useEffect, useMemo, useState } from 'react';
import { BackHandler, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Download,
  EyeOff,
  ImagePlus,
  SlidersHorizontal,
  UserPlus,
  Users,
  X,
} from 'lucide-react-native';
import { Button, IconButton } from '../components/Button';
import { ConnectionDot } from '../components/ConnectionDot';
import { SearchBox } from '../components/SearchBox';
import { Txt } from '../components/Txt';
import { plural, t } from '../i18n';
import { arrange, flatten, tagHue } from '../lib/gallery';
import { pickPhotos, prepare } from '../lib/photos';
import { saveToCameraRoll } from '../lib/save';
import { useBackSwipe } from '../lib/swipe';
import type { Group, Sort } from '../lib/types';
import { useShell } from '../shell/shell';
import { useNode } from '../store/node';
import { useTheme } from '../theme/theme';
import { Gallery } from './Gallery';
import { GroupDetailsSheet } from './GroupDetailsSheet';
import { connectionLabel } from './GroupsScreen';
import { InviteSheet } from './InviteSheet';
import { MembersSheet } from './MembersSheet';
import { Chip, ViewSheet } from './ViewSheet';
import { Viewer } from './Viewer';

interface Props {
  group: Group;
  onBack: () => void;
  /** Beside the group list on a wide screen, where there is no need for a way back. */
  beside?: boolean;
}

type Open = 'invite' | 'members' | 'view' | 'details' | null;

/**
 * One group: who you are in it, who's online, and everyone's photos, which
 * can be searched, filtered, grouped, sorted and laid out three ways. The
 * top of the screen folds down to one line to leave more room for them. A
 * long press on a photo starts selecting, to save or unshare several at once.
 */
export function GroupScreen({ group, onBack, beside }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const node = useNode();
  const shell = useShell();
  const c = theme.color;
  const settings = node.state?.settings;
  const [width, setWidth] = useState(0);
  const [open, setOpen] = useState<Open>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [person, setPerson] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);

  const sort = settings?.sort ?? 'date';
  const reverse = settings?.sortReverse ?? false;
  const folded = settings?.groupHeader === 'line';
  const sections = useMemo(
    () =>
      arrange(group.items, { search, person, tags, sort, reverse, groupBy: settings?.groupBy ?? 'none' }, t('tags.none')),
    [group.items, search, person, tags, sort, reverse, settings?.groupBy],
  );
  const shown = useMemo(() => flatten(sections), [sections]);
  const filtered = search.trim() !== '' || person !== null || tags.length > 0;
  const viewed = viewing ? group.items.find((item) => item.id === viewing) : undefined;
  // Photos unshared by someone else drop out of the selection.
  const chosen = group.items.filter((item) => selected.has(item.id));
  const selecting = selected.size > 0;
  // Connected to the network at all, and to anyone in this group.
  const connected = node.state?.online ?? false;
  const online = group.members.some((member) => member.online && !member.me);
  const filterPerson = group.members.find((member) => member.key === person);
  const swipe = useBackSwipe(onBack, !beside && !viewed);

  // Back closes the top layer: the selection first, then the group.
  useEffect(() => {
    if (viewed) return; // the viewer holds Back while it is open
    const held = BackHandler.addEventListener('hardwareBackPress', () => {
      if (selected.size > 0) setSelected(new Set());
      else onBack();
      return true;
    });
    return () => held.remove();
  }, [viewed, selected, onBack]);

  const set = (change: Parameters<typeof node.call<'setSettings'>>[1]) => {
    node.call('setSettings', change).catch(() => {});
  };

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  };

  // Every photo on show (after search and filters), or none if they all are already.
  const selectAll = () => {
    const all = shown.every((item) => selected.has(item.id));
    setSelected(all ? new Set() : new Set(shown.map((item) => item.id)));
  };

  // The photo before or after the one being viewed, in the order on show.
  const step = (by: number) => {
    const at = shown.findIndex((item) => item.id === viewing);
    const next = shown[at + by];
    if (at !== -1 && next) setViewing(next.id);
  };

  const share = async () => {
    try {
      const photos = await pickPhotos();
      if (photos.length === 0) return;
      if (settings?.shareReminder !== false) {
        const ok = await shell.confirm({
          title: photos.length === 1 ? t('confirmShare.titleOne') : t('confirmShare.title', { count: photos.length }),
          message: t('confirmShare.message', { group: group.name }),
          confirmLabel: t('confirmShare.confirm'),
          optOut: t('confirmShare.optOut'),
          onOptOut: () => set({ shareReminder: false }),
        });
        if (!ok) return;
      }
      for (let done = 0; done < photos.length; done++) {
        setProgress(t('group.sharing', { done: done + 1, total: photos.length }));
        await node.call('shareItem', { group: group.id, ...(await prepare(photos[done])) });
      }
      shell.toast(plural(photos.length, 'group.sharedOne', 'group.shared'), 'success');
    } catch (err) {
      shell.toast(t('group.shareFailed', { reason: (err as Error).message }), 'error');
    } finally {
      setProgress(null);
    }
  };

  const saveSelected = async () => {
    try {
      const granted = await saveToCameraRoll(node, group.id, chosen, (done, total) =>
        setProgress(t('select.saving', { done: done + 1, total })),
      );
      if (!granted) shell.toast(t('viewer.saveDenied'), 'error');
      else {
        shell.toast(plural(chosen.length, 'select.savedOne', 'select.saved'), 'success');
        setSelected(new Set());
      }
    } catch (err) {
      shell.toast(t('viewer.saveFailed', { reason: (err as Error).message }), 'error');
    } finally {
      setProgress(null);
    }
  };

  const unshareSelected = async () => {
    if (chosen.some((item) => !item.mine)) {
      shell.toast(t('select.notAllYours'), 'info');
      return;
    }
    const ok = await shell.confirm({
      title:
        chosen.length === 1
          ? t('select.confirmUnshareTitleOne')
          : t('select.confirmUnshareTitle', { count: chosen.length }),
      message: t('viewer.confirmUnshareMessage'),
      confirmLabel: t('select.unshare'),
      danger: true,
    });
    if (!ok) return;
    try {
      await node.call('unshareItems', { group: group.id, ids: chosen.map((item) => item.id) });
      shell.toast(plural(chosen.length, 'select.unsharedOne', 'select.unshared'), 'info');
      setSelected(new Set());
    } catch (err) {
      shell.toast(t('select.unshareFailed', { reason: (err as Error).message }), 'error');
    }
  };

  const bar = {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.space[1],
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    backgroundColor: c.surface,
  } as const;
  const back = beside ? (
    <View style={{ width: theme.space[3] }} />
  ) : (
    <IconButton label={t('group.back')} icon={ArrowLeft} onPress={onBack} />
  );
  const viewButton = (
    <IconButton
      label={t('view.title')}
      icon={SlidersHorizontal}
      color={person !== null || tags.length > 0 ? c.accent : undefined}
      onPress={() => setOpen('view')}
    />
  );
  const showing = t('filter.showing', { shown: shown.length, total: group.items.length });

  return (
    <View
      style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      {...swipe}
    >
      <View style={[bar, { minHeight: theme.touch + (folded ? 0 : theme.space[4]), paddingVertical: folded ? 0 : theme.space[2] }]}>
        {selecting ? (
          <>
            <IconButton label={t('select.cancel')} icon={X} onPress={() => setSelected(new Set())} />
            <Txt variant="title" style={{ flex: 1, marginLeft: theme.space[2] }} accessibilityLiveRegion="polite">
              {t('select.count', { count: chosen.length })}
            </Txt>
            <IconButton label={t('select.all')} icon={CheckCheck} onPress={selectAll} />
            <IconButton label={t('select.save')} icon={Download} disabled={progress !== null} onPress={saveSelected} />
            <IconButton
              label={t('select.unshare')}
              icon={EyeOff}
              color={c.danger}
              disabled={progress !== null}
              onPress={unshareSelected}
            />
          </>
        ) : folded ? (
          <>
            {back}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${group.name}. ${connectionLabel(group, connected)}. ${t('groupDetails.title')}`}
              onPress={() => setOpen('details')}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.space[2], marginLeft: theme.space[1] }}
            >
              <ConnectionDot online={connected} label="" />
              <Txt variant="title" numberOfLines={1} accessibilityRole="header" style={{ flexShrink: 1 }}>
                {group.name}
              </Txt>
              {filtered ? (
                <Txt variant="faint" numberOfLines={1}>
                  {showing}
                </Txt>
              ) : null}
            </Pressable>
            {viewButton}
            <IconButton label={t('group.unfold')} icon={ChevronDown} onPress={() => set({ groupHeader: 'full' })} />
          </>
        ) : (
          <>
            {back}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${group.name}. ${t('groupDetails.title')}`}
              onPress={() => setOpen('details')}
              style={{ flex: 1, marginLeft: theme.space[1] }}
            >
              <Txt variant="title" numberOfLines={1} accessibilityRole="header">
                {group.name}
              </Txt>
              <Txt variant="muted" numberOfLines={1}>
                {group.writable ? t('group.you', { name: group.me.name }) : t('group.joiningAs')}
              </Txt>
              <ConnectionDot online={connected} label={connectionLabel(group, connected)} />
            </Pressable>
            <IconButton label={t('group.invite')} icon={UserPlus} onPress={() => setOpen('invite')} />
            <IconButton
              label={`${t('members.open')}: ${plural(group.members.length, 'groups.peopleOne', 'groups.people')}`}
              icon={Users}
              onPress={() => setOpen('members')}
            />
            <IconButton label={t('group.fold')} icon={ChevronUp} onPress={() => set({ groupHeader: 'line' })} />
          </>
        )}
      </View>

      {!folded && group.items.length > 0 ? (
        <View style={[bar, { gap: theme.space[1], paddingLeft: theme.space[3], paddingVertical: theme.space[2] }]}>
          <SearchBox label={t('search.photos')} value={search} onChange={setSearch} />
          {viewButton}
        </View>
      ) : null}
      {!folded && (person !== null || tags.length > 0) ? (
        <View style={[bar, { flexWrap: 'wrap', gap: theme.space[2], padding: theme.space[2] }]}>
          {filterPerson ? <Chip label={filterPerson.name} chosen onPress={() => setPerson(null)} /> : null}
          {tags.map((tag) => (
            <Chip
              key={tag}
              label={'#' + tag}
              hue={tagHue(tag)}
              chosen
              onPress={() => setTags(tags.filter((one) => one !== tag))}
            />
          ))}
          <Txt variant="faint">{showing}</Txt>
        </View>
      ) : null}

      <Gallery
        sections={sections}
        view={settings?.view ?? 'large'}
        sort={sort}
        reverse={reverse}
        width={width}
        selecting={selecting}
        selected={selected}
        onOpen={setViewing}
        onToggle={toggle}
        onSort={(next: Sort, turned: boolean) => set({ sort: next, sortReverse: turned })}
        bottomSpace={insets.bottom + theme.touch + theme.space[6]}
        hidden={viewed !== undefined}
        empty={
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.space[6], gap: theme.space[2] }}>
            <Txt variant="title">{t(filtered ? 'filter.nothing' : 'group.empty')}</Txt>
            <Txt variant="muted" center>
              {t(filtered ? 'filter.nothingHint' : 'group.emptyHint')}
            </Txt>
          </View>
        }
      />

      {selecting && progress === null ? null : (
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + theme.space[4], alignItems: 'center' }}
        >
          <Button
            label={progress ?? t('group.share')}
            kind="primary"
            icon={ImagePlus}
            busy={progress !== null}
            disabled={!group.writable}
            onPress={share}
            style={{ alignSelf: 'center', elevation: 4 }}
          />
        </View>
      )}

      {open === 'invite' ? <InviteSheet group={group} onClose={() => setOpen(null)} /> : null}
      {open === 'members' ? <MembersSheet group={group} onClose={() => setOpen(null)} /> : null}
      {open === 'details' ? <GroupDetailsSheet group={group} onClose={() => setOpen(null)} /> : null}
      {open === 'view' ? (
        <ViewSheet group={group} person={person} tags={tags} onPerson={setPerson} onTags={setTags} onClose={() => setOpen(null)} />
      ) : null}
      {viewed ? (
        <Viewer
          group={group}
          item={viewed}
          connected={online}
          swipeBack={!beside}
          onStep={step}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </View>
  );
}
