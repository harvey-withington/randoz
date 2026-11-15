import { useState } from 'react';
import { View } from 'react-native';
import { Plus } from 'lucide-react-native';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { Sheet } from '../components/Sheet';
import { Txt } from '../components/Txt';
import { t } from '../i18n';
import { tagHue, tagsIn } from '../lib/gallery';
import type { Group, Item } from '../lib/types';
import { useShell } from '../shell/shell';
import { useNode } from '../store/node';
import { useTheme } from '../theme/theme';
import { Chip } from './ViewSheet';

interface Props {
  group: Group;
  item: Item;
  onClose: () => void;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * A photo's title, description and tags. On your own photo they are what
 * the whole group sees. On someone else's they are yours alone: your title
 * and description replace theirs on this phone, and your tags sit beside
 * theirs.
 */
export function DetailsSheet({ group, item, onClose }: Props) {
  const theme = useTheme();
  const node = useNode();
  const shell = useShell();
  const [title, setTitle] = useState(item.mine || item.title !== item.sharedTitle ? item.title : '');
  const [description, setDescription] = useState(
    item.mine || item.description !== item.sharedDescription ? item.description : '',
  );
  const [tags, setTags] = useState<string[]>(item.mine ? item.tags : item.myTags);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  // Tags already used in this group, to pick from instead of typing.
  const known = tagsIn(group.items);
  const offered = (list: string[]) =>
    list.filter((tag) => !tags.some((one) => same(one, tag)) && !(!item.mine && item.tags.some((one) => same(one, tag))));
  const toggle = (tag: string) =>
    setTags((current) => (current.some((one) => same(one, tag)) ? current.filter((one) => !same(one, tag)) : [...current, tag]));
  // Tags are always lower case, however they are typed.
  const tidy = (text: string) => text.trim().replace(/^#+/, '').trim().toLowerCase();
  const add = () => {
    const tag = tidy(typed);
    if (tag && !tags.some((one) => same(one, tag))) setTags([...tags, tag]);
    setTyped('');
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    const pending = tidy(typed);
    const all = pending && !tags.some((one) => same(one, pending)) ? [...tags, pending] : tags;
    try {
      await node.call('setItemDetails', {
        group: group.id,
        id: item.id,
        title: title.trim(),
        description: description.trim(),
        tags: all,
      });
      shell.toast(t(item.mine ? 'details.savedShared' : 'details.savedPrivate'), 'success');
      onClose();
    } catch (err) {
      shell.toast(t('details.failed', { reason: (err as Error).message }), 'error');
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={t('details.title')}
      onClose={onClose}
      footer={
        <>
          <Button label={t('common.cancel')} onPress={onClose} />
          <Button label={t('details.save')} kind="primary" busy={busy} onPress={save} />
        </>
      }
    >
      <View style={{ gap: theme.space[4] }}>
        <Txt variant="muted">
          {item.mine ? t('details.sharedNote') : t('details.privateNote', { name: item.by?.name ?? '' })}
        </Txt>
        <Field
          label={t('details.titleLabel')}
          value={title}
          onChange={setTitle}
          placeholder={item.mine ? item.name : item.sharedTitle || item.name}
          maxLength={80}
        />
        <Field
          label={t('details.descriptionLabel')}
          value={description}
          onChange={setDescription}
          placeholder={item.mine ? t('details.descriptionPlaceholder') : item.sharedDescription || t('details.descriptionPlaceholder')}
          maxLength={500}
          multiline
        />

        <View style={{ gap: theme.space[2] }}>
          <Txt variant="label">{t(item.mine ? 'tags.label' : 'tags.labelPrivate')}</Txt>
          {!item.mine && item.tags.length > 0 ? (
            <Txt variant="muted">
              {t('tags.theirs', { name: item.by?.name ?? '' })} {item.tags.map((tag) => '#' + tag).join('  ')}
            </Txt>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
            {tags.map((tag) => (
              <Chip key={'on:' + tag} label={'#' + tag} hue={tagHue(tag)} chosen onPress={() => toggle(tag)} />
            ))}
            {offered(known.shared).map((tag) => (
              <Chip key={'s:' + tag} label={'#' + tag} hue={tagHue(tag)} chosen={false} onPress={() => toggle(tag)} />
            ))}
            {offered(known.mine).map((tag) => (
              <Chip key={'m:' + tag} label={'#' + tag} detail={t('tags.private')} hue={tagHue(tag)} chosen={false} onPress={() => toggle(tag)} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.space[2] }}>
            <View style={{ flex: 1 }}>
              <Field
                label={t('tags.new')}
                value={typed}
                onChange={setTyped}
                placeholder={t('tags.newPlaceholder')}
                maxLength={24}
                plain
                onSubmit={add}
              />
            </View>
            <Button label={t('tags.add')} icon={Plus} disabled={!typed.trim()} onPress={add} style={{ alignSelf: 'flex-end' }} />
          </View>
          <Txt variant="faint">{t(item.mine ? 'tags.hintShared' : 'tags.hintPrivate')}</Txt>
        </View>
      </View>
    </Sheet>
  );
}
