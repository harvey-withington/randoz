import { Pressable, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Choice } from '../components/Choice';
import { Sheet } from '../components/Sheet';
import { Txt } from '../components/Txt';
import { t } from '../i18n';
import { tagsIn } from '../lib/gallery';
import type { Group, GroupBy, Sort, ViewType } from '../lib/types';
import { useNode } from '../store/node';
import { useTheme } from '../theme/theme';

interface Props {
  group: Group;
  /** The member whose photos are shown (their key), or null for everyone's. */
  person: string | null;
  /** The tag whose photos are shown, or null for all. */
  tag: string | null;
  onPerson: (person: string | null) => void;
  onTag: (tag: string | null) => void;
  onClose: () => void;
}

export const viewOptions = (): { value: ViewType; label: string }[] => [
  { value: 'large', label: t('view.large') },
  { value: 'small', label: t('view.small') },
  { value: 'details', label: t('view.details') },
];

export const sortOptions = (): { value: Sort; label: string }[] => [
  { value: 'newest', label: t('sort.newest') },
  { value: 'oldest', label: t('sort.oldest') },
  { value: 'title', label: t('sort.title') },
  { value: 'person', label: t('sort.person') },
  { value: 'size', label: t('sort.size') },
];

export const groupOptions = (): { value: GroupBy; label: string }[] => [
  { value: 'none', label: t('groupBy.none') },
  { value: 'person', label: t('groupBy.person') },
  { value: 'tag', label: t('groupBy.tag') },
];

/**
 * How a group's photos are shown: the layout, the order, the grouping, and
 * whose photos or which tag to show. The first three are remembered for
 * every group; the filters last until the group is closed.
 */
export function ViewSheet({ group, person, tag, onPerson, onTag, onClose }: Props) {
  const theme = useTheme();
  const node = useNode();
  const settings = node.state?.settings;
  const tags = tagsIn(group.items);
  const sharers = group.members.filter((member) => group.items.some((item) => item.sharedBy === member.key));
  const set = (change: Parameters<typeof node.call<'setSettings'>>[1]) => {
    node.call('setSettings', change).catch(() => {});
  };
  if (!settings) return null;

  return (
    <Sheet
      title={t('view.title')}
      onClose={onClose}
      footer={<Button label={t('view.done')} kind="primary" onPress={onClose} />}
    >
      <View style={{ gap: theme.space[5] }}>
        <Choice label={t('view.layout')} options={viewOptions()} value={settings.view} onChange={(view) => set({ view })} />
        <Choice label={t('sort.label')} options={sortOptions()} value={settings.sort} onChange={(sort) => set({ sort })} />
        <Choice
          label={t('groupBy.label')}
          options={groupOptions()}
          value={settings.groupBy}
          onChange={(groupBy) => set({ groupBy })}
        />

        <View style={{ gap: theme.space[2] }}>
          <Txt variant="label">{t('filter.person')}</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
            <Chip label={t('filter.everyone')} chosen={person === null} onPress={() => onPerson(null)} />
            {sharers.map((member) => (
              <Chip
                key={member.key}
                label={member.me ? `${member.name} (${t('members.you')})` : member.name}
                chosen={person === member.key}
                onPress={() => onPerson(person === member.key ? null : member.key)}
                mark={<Avatar person={member} size={24} />}
              />
            ))}
          </View>
        </View>

        <View style={{ gap: theme.space[2] }}>
          <Txt variant="label">{t('filter.tag')}</Txt>
          {tags.shared.length + tags.mine.length === 0 ? (
            <Txt variant="faint">{t('filter.noTags')}</Txt>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
              <Chip label={t('filter.allTags')} chosen={tag === null} onPress={() => onTag(null)} />
              {tags.shared.map((one) => (
                <Chip key={'s:' + one} label={'#' + one} chosen={tag === one} onPress={() => onTag(tag === one ? null : one)} />
              ))}
              {tags.mine.map((one) => (
                <Chip
                  key={'m:' + one}
                  label={'#' + one}
                  detail={t('tags.private')}
                  chosen={tag === one}
                  onPress={() => onTag(tag === one ? null : one)}
                />
              ))}
            </View>
          )}
        </View>
      </View>
    </Sheet>
  );
}

interface ChipProps {
  label: string;
  /** A word after the label, in a fainter voice: "private". */
  detail?: string;
  chosen: boolean;
  onPress: () => void;
  mark?: React.ReactNode;
}

/** A filter that is on or off: a rounded label, filled when it is on. */
export function Chip({ label, detail, chosen, onPress, mark }: ChipProps) {
  const theme = useTheme();
  const c = theme.color;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: chosen }}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space[2],
        minHeight: theme.touch,
        paddingHorizontal: theme.space[3],
        borderRadius: theme.touch / 2,
        borderWidth: 1.5,
        borderColor: chosen ? c.accent : c.borderStrong,
        backgroundColor: chosen ? c.accentSoft : 'transparent',
      }}
    >
      {mark}
      <Txt color={chosen ? c.accent : c.text}>{label}</Txt>
      {detail ? <Txt variant="faint">{detail}</Txt> : null}
    </Pressable>
  );
}
