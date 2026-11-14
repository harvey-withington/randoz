import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Images, QrCode } from 'lucide-react-native';
import { Button } from '../components/Button';
import { Txt } from '../components/Txt';
import { t } from '../i18n';
import { useTheme } from '../theme/theme';

interface Props {
  onStart: () => void;
  onJoin: () => void;
}

/** What you see before you are in any group: what RANDOZ is, and the two ways in. */
export function HomeScreen({ onStart, onJoin }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
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
        <Button label={t('home.start')} kind="primary" icon={Images} wide onPress={onStart} />
        <Button label={t('home.join')} icon={QrCode} wide onPress={onJoin} />
        <Txt variant="muted" center style={{ marginTop: theme.space[2] }}>
          {t('home.promise')}
        </Txt>
      </View>
    </View>
  );
}
