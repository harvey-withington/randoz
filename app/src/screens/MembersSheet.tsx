import { useState } from 'react';
import { View } from 'react-native';
import { LogOut } from 'lucide-react-native';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { IdentityPicker } from '../components/IdentityPicker';
import { Sheet } from '../components/Sheet';
import { Txt } from '../components/Txt';
import { plural, t } from '../i18n';
import type { Group } from '../lib/types';
import { useShell } from '../shell/shell';
import { useNode } from '../store/node';
import { useTheme } from '../theme/theme';

interface Props {
  group: Group;
  onClose: () => void;
}

/**
 * Who is in the group, who is online, how much each has shared, how you
 * appear in it, and the way out.
 */
export function MembersSheet({ group, onClose }: Props) {
  const theme = useTheme();
  const node = useNode();
  const shell = useShell();
  const [leaving, setLeaving] = useState(false);
  const [choosing, setChoosing] = useState(false);

  const appearAs = (identity: string | null) => {
    node.call('setGroupIdentity', { group: group.id, identity }).then(
      () => setChoosing(false),
      (err: Error) => shell.toast(t('identity.failed', { reason: err.message }), 'error'),
    );
  };

  const leave = async () => {
    const ok = await shell.confirm({
      title: t('leave.title', { group: group.name }),
      message: t('leave.message'),
      confirmLabel: t('leave.confirm'),
      danger: true,
    });
    if (!ok) return;
    setLeaving(true);
    try {
      await node.call('leaveGroup', { group: group.id });
      shell.toast(t('leave.done'), 'info');
    } catch (err) {
      shell.toast(t('leave.failed', { reason: (err as Error).message }), 'error');
      setLeaving(false);
    }
  };

  return (
    <Sheet
      title={t('members.title')}
      onClose={onClose}
      footer={<Button label={t('members.leave')} icon={LogOut} kind="danger" busy={leaving} onPress={leave} />}
    >
      <View style={{ gap: theme.space[1] }}>
        {group.members.map((member) => {
          const count = group.items.filter((item) => item.sharedBy === member.key).length;
          const aka = member.name === member.nickname ? '' : ` · ${member.nickname}`;
          return (
            <View
              key={member.key}
              accessible
              accessibilityLabel={[
                member.me ? `${member.name} (${t('members.you')})` : member.name,
                member.about,
                member.me ? '' : t(member.online ? 'conn.online' : 'conn.offline'),
              ]
                .filter(Boolean)
                .join('. ')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3], minHeight: theme.touch }}
            >
              <Avatar person={member} />
              <View style={{ flex: 1 }}>
                <Txt>
                  {member.name}
                  {member.me ? ` (${t('members.you')})` : ''}
                </Txt>
                {member.about ? <Txt variant="muted">{member.about}</Txt> : null}
                <Txt variant="muted" numberOfLines={1}>
                  {plural(count, 'members.photosOne', 'members.photos', 'members.photosNone')}
                  {aka}
                </Txt>
              </View>
              {member.me ? (
                <Button
                  label={t(choosing ? 'common.close' : 'members.change')}
                  kind="ghost"
                  onPress={() => setChoosing(!choosing)}
                />
              ) : null}
            </View>
          );
        })}
      </View>
      {choosing ? (
        <View style={{ marginTop: theme.space[4] }}>
          <IdentityPicker identities={node.state?.identities ?? []} value={group.identity} onChange={appearAs} />
        </View>
      ) : null}
    </Sheet>
  );
}
