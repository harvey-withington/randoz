import { useState } from 'react';
import { View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { Sheet } from '../components/Sheet';
import { t } from '../i18n';
import { useShell } from '../shell/shell';
import { useNode } from '../store/node';
import { useTheme } from '../theme/theme';
import { Txt } from '../components/Txt';

interface Props {
  onClose: () => void;
}

/**
 * The name other members see. There is no account behind it: it is a label
 * this phone tells each group, and leaving it empty keeps the random
 * nickname each group gives you.
 */
export function ProfileSheet({ onClose }: Props) {
  const node = useNode();
  const shell = useShell();
  const theme = useTheme();
  const [name, setName] = useState(node.state?.profile.name ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await node.call('setProfile', { name: name.trim() });
      shell.toast(t(name.trim() ? 'profile.saved' : 'profile.cleared'), 'success');
      onClose();
    } catch (err) {
      shell.toast(t('profile.failed', { reason: (err as Error).message }), 'error');
      setBusy(false);
    }
  };

  const copyLog = async () => {
    await Clipboard.setStringAsync(node.log());
    shell.toast(t('profile.logCopied'), 'success');
  };

  return (
    <Sheet
      title={t('profile.title')}
      onClose={onClose}
      footer={
        <>
          <Button label={t('common.cancel')} onPress={onClose} />
          <Button label={t('profile.save')} kind="primary" busy={busy} onPress={save} />
        </>
      }
    >
      <Field
        label={t('profile.label')}
        value={name}
        onChange={setName}
        placeholder={t('profile.placeholder')}
        hint={t('profile.hint')}
        maxLength={30}
        autoFocus
        onSubmit={save}
      />
      <View style={{ marginTop: theme.space[5], gap: theme.space[2], alignItems: 'flex-start' }}>
        {node.state?.settings.shareReminder === false ? (
          <Button
            label={t('profile.remindAgain')}
            kind="ghost"
            onPress={() => {
              node.call('setSettings', { shareReminder: true }).then(
                () => shell.toast(t('profile.remindOn'), 'success'),
                () => {},
              );
            }}
          />
        ) : null}
        <Txt variant="faint">{t('profile.logHint')}</Txt>
        <Button label={t('profile.copyLog')} kind="ghost" onPress={copyLog} />
      </View>
    </Sheet>
  );
}
