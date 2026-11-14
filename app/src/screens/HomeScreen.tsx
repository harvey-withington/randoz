import { useState } from 'react';
import { ActivityIndicator, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Images, QrCode } from 'lucide-react-native';
import { Button } from '../components/Button';
import { Sheet } from '../components/Sheet';
import { Txt } from '../components/Txt';
import { t } from '../i18n';
import { useShell } from '../shell/shell';
import { useNode } from '../store/node';
import { useTheme } from '../theme/theme';
import { JoinSheet } from './JoinSheet';

/** What you see when you aren't in a group: start one, or join one. */
export function HomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const node = useNode();
  const [starting, setStarting] = useState(false);
  const [joining, setJoining] = useState(false);
  const waiting = node.state?.group === null && node.state.joining;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.color.bg,
        paddingTop: insets.top + theme.space[7],
        paddingBottom: insets.bottom + theme.space[5],
        paddingHorizontal: theme.space[5],
        justifyContent: 'space-between',
      }}
    >
      <View style={{ gap: theme.space[4] }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: theme.radius.lg,
            backgroundColor: theme.color.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Images size={32} color={theme.color.accent} />
        </View>
        <Txt variant="heading" accessibilityRole="header">
          {t('app.name')}
        </Txt>
        <Txt>{t('home.tagline')}</Txt>
      </View>

      <View style={{ gap: theme.space[3] }}>
        <Button label={t('home.start')} kind="primary" icon={Images} wide onPress={() => setStarting(true)} />
        <Button label={t('home.join')} icon={QrCode} wide onPress={() => setJoining(true)} />
        <Txt variant="muted" center style={{ marginTop: theme.space[2] }}>
          {t('home.promise')}
        </Txt>
      </View>

      {starting ? <StartSheet onClose={() => setStarting(false)} /> : null}
      {joining && !waiting ? <JoinSheet onClose={() => setJoining(false)} /> : null}
      {waiting ? <WaitingSheet /> : null}
    </View>
  );
}

interface StartProps {
  onClose: () => void;
}

function StartSheet({ onClose }: StartProps) {
  const theme = useTheme();
  const node = useNode();
  const shell = useShell();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const c = theme.color;

  const create = async () => {
    setBusy(true);
    try {
      await node.call('createGroup', { name: name.trim() });
    } catch (err) {
      shell.toast(t('start.failed', { reason: (err as Error).message }), 'error');
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={t('start.title')}
      onClose={onClose}
      footer={
        <>
          <Button label={t('common.cancel')} onPress={onClose} />
          <Button
            label={t('start.create')}
            kind="primary"
            busy={busy}
            disabled={name.trim().length === 0}
            onPress={create}
          />
        </>
      }
    >
      <View style={{ gap: theme.space[2] }}>
        <Txt variant="label">{t('start.nameLabel')}</Txt>
        <TextInput
          accessibilityLabel={t('start.nameLabel')}
          value={name}
          onChangeText={setName}
          placeholder={t('start.namePlaceholder')}
          placeholderTextColor={c.textFaint}
          autoFocus
          maxLength={60}
          returnKeyType="done"
          onSubmitEditing={() => name.trim() && create()}
          style={{
            minHeight: theme.touch,
            borderWidth: 1,
            borderColor: c.borderStrong,
            borderRadius: theme.radius.md,
            paddingHorizontal: theme.space[3],
            color: c.text,
            backgroundColor: c.bg,
            fontFamily: theme.font.regular,
            fontSize: theme.fontSize.md,
          }}
        />
        <Txt variant="muted">{t('start.nameHint')}</Txt>
      </View>
    </Sheet>
  );
}

/** Shown after an invite is scanned, until someone in the group lets us in. */
function WaitingSheet() {
  const theme = useTheme();
  const node = useNode();
  const refused = node.state?.group === null && node.state.joinError !== '';
  const stop = () => {
    node.call('cancelJoin', {}).catch(() => {});
  };
  return (
    <Sheet
      title={t('join.waitingTitle')}
      onClose={stop}
      footer={<Button label={t(refused ? 'common.close' : 'join.cancel')} onPress={stop} />}
    >
      <View style={{ flexDirection: 'row', gap: theme.space[3], alignItems: 'center' }}>
        {refused ? null : <ActivityIndicator color={theme.color.accent} />}
        <Txt style={{ flex: 1 }} color={refused ? theme.color.danger : undefined}>
          {t(refused ? 'join.refused' : 'join.waiting')}
        </Txt>
      </View>
    </Sheet>
  );
}
