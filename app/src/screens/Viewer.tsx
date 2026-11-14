import { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, Image, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Download, EyeOff } from 'lucide-react-native';
import { Avatar } from '../components/Avatar';
import { Button, IconButton } from '../components/Button';
import { Txt } from '../components/Txt';
import { t } from '../i18n';
import { saveToCameraRoll } from '../lib/save';
import type { Item } from '../lib/types';
import { useShell } from '../shell/shell';
import { toUri, useNode } from '../store/node';
import { useTheme } from '../theme/theme';

interface Props {
  /** The id of the group the photo is in. */
  group: string;
  item: Item;
  onClose: () => void;
}

/**
 * One photo, full screen. Shows the thumbnail at once and swaps in the
 * preview when it arrives; the original is fetched only to save it.
 *
 * It is a layer over the gallery, not a system dialog, so toasts show above
 * it. Back closes it.
 */
export function Viewer({ group, item, onClose }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const node = useNode();
  const shell = useShell();
  const c = theme.color;
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const best = item.files.preview ?? item.files.original ?? item.files.thumbnail;
  const sharp = item.files.preview !== null || item.files.original !== null;
  const { id } = item;

  useEffect(() => {
    if (sharp) return;
    let stale = false;
    node.call('getTier', { group, id, tier: 'preview' }).catch(() => {
      if (!stale) setFailed(true);
    });
    return () => {
      stale = true;
    };
  }, [group, id, sharp, node]);

  useEffect(() => {
    const held = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => held.remove();
  }, [onClose]);

  const save = async () => {
    setSaving(true);
    try {
      const granted = await saveToCameraRoll(node, group, [item]);
      shell.toast(t(granted ? 'select.savedOne' : 'viewer.saveDenied'), granted ? 'success' : 'error');
    } catch (err) {
      shell.toast(t('viewer.saveFailed', { reason: (err as Error).message }), 'error');
    } finally {
      setSaving(false);
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
      await node.call('unshareItems', { group, ids: [id] });
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2], padding: theme.space[2] }}>
        <IconButton label={t('common.back')} icon={ArrowLeft} onPress={onClose} />
        {item.by ? <Avatar person={item.by} size={28} /> : null}
        <Txt style={{ flex: 1 }} numberOfLines={1}>
          {item.mine ? t('viewer.byYou') : t('viewer.by', { name: item.by?.name ?? '' })}
        </Txt>
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        {best ? (
          <Image
            accessibilityLabel={item.name}
            source={{ uri: toUri(best) }}
            resizeMode="contain"
            style={{ width: '100%', height: '100%' }}
          />
        ) : null}
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
              {t(failed ? 'viewer.loadFailed' : 'viewer.loading')}
            </Txt>
          </View>
        ) : null}
      </View>

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
          label={saving ? t('viewer.saving') : t(item.saved ? 'viewer.saveAgain' : 'viewer.save')}
          icon={Download}
          kind={item.saved ? 'default' : 'primary'}
          busy={saving}
          onPress={save}
        />
        {item.mine ? <Button label={t('viewer.unshare')} icon={EyeOff} kind="danger" onPress={unshare} /> : null}
      </View>
    </View>
  );
}
