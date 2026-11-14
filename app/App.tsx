import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, BackHandler, View } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, useFonts } from '@expo-google-fonts/inter';
import { Txt } from './src/components/Txt';
import { t } from './src/i18n';
import { GroupScreen } from './src/screens/GroupScreen';
import { GroupsScreen } from './src/screens/GroupsScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { JoinSheet } from './src/screens/JoinSheet';
import { ProfileSheet } from './src/screens/ProfileSheet';
import { StartSheet } from './src/screens/StartSheet';
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

type OpenSheet = 'start' | 'join' | 'profile' | null;

const FLAG_ACTIVITY_NEW_TASK = 0x10000000;

/**
 * Picks the screen. With no groups: the welcome screen. Otherwise the list
 * of groups, or the one group that is open. Back from a group returns to
 * the list.
 */
function Root() {
  const theme = useTheme();
  const { state, startError } = useNode();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [sheet, setSheet] = useState<OpenSheet>(null);

  const groups = state?.groups ?? [];
  const current = groups.find((group) => group.id === openGroup);
  const shown = current && !current.joining ? current : null;

  // A group that is left, or removed by a duplicate join, closes itself.
  // (One that was only just started may not be in the state yet.)
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (!openGroup || !state) return;
    if (state.groups.some((group) => group.id === openGroup)) seen.current = openGroup;
    else if (seen.current === openGroup) setOpenGroup(null);
  }, [openGroup, state]);

  // Back with nothing open goes to the phone's home screen and leaves the app
  // running. Letting Android close the screen would leave the core behind.
  useEffect(() => {
    if (shown || sheet) return;
    const held = BackHandler.addEventListener('hardwareBackPress', () => {
      IntentLauncher.startActivityAsync('android.intent.action.MAIN', {
        category: 'android.intent.category.HOME',
        flags: FLAG_ACTIVITY_NEW_TASK,
      }).catch(() => BackHandler.exitApp());
      return true;
    });
    return () => held.remove();
  }, [shown, sheet]);

  let screen: ReactNode;
  if (startError) {
    screen = (
      <Centered>
        <Txt color={theme.color.danger} center>
          {t('app.startFailed', { reason: startError })}
        </Txt>
      </Centered>
    );
  } else if (state === null) {
    screen = (
      <Centered>
        <ActivityIndicator color={theme.color.accent} />
        <Txt variant="muted">{t('app.starting')}</Txt>
      </Centered>
    );
  } else if (shown) {
    screen = <GroupScreen key={shown.id} group={shown} onBack={() => setOpenGroup(null)} />;
  } else if (groups.length === 0) {
    screen = <HomeScreen onStart={() => setSheet('start')} onJoin={() => setSheet('join')} />;
  } else {
    screen = (
      <GroupsScreen
        state={state}
        onOpen={setOpenGroup}
        onStart={() => setSheet('start')}
        onJoin={() => setSheet('join')}
        onProfile={() => setSheet('profile')}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      {screen}
      {sheet === 'start' ? (
        <StartSheet
          onClose={() => setSheet(null)}
          onStarted={(group) => {
            setSheet(null);
            setOpenGroup(group);
          }}
        />
      ) : null}
      {sheet === 'join' ? <JoinSheet onClose={() => setSheet(null)} /> : null}
      {sheet === 'profile' ? <ProfileSheet onClose={() => setSheet(null)} /> : null}
    </View>
  );
}

interface CenteredProps {
  children: ReactNode;
}

function Centered({ children }: CenteredProps) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.space[3], padding: theme.space[5] }}>
      {children}
    </View>
  );
}
