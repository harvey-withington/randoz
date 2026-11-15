import { View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Button } from '../components/Button';
import { Choice } from '../components/Choice';
import { Sheet } from '../components/Sheet';
import { ToggleRow } from '../components/ToggleRow';
import { Txt } from '../components/Txt';
import { t } from '../i18n';
import type { GroupHeader, Settings, ViewerInfo } from '../lib/types';
import { useShell } from '../shell/shell';
import { useNode } from '../store/node';
import { useTheme } from '../theme/theme';
import { groupOptions, sortOptions, viewOptions } from './ViewSheet';

interface Props {
  onClose: () => void;
}

/**
 * How RANDOZ behaves on this phone: how photos are laid out, what the
 * viewer says, whether it asks before sharing, and whether it stays
 * connected in the background. Each change applies at once.
 */
export function PreferencesSheet({ onClose }: Props) {
  const theme = useTheme();
  const node = useNode();
  const shell = useShell();
  const c = theme.color;
  const settings = node.state?.settings;
  if (!settings) return null;

  const set = (change: Partial<Settings>) => {
    node.call('setSettings', change).catch((err: Error) => shell.toast(err.message, 'error'));
  };
  const infoOptions: { value: ViewerInfo; label: string }[] = [
    { value: 'full', label: t('prefs.infoFull') },
    { value: 'line', label: t('prefs.infoLine') },
    { value: 'hidden', label: t('prefs.infoHidden') },
  ];
  const headerOptions: { value: GroupHeader; label: string }[] = [
    { value: 'full', label: t('prefs.infoFull') },
    { value: 'line', label: t('prefs.infoLine') },
  ];
  const copyLog = async () => {
    await Clipboard.setStringAsync(node.log());
    shell.toast(t('settings.logCopied'), 'success');
  };
  const section = {
    gap: theme.space[4],
    paddingTop: theme.space[4],
    borderTopWidth: 1,
    borderTopColor: c.border,
  } as const;

  return (
    <Sheet title={t('prefs.title')} onClose={onClose} footer={<Button label={t('view.done')} kind="primary" onPress={onClose} />}>
      <View style={{ gap: theme.space[5] }}>
        <View style={{ gap: theme.space[4] }}>
          <Txt variant="title">{t('prefs.photos')}</Txt>
          <Choice label={t('view.layout')} options={viewOptions()} value={settings.view} onChange={(view) => set({ view })} />
          <Choice label={t('sort.label')} options={sortOptions()} value={settings.sort} onChange={(sort) => set({ sort, sortReverse: false })} />
          <ToggleRow
            label={t('sort.reverse')}
            hint={t('sort.reverseHint')}
            value={settings.sortReverse}
            onChange={(sortReverse) => set({ sortReverse })}
          />
          <Choice
            label={t('groupBy.label')}
            options={groupOptions()}
            value={settings.groupBy}
            onChange={(groupBy) => set({ groupBy })}
          />
          <Choice
            label={t('prefs.groupHeader')}
            options={headerOptions}
            value={settings.groupHeader}
            onChange={(groupHeader) => set({ groupHeader })}
          />
          <Choice
            label={t('prefs.viewerInfo')}
            options={infoOptions}
            value={settings.viewerInfo}
            onChange={(viewerInfo) => set({ viewerInfo })}
          />
        </View>

        <View style={section}>
          <Txt variant="title">{t('prefs.sharing')}</Txt>
          <ToggleRow
            label={t('prefs.shareReminder')}
            hint={t('prefs.shareReminderHint')}
            value={settings.shareReminder}
            onChange={(shareReminder) => set({ shareReminder })}
          />
        </View>

        <View style={section}>
          <Txt variant="title">{t('prefs.connection')}</Txt>
          <ToggleRow
            label={t('prefs.stayConnected')}
            hint={t('settings.stayHint')}
            value={settings.stayConnected}
            onChange={(stayConnected) => set({ stayConnected })}
          />
        </View>

        <View style={[section, { alignItems: 'flex-start' }]}>
          <Txt variant="title">{t('prefs.help')}</Txt>
          <Txt variant="muted">{t('settings.logHint')}</Txt>
          <Button label={t('settings.copyLog')} onPress={copyLog} />
        </View>
      </View>
    </Sheet>
  );
}
