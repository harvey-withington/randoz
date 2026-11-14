import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Share, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { Copy, Link2, MapPin, Send, ShieldOff } from 'lucide-react-native';
import { Button } from '../components/Button';
import { Sheet } from '../components/Sheet';
import { Txt } from '../components/Txt';
import { t } from '../i18n';
import type { InGroupState } from '../lib/types';
import { useShell } from '../shell/shell';
import { useNode } from '../store/node';
import { useTheme } from '../theme/theme';

interface Props {
  state: InGroupState;
  onClose: () => void;
}

/**
 * Shows an invite as a QR code and a link. A group has one shareable invite
 * at a time: this shows the one that exists, or makes one.
 */
export function InviteSheet({ state, onClose }: Props) {
  const theme = useTheme();
  const node = useNode();
  const shell = useShell();
  const c = theme.color;
  const invite = state.invites.find((i) => i.kind === 'open');
  const [making, setMaking] = useState(false);
  const asked = useRef(false);

  useEffect(() => {
    if (invite || asked.current || !state.group.writable) return;
    asked.current = true;
    setMaking(true);
    node
      .call('createInvite', { kind: 'open' })
      .catch((err: Error) => shell.toast(t('invite.failed', { reason: err.message }), 'error'))
      .finally(() => setMaking(false));
  }, [invite, state.group.writable, node, shell]);

  const copy = async () => {
    if (!invite) return;
    await Clipboard.setStringAsync(invite.code);
    shell.toast(t('invite.copied'), 'success');
  };

  const send = () => {
    if (!invite) return;
    Share.share({ message: t('invite.shareMessage', { group: state.group.name, link: invite.code }) }).catch(() => {});
  };

  const turnOff = async () => {
    if (!invite) return;
    const ok = await shell.confirm({
      title: t('invite.confirmOffTitle'),
      message: t('invite.confirmOffMessage'),
      confirmLabel: t('invite.confirmOff'),
      danger: true,
    });
    if (!ok) return;
    await node.call('revokeInvite', { id: invite.id });
    shell.toast(t('invite.turnedOff'), 'info');
    onClose();
  };

  return (
    <Sheet title={t('invite.title')} onClose={onClose}>
      <Kind icon={Link2} title={t('invite.kindOpen')} hint={t('invite.kindOpenHint')} selected />
      <Kind icon={MapPin} title={t('invite.kindInPerson')} hint={t('invite.kindInPersonHint')} />

      <View style={{ alignItems: 'center', gap: theme.space[3] }}>
        <View
          style={{
            padding: theme.space[4],
            borderRadius: theme.radius.lg,
            backgroundColor: c.qrGround,
            width: 232,
            height: 232,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {invite ? (
            <QRCode value={invite.code} size={200} color={c.qrInk} backgroundColor={c.qrGround} />
          ) : (
            <ActivityIndicator color={c.qrInk} />
          )}
        </View>
        <Txt variant="muted" center>
          {invite ? t('invite.scanMe') : making ? t('invite.making') : t('group.joiningAs')}
        </Txt>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2], justifyContent: 'center' }}>
        <Button label={t('invite.shareLink')} icon={Send} kind="primary" disabled={!invite} onPress={send} />
        <Button label={t('invite.copy')} icon={Copy} disabled={!invite} onPress={copy} />
      </View>
      {invite?.mine ? (
        <Button
          label={t('invite.turnOff')}
          icon={ShieldOff}
          kind="danger"
          onPress={turnOff}
          style={{ alignSelf: 'center' }}
        />
      ) : null}
    </Sheet>
  );
}

interface KindProps {
  icon: typeof Link2;
  title: string;
  hint: string;
  selected?: boolean;
}

/** One kind of invite. Only the selected kind exists yet; the other is described. */
function Kind({ icon: Icon, title, hint, selected }: KindProps) {
  const theme = useTheme();
  const c = theme.color;
  return (
    <View
      accessibilityRole="radio"
      accessibilityState={{ selected: !!selected, disabled: !selected }}
      style={{
        flexDirection: 'row',
        gap: theme.space[3],
        padding: theme.space[3],
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: selected ? c.accent : c.border,
        backgroundColor: selected ? c.accentSoft : 'transparent',
        opacity: selected ? 1 : 0.6,
      }}
    >
      <Icon size={20} color={selected ? c.accent : c.textMuted} />
      <View style={{ flex: 1, gap: theme.space[1] }}>
        <Txt style={{ fontFamily: theme.font.medium }}>{title}</Txt>
        <Txt variant="muted">{hint}</Txt>
      </View>
    </View>
  );
}
