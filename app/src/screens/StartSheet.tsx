import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { IdentityPicker } from '../components/IdentityPicker';
import { Sheet } from '../components/Sheet';
import { t } from '../i18n';
import { useShell } from '../shell/shell';
import { useNode } from '../store/node';
import { useTheme } from '../theme/theme';

interface Props {
  onClose: () => void;
  /** Called with the new group's id once it exists. */
  onStarted: (group: string) => void;
  /** Opens the identities sheet, to make a new one. */
  onManage: () => void;
}

/** Name a new group, choose how to appear in it, and start it. */
export function StartSheet({ onClose, onStarted, onManage }: Props) {
  const theme = useTheme();
  const node = useNode();
  const shell = useShell();
  const [name, setName] = useState('');
  const [identity, setIdentity] = useState<string | null>(node.state?.lastIdentity ?? null);
  const [busy, setBusy] = useState(false);
  const ready = name.trim().length > 0;

  const create = async () => {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const { group } = await node.call('createGroup', { name: name.trim(), identity });
      onStarted(group);
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
          <Button label={t('start.create')} kind="primary" busy={busy} disabled={!ready} onPress={create} />
        </>
      }
    >
      <Field
        label={t('start.nameLabel')}
        value={name}
        onChange={setName}
        placeholder={t('start.namePlaceholder')}
        hint={t('start.nameHint')}
        maxLength={60}
        autoFocus
        onSubmit={create}
      />
      <View style={{ marginTop: theme.space[4] }}>
        <IdentityPicker
          identities={node.state?.identities ?? []}
          value={identity}
          onChange={setIdentity}
          onManage={onManage}
        />
      </View>
    </Sheet>
  );
}
