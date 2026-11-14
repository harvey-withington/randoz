import { useEffect, useState } from 'react';
import { BackHandler, FlatList, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Download, EyeOff, ImagePlus, UserPlus, Users, X } from 'lucide-react-native';
import { Button, IconButton } from '../components/Button';
import { ConnectionDot } from '../components/ConnectionDot';
import { Txt } from '../components/Txt';
import { plural, t } from '../i18n';
import { pickPhotos, prepare } from '../lib/photos';
import { saveToCameraRoll } from '../lib/save';
import type { Group } from '../lib/types';
import { useShell } from '../shell/shell';
import { useNode } from '../store/node';
import { useTheme } from '../theme/theme';
import { connectionLabel } from './GroupsScreen';
import { InviteSheet } from './InviteSheet';
import { MembersSheet } from './MembersSheet';
import { PhotoTile } from './PhotoTile';
import { Viewer } from './Viewer';

interface Props {
  group: Group;
  onBack: () => void;
}

const COLUMNS = 3;

/**
 * One group: who you are in it, who's online, and everyone's photos. A long
 * press on a photo starts selecting, to save or unshare several at once.
 */
export function GroupScreen({ group, onBack }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const node = useNode();
  const shell = useShell();
  const { width } = useWindowDimensions();
  const [inviting, setInviting] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<string | null>(null);
  const c = theme.color;
  const gap = theme.space[1];
  const cell = (width - gap * (COLUMNS - 1)) / COLUMNS;
  // Newest first, as a camera roll shows them.
  const items = [...group.items].reverse();
  const viewed = viewing ? group.items.find((item) => item.id === viewing) : undefined;
  // Photos unshared by someone else drop out of the selection.
  const chosen = group.items.filter((item) => selected.has(item.id));
  const selecting = selected.size > 0;
  // Connected to the network at all, and to anyone in this group.
  const connected = node.state?.online ?? false;
  const online = group.members.some((member) => member.online && !member.me);

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

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  };

  const share = async () => {
    try {
      const photos = await pickPhotos();
      if (photos.length === 0) return;
      if (node.state?.settings.shareReminder !== false) {
        const ok = await shell.confirm({
          title: photos.length === 1 ? t('confirmShare.titleOne') : t('confirmShare.title', { count: photos.length }),
          message: t('confirmShare.message', { group: group.name }),
          confirmLabel: t('confirmShare.confirm'),
          optOut: t('confirmShare.optOut'),
          onOptOut: () => {
            node.call('setSettings', { shareReminder: false }).catch(() => {});
          },
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

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: theme.touch + theme.space[4],
          paddingHorizontal: theme.space[1],
          paddingVertical: theme.space[2],
          borderBottomWidth: 1,
          borderBottomColor: c.border,
          backgroundColor: c.surface,
        }}
      >
        {selecting ? (
          <>
            <IconButton label={t('select.cancel')} icon={X} onPress={() => setSelected(new Set())} />
            <Txt variant="title" style={{ flex: 1, marginLeft: theme.space[2] }} accessibilityLiveRegion="polite">
              {t('select.count', { count: chosen.length })}
            </Txt>
            <IconButton label={t('select.save')} icon={Download} disabled={progress !== null} onPress={saveSelected} />
            <IconButton
              label={t('select.unshare')}
              icon={EyeOff}
              color={c.danger}
              disabled={progress !== null}
              onPress={unshareSelected}
            />
          </>
        ) : (
          <>
            <IconButton label={t('group.back')} icon={ArrowLeft} onPress={onBack} />
            <View style={{ flex: 1, marginLeft: theme.space[1] }}>
              <Txt variant="title" numberOfLines={1} accessibilityRole="header">
                {group.name}
              </Txt>
              <Txt variant="muted" numberOfLines={1}>
                {group.writable ? t('group.you', { name: group.me.name }) : t('group.joiningAs')}
              </Txt>
              <ConnectionDot online={connected} label={connectionLabel(group, connected)} />
            </View>
            <IconButton label={t('group.invite')} icon={UserPlus} onPress={() => setInviting(true)} />
            <IconButton
              label={`${t('members.open')}: ${plural(group.members.length, 'groups.peopleOne', 'groups.people')}`}
              icon={Users}
              onPress={() => setShowMembers(true)}
            />
          </>
        )}
      </View>

      <FlatList
        // Hidden from screen readers while the viewer covers it.
        importantForAccessibility={viewed ? 'no-hide-descendants' : 'auto'}
        data={items}
        extraData={selected}
        keyExtractor={(item) => item.id}
        numColumns={COLUMNS}
        columnWrapperStyle={{ gap }}
        contentContainerStyle={{ gap, paddingBottom: insets.bottom + theme.touch + theme.space[6], flexGrow: 1 }}
        renderItem={({ item }) => (
          <PhotoTile
            item={item}
            size={cell}
            selecting={selecting}
            selected={selected.has(item.id)}
            onPress={() => (selecting ? toggle(item.id) : setViewing(item.id))}
            onLongPress={() => toggle(item.id)}
          />
        )}
        ListEmptyComponent={
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.space[6], gap: theme.space[2] }}>
            <Txt variant="title">{t('group.empty')}</Txt>
            <Txt variant="muted" center>
              {t('group.emptyHint')}
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

      {inviting ? <InviteSheet group={group} onClose={() => setInviting(false)} /> : null}
      {showMembers ? <MembersSheet group={group} onClose={() => setShowMembers(false)} /> : null}
      {viewed ? <Viewer group={group.id} item={viewed} connected={online} onClose={() => setViewing(null)} /> : null}
    </View>
  );
}
