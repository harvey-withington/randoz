import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, BackHandler, PanResponder, useWindowDimensions, View } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, useFonts } from '@expo-google-fonts/inter';
import { Txt } from './src/components/Txt';
import { Welcome } from './src/components/Welcome';
import { t } from './src/i18n';
import { GroupScreen } from './src/screens/GroupScreen';
import { GroupsScreen } from './src/screens/GroupsScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { IdentitiesSheet } from './src/screens/IdentitiesSheet';
import { JoinSheet } from './src/screens/JoinSheet';
import { PreferencesSheet } from './src/screens/PreferencesSheet';
import { StartSheet } from './src/screens/StartSheet';
import { ShellProvider } from './src/shell/shell';
import { NodeProvider, useNode } from './src/store/node';
import { ThemeProvider, useTheme, useThemeChoice } from './src/theme/theme';

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

type OpenSheet = 'start' | 'join' | 'profile' | 'preferences' | null;

const FLAG_ACTIVITY_NEW_TASK = 0x10000000;
/** From this width the group list and the open group sit side by side. */
const WIDE = 720;
const LIST_MIN = 260;
const GROUP_MIN = 380;
const DIVIDER = 16;

/**
 * Picks the screen. With no groups: the welcome screen. Otherwise the list
 * of groups, or the one group that is open; Back from a group returns to
 * the list. On a wide screen the list and the open group are side by side,
 * with a divider that can be dragged.
 */
function Root() {
  const theme = useTheme();
  const node = useNode();
  const { state, startError } = node;
  const { width } = useWindowDimensions();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [sheet, setSheet] = useState<OpenSheet>(null);
  // The list's width while the divider is being dragged.
  const [dragged, setDragged] = useState<number | null>(null);

  const groups = state?.groups ?? [];
  const current = groups.find((group) => group.id === openGroup);
  const shown = current && !current.joining ? current : null;
  const wide = width >= WIDE;
  // The user's choice of light or dark lives with the other settings, in the core.
  const chooseTheme = useThemeChoice();
  const themeChoice = state?.settings.theme ?? 'system';
  useEffect(() => chooseTheme(themeChoice), [chooseTheme, themeChoice]);
  const saved = state?.settings.panelWidth ?? 360;
  const listWidth = Math.max(LIST_MIN, Math.min(width - GROUP_MIN - DIVIDER, dragged ?? saved));
  useEffect(() => setDragged(null), [saved]);

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

  // The divider reads the newest width through a ref, and saves where it is let go.
  const widths = useRef({ list: listWidth, start: listWidth });
  widths.current.list = listWidth;
  const divider = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          widths.current.start = widths.current.list;
        },
        onPanResponderMove: (_event, gesture) => setDragged(widths.current.start + gesture.dx),
        onPanResponderRelease: () => {
          node.call('setSettings', { panelWidth: Math.round(widths.current.list) }).catch(() => setDragged(null));
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const list = state ? (
    <GroupsScreen
      state={state}
      selected={wide ? openGroup : null}
      onOpen={setOpenGroup}
      onStart={() => setSheet('start')}
      onJoin={() => setSheet('join')}
      onProfile={() => setSheet('profile')}
      onPreferences={() => setSheet('preferences')}
    />
  ) : null;

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
  } else if (groups.length === 0) {
    screen = <HomeScreen onStart={() => setSheet('start')} onJoin={() => setSheet('join')} />;
  } else if (wide) {
    screen = (
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ width: listWidth }}>{list}</View>
        <View
          accessibilityLabel={t('layout.divider')}
          {...divider.panHandlers}
          style={{
            width: DIVIDER,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.color.surface,
            borderLeftWidth: 1,
            borderRightWidth: 1,
            borderColor: theme.color.border,
          }}
        >
          <View
            style={{
              width: 4,
              height: 44,
              borderRadius: 2,
              backgroundColor: dragged === null ? theme.color.borderStrong : theme.color.accent,
            }}
          />
        </View>
        <View style={{ flex: 1 }}>
          {shown ? <GroupScreen key={shown.id} group={shown} beside onBack={() => setOpenGroup(null)} /> : <Welcome />}
        </View>
      </View>
    );
  } else if (shown) {
    screen = <GroupScreen key={shown.id} group={shown} onBack={() => setOpenGroup(null)} />;
  } else {
    screen = list;
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      {screen}
      {sheet === 'start' ? (
        <StartSheet
          onClose={() => setSheet(null)}
          onManage={() => setSheet('profile')}
          onStarted={(group) => {
            setSheet(null);
            setOpenGroup(group);
          }}
        />
      ) : null}
      {sheet === 'join' ? <JoinSheet onClose={() => setSheet(null)} onManage={() => setSheet('profile')} /> : null}
      {sheet === 'profile' ? <IdentitiesSheet onClose={() => setSheet(null)} /> : null}
      {sheet === 'preferences' ? <PreferencesSheet onClose={() => setSheet(null)} /> : null}
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
