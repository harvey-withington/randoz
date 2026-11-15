import { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Ban, ChevronDown, ChevronUp, Download, EyeOff, Info, Pencil } from 'lucide-react-native';
import { Avatar } from '../components/Avatar';
import { Button, IconButton } from '../components/Button';
import { Tags } from '../components/Tags';
import { Txt } from '../components/Txt';
import { ZoomImage } from '../components/ZoomImage';
import { t } from '../i18n';
import { labelOf, sizeLabel } from '../lib/gallery';
import { saveToCameraRoll } from '../lib/save';
import type { Group, Item, ViewerInfo } from '../lib/types';
import { useShell } from '../shell/shell';
import { toUri, useNode } from '../store/node';
import { useTheme } from '../theme/theme';
import { DetailsSheet } from './DetailsSheet';

interface Props {
  group: Group;
  item: Item;
  /** Whether this phone is connected to anyone in the group. */
  connected: boolean;
  /** Shows the photo after (1) or before (-1) this one. */
  onStep: (by: 1 | -1) => void;
  onClose: () => void;
}

/**
 * One photo, full screen, which can be pinched to zoom. A swipe left or right
 * goes to the next or previous photo. No swipe or pinch closes it: Back and
 * the arrow do. Shows the thumbnail
 * at once and swaps in the preview when it arrives; the original is fetched
 * only to save it. Above the photo is what is known about it, in full, as
 * one line, or not at all: the user's choice, remembered.
 *
 * It is a layer over the gallery, not a system dialog, so toasts show above
 * it. Back closes it.
 */
export function Viewer({ group, item, connected, onStep, onClose }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const node = useNode();
  const shell = useShell();
  const c = theme.color;
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const info: ViewerInfo = node.state?.settings.viewerInfo ?? 'full';
  const best = item.files.preview ?? item.files.original ?? item.files.thumbnail;
  const sharp = item.files.preview !== null || item.files.original !== null;
  const { id } = item;
  // The full-size photo comes from its owner, or from anyone who has fetched it.
  const ownerOnline = item.mine || item.by?.online === true;
  const cantSave = item.files.original === null && !connected;
  const sharer = group.members.find((member) => member.key === item.sharedBy);
  const who = item.mine ? t('viewer.byYou') : t('viewer.by', { name: item.by?.name ?? '' });
  const status = item.mine ? '' : t(ownerOnline ? 'conn.online' : 'conn.offline');
  const when = new Date(item.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  useEffect(() => {
    if (sharp) return;
    let stale = false;
    node.call('getTier', { group: group.id, id, tier: 'preview' }).catch(() => {
      if (!stale) setFailed(true);
    });
    return () => {
      stale = true;
    };
  }, [group.id, id, sharp, node]);

  useEffect(() => {
    const held = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => held.remove();
  }, [onClose]);

  const show = (next: ViewerInfo) => {
    node.call('setSettings', { viewerInfo: next }).catch(() => {});
  };

  const save = async () => {
    setSaving(true);
    try {
      const granted = await saveToCameraRoll(node, group.id, [item]);
      shell.toast(t(granted ? 'select.savedOne' : 'viewer.saveDenied'), granted ? 'success' : 'error');
    } catch (err) {
      shell.toast(t('viewer.saveFailed', { reason: (err as Error).message }), 'error');
    } finally {
      setSaving(false);
    }
  };

  // Something you would rather not see: one step from the photo to never
  // seeing its sharer again in this group.
  const block = async () => {
    const name = item.by?.name ?? '';
    const ok = await shell.confirm({
      title: t('block.title', { name }),
      message: t('block.message'),
      confirmLabel: t('block.confirm'),
      danger: true,
    });
    if (!ok) return;
    try {
      await node.call('setBlocked', { group: group.id, member: item.sharedBy, blocked: true });
      shell.toast(t('block.done', { name }), 'info');
      onClose();
    } catch (err) {
      shell.toast(t('block.failed', { reason: (err as Error).message }), 'error');
    }
  };

  const unshare = async () => {
    const ok = await shell.confirm({
      title: t('select.confirmUnshareTitleOne'),
      message: t('viewer.confirmUnshareMessage'),
      confirmLabel: t('viewer.unshare'),
      danger: true,
    });
    if (!ok) return;
    try {
      await node.call('unshareItems', { group: group.id, ids: [id] });
      shell.toast(t('select.unsharedOne'), 'info');
      onClose();
    } catch (err) {
      shell.toast(t('select.unshareFailed', { reason: (err as Error).message }), 'error');
    }
  };

  return (
    <View
      accessibilityViewIsModal
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        backgroundColor: c.bg,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[1], padding: theme.space[2] }}>
        <IconButton label={t('common.back')} icon={ArrowLeft} onPress={onClose} />
        {/* The one-line summary: whose it is (their dot says if they are connected) and what it is. */}
        <View
          accessible
          accessibilityLabel={[labelOf(item), who, status].filter(Boolean).join('. ')}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}
        >
          {info === 'line' && item.by ? <Avatar person={item.by} size={28} /> : null}
          {info === 'line' ? (
            <Txt numberOfLines={1} style={{ flex: 1 }}>
              {item.title ? `${item.title} · ${who}` : who}
            </Txt>
          ) : null}
        </View>
        <IconButton label={t('details.edit')} icon={Pencil} onPress={() => setEditing(true)} />
        {info === 'hidden' ? (
          <IconButton label={t('viewer.showInfo')} icon={Info} onPress={() => show('full')} />
        ) : (
          <IconButton
            label={t(info === 'full' ? 'viewer.lessInfo' : 'viewer.moreInfo')}
            icon={info === 'full' ? ChevronUp : ChevronDown}
            onPress={() => show(info === 'full' ? 'line' : 'full')}
          />
        )}
      </View>

      {info === 'full' ? (
        <View
          style={{
            gap: theme.space[2],
            paddingHorizontal: theme.space[4],
            paddingBottom: theme.space[3],
            borderBottomWidth: 1,
            borderBottomColor: c.border,
          }}
        >
          <Txt variant="title">{labelOf(item)}</Txt>
          {item.description ? <Txt>{item.description}</Txt> : null}
          <Tags tags={item.tags} mine={item.myTags} />
          <View
            accessible
            accessibilityLabel={[who, status, sharer?.about].filter(Boolean).join('. ')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}
          >
            {item.by ? <Avatar person={item.by} size={40} /> : null}
            <View style={{ flex: 1 }}>
              <Txt numberOfLines={1}>{who}</Txt>
              {sharer?.about ? (
                <Txt variant="muted" numberOfLines={2}>
                  {sharer.about}
                </Txt>
              ) : null}
              <Txt variant="faint" numberOfLines={1}>
                {[when, sizeLabel(item.size), `${item.width} × ${item.height}`].join(' · ')}
              </Txt>
            </View>
          </View>
        </View>
      ) : null}

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        {best ? <ZoomImage key={best} uri={toUri(best)} label={labelOf(item)} onSwipe={onStep} /> : null}
        {!sharp ? (
          <View
            style={{
              position: 'absolute',
              bottom: theme.space[4],
              flexDirection: 'row',
              gap: theme.space[2],
              alignItems: 'center',
              paddingHorizontal: theme.space[3],
              paddingVertical: theme.space[2],
              borderRadius: theme.radius.md,
              backgroundColor: c.surface,
              borderWidth: 1,
              borderColor: failed ? c.danger : c.border,
              marginHorizontal: theme.space[4],
            }}
          >
            {failed ? null : <ActivityIndicator size="small" color={c.accent} />}
            <Txt variant="muted" color={failed ? c.danger : undefined} style={{ flexShrink: 1 }}>
              {t(failed ? 'viewer.loadFailed' : connected ? 'viewer.loading' : 'viewer.waiting')}
            </Txt>
          </View>
        ) : null}
      </View>

      {cantSave && !saving ? (
        <Txt variant="muted" center style={{ paddingHorizontal: theme.space[4], paddingTop: theme.space[3] }}>
          {t('viewer.cantSave')}
        </Txt>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: theme.space[2],
          justifyContent: 'center',
          padding: theme.space[4],
        }}
      >
        <Button
          label={
            saving
              ? item.files.original === null && !ownerOnline
                ? t('viewer.savingWaiting', { name: item.by?.name ?? '' })
                : t('viewer.saving')
              : t(item.saved ? 'viewer.saveAgain' : 'viewer.save')
          }
          icon={Download}
          kind={item.saved ? 'default' : 'primary'}
          busy={saving}
          disabled={cantSave && !saving}
          onPress={save}
        />
        {item.mine ? (
          <Button label={t('viewer.unshare')} icon={EyeOff} kind="danger" onPress={unshare} />
        ) : (
          <Button label={t('block.actionNamed', { name: item.by?.name ?? '' })} icon={Ban} kind="ghost" onPress={block} />
        )}
      </View>

      {editing ? <DetailsSheet group={group} item={item} onClose={() => setEditing(false)} /> : null}
    </View>
  );
}
