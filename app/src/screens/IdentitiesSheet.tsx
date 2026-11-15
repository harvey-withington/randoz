import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronRight, ImagePlus, Plus, Trash2 } from 'lucide-react-native';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { identityPerson } from '../components/IdentityPicker';
import { Sheet } from '../components/Sheet';
import { Txt } from '../components/Txt';
import { plural, t } from '../i18n';
import { pickIcon } from '../lib/photos';
import { IDENTITY_HUE, type Identity } from '../lib/types';
import { useShell } from '../shell/shell';
import { useNode } from '../store/node';
import { useTheme } from '../theme/theme';

interface Props {
  onClose: () => void;
}

/**
 * This phone's identities: the ways its owner can appear in a group. Each
 * is a name, a picture and a line about them; a group uses one, or none.
 * There is no account behind any of them.
 */
export function IdentitiesSheet({ onClose }: Props) {
  const theme = useTheme();
  const node = useNode();
  const shell = useShell();
  const c = theme.color;
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const identities = node.state?.identities ?? [];
  const groups = node.state?.groups ?? [];

  if (editing !== null) {
    const identity = identities.find((one) => one.id === editing);
    return <IdentityEditor identity={identity} onDone={() => setEditing(null)} />;
  }

  return (
    <Sheet
      title={t('identity.title')}
      onClose={onClose}
      footer={<Button label={t('identity.new')} icon={Plus} kind="primary" onPress={() => setEditing('new')} />}
    >
      <Txt variant="muted">{t('identity.intro')}</Txt>
      <View style={{ gap: theme.space[2], marginTop: theme.space[4] }}>
        {identities.length === 0 ? <Txt variant="faint">{t('identity.none')}</Txt> : null}
        {identities.map((identity) => {
          const used = groups.filter((group) => group.identity === identity.id).length;
          return (
            <Pressable
              key={identity.id}
              accessibilityRole="button"
              accessibilityLabel={`${t('identity.edit')}: ${identity.name}`}
              onPress={() => setEditing(identity.id)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.space[3],
                minHeight: theme.touch,
                padding: theme.space[3],
                borderRadius: theme.radius.md,
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: pressed ? c.surface2 : 'transparent',
              })}
            >
              <Avatar person={identityPerson(identity)} size={40} />
              <View style={{ flex: 1 }}>
                <Txt numberOfLines={1}>{identity.name}</Txt>
                {identity.about ? (
                  <Txt variant="muted" numberOfLines={1}>
                    {identity.about}
                  </Txt>
                ) : null}
                <Txt variant="faint">{plural(used, 'identity.usedOne', 'identity.used', 'identity.usedNone')}</Txt>
              </View>
              <ChevronRight size={20} color={c.textFaint} />
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

interface EditorProps {
  /** The identity to change, or undefined to make a new one. */
  identity: Identity | undefined;
  onDone: () => void;
}

function IdentityEditor({ identity, onDone }: EditorProps) {
  const theme = useTheme();
  const node = useNode();
  const shell = useShell();
  const [name, setName] = useState(identity?.name ?? '');
  const [about, setAbout] = useState(identity?.about ?? '');
  // undefined keeps the picture it has; null removes it; a path replaces it.
  const [icon, setIcon] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const shownIcon = icon === undefined ? (identity?.icon ?? null) : icon;
  const ready = name.trim().length > 0;

  const choose = async () => {
    try {
      const picked = await pickIcon();
      if (picked) setIcon(picked);
    } catch (err) {
      shell.toast(t('identity.failed', { reason: (err as Error).message }), 'error');
    }
  };

  const save = async () => {
    if (!ready || busy) return;
    setBusy(true);
    try {
      await node.call('saveIdentity', { id: identity?.id, name: name.trim(), about: about.trim(), icon });
      shell.toast(t('identity.saved'), 'success');
      onDone();
    } catch (err) {
      shell.toast(t('identity.failed', { reason: (err as Error).message }), 'error');
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!identity) return;
    const ok = await shell.confirm({
      title: t('identity.confirmDeleteTitle', { name: identity.name }),
      message: t('identity.confirmDeleteMessage'),
      confirmLabel: t('identity.delete'),
      danger: true,
    });
    if (!ok) return;
    try {
      await node.call('deleteIdentity', { id: identity.id });
      shell.toast(t('identity.deleted'), 'info');
      onDone();
    } catch (err) {
      shell.toast(t('identity.failed', { reason: (err as Error).message }), 'error');
    }
  };

  return (
    <Sheet
      title={t(identity ? 'identity.edit' : 'identity.new')}
      onClose={onDone}
      footer={
        <>
          {identity ? <Button label={t('identity.delete')} icon={Trash2} kind="danger" onPress={remove} /> : null}
          <Button label={t('common.cancel')} onPress={onDone} />
          <Button label={t('identity.save')} kind="primary" busy={busy} disabled={!ready} onPress={save} />
        </>
      }
    >
      <View style={{ gap: theme.space[4] }}>
        <Field
          label={t('identity.name')}
          value={name}
          onChange={setName}
          placeholder={t('identity.namePlaceholder')}
          maxLength={30}
          autoFocus={!identity}
        />
        <Field
          label={t('identity.about')}
          value={about}
          onChange={setAbout}
          placeholder={t('identity.aboutPlaceholder')}
          hint={t('identity.aboutHint')}
          maxLength={80}
        />
        <View style={{ gap: theme.space[2] }}>
          <Txt variant="label">{t('identity.picture')}</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3], flexWrap: 'wrap' }}>
            <Avatar person={{ name: name.trim() || '?', hue: IDENTITY_HUE, icon: shownIcon }} size={56} />
            <Button label={t('identity.choosePicture')} icon={ImagePlus} onPress={choose} />
            {shownIcon ? (
              <Button label={t('identity.removePicture')} kind="ghost" onPress={() => setIcon(null)} />
            ) : null}
          </View>
          <Txt variant="faint">{t('identity.pictureHint')}</Txt>
        </View>
      </View>
    </Sheet>
  );
}
