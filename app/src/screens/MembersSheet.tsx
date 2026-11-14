import { useState } from 'react';
import { View } from 'react-native';
import { LogOut } from 'lucide-react-native';
import { Avatar } from '../components/Avatar';
import { ConnectionDot } from '../components/ConnectionDot';
import { Button } from '../components/Button';
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

/** Who is in the group, who is online, how much each has shared, and the way out. */
export function MembersSheet({ group, onClose }: Props) {
  const theme = useTheme();
  const node = useNode();
  const shell = useShell();
  const [leaving, setLeaving] = useState(false);

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
              style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3], minHeight: theme.touch }}
            >
              <Avatar person={member} />
              <View style={{ flex: 1 }}>
                <Txt>
                  {member.name}
                  {member.me ? ` (${t('members.you')})` : ''}
                </Txt>
                <Txt variant="muted" numberOfLines={1}>
                  {plural(count, 'members.photosOne', 'members.photos', 'members.photosNone')}
                  {aka}
                </Txt>
                {member.me ? null : (
                  <ConnectionDot online={member.online} label={t(member.online ? 'conn.online' : 'conn.offline')} />
                )}
              </View>
            </View>
          );
        })}
      </View>
    </Sheet>
  );
}
