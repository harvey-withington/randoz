import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { Sheet } from '../components/Sheet';
import { Txt } from '../components/Txt';
import { t } from '../i18n';
import type { Group } from '../lib/types';
import { useShell } from '../shell/shell';
import { useNode } from '../store/node';
import { useTheme } from '../theme/theme';

interface Props {
  group: Group;
  onClose: () => void;
}

/**
 * A group's name and description. Its creator sets them for everyone; any
 * other member can keep their own for it, on this phone alone.
 */
export function GroupDetailsSheet({ group, onClose }: Props) {
  const theme = useTheme();
  const node = useNode();
  const shell = useShell();
  const own = group.creator;
  const [name, setName] = useState(own || group.name !== group.sharedName ? group.name : '');
  const [description, setDescription] = useState(
    own || group.description !== group.sharedDescription ? group.description : '',
  );
  const [busy, setBusy] = useState(false);
  const ready = !own || name.trim().length > 0;

  const save = async () => {
    if (!ready || busy) return;
    setBusy(true);
    try {
      await node.call('setGroupDetails', { group: group.id, name: name.trim(), description: description.trim() });
      shell.toast(t(own ? 'groupDetails.savedShared' : 'groupDetails.savedPrivate'), 'success');
      onClose();
    } catch (err) {
      shell.toast(t('details.failed', { reason: (err as Error).message }), 'error');
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={t('groupDetails.title')}
      onClose={onClose}
      footer={
        <>
          <Button label={t('common.cancel')} onPress={onClose} />
          <Button label={t('details.save')} kind="primary" busy={busy} disabled={!ready} onPress={save} />
        </>
      }
    >
      <View style={{ gap: theme.space[4] }}>
        <Txt variant="muted">{t(own ? 'groupDetails.sharedNote' : 'groupDetails.privateNote')}</Txt>
        <Field
          label={t('start.nameLabel')}
          value={name}
          onChange={setName}
          placeholder={own ? t('start.namePlaceholder') : group.sharedName}
          maxLength={60}
        />
        <Field
          label={t('groupDetails.descriptionLabel')}
          value={description}
          onChange={setDescription}
          placeholder={own ? t('groupDetails.descriptionPlaceholder') : group.sharedDescription || t('groupDetails.descriptionPlaceholder')}
          maxLength={300}
          multiline
        />
      </View>
    </Sheet>
  );
}
