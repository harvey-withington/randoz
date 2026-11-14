import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, useFonts } from '@expo-google-fonts/inter';
import { Txt } from './src/components/Txt';
import { t } from './src/i18n';
import { GroupScreen } from './src/screens/GroupScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { ShellProvider } from './src/shell/shell';
import { NodeProvider, useNode } from './src/store/node';
import { ThemeProvider, useTheme } from './src/theme/theme';

export default function App() {
  const [fontsReady] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold });
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ShellProvider>
          <NodeProvider>{fontsReady ? <Root /> : null}</NodeProvider>
        </ShellProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/** Picks the screen from the core's state: starting, no group, or the group. */
function Root() {
  const theme = useTheme();
  const { state, startError } = useNode();
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      {startError ? (
        <Centered>
          <Txt color={theme.color.danger} center>
            {t('app.startFailed', { reason: startError })}
          </Txt>
        </Centered>
      ) : state === null ? (
        <Centered>
          <ActivityIndicator color={theme.color.accent} />
          <Txt variant="muted">{t('app.starting')}</Txt>
        </Centered>
      ) : state.group ? (
        <GroupScreen state={state} />
      ) : (
        <HomeScreen />
      )}
    </View>
  );
}

interface CenteredProps {
  children: React.ReactNode;
}

function Centered({ children }: CenteredProps) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.space[3], padding: theme.space[5] }}>
      {children}
    </View>
  );
}
