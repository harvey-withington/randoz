import { useEffect, useState, type ReactNode } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { t } from '../i18n';
import { useTheme } from '../theme/theme';
import { IconButton } from './Button';
import { Txt } from './Txt';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Buttons pinned under the content. */
  footer?: ReactNode;
}

/**
 * A dialog as a sheet along the bottom of the screen, as UNCLI's Modal is on
 * a phone. The Back button, a tap on the scrim and the close button all
 * close it. It rises above the on-screen keyboard, so a field in it stays
 * in view while typing.
 */
export function Sheet({ title, onClose, children, footer }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const c = theme.color;
  const [keyboard, setKeyboard] = useState(0);

  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', (event) => setKeyboard(event.endCoordinates.height));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setKeyboard(0));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityLabel={t('common.close')}
          onPress={onClose}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: c.scrim }}
        />
        <View
          accessibilityViewIsModal
          style={{
            backgroundColor: c.surface,
            borderTopLeftRadius: theme.radius.lg,
            borderTopRightRadius: theme.radius.lg,
            borderColor: c.border,
            borderWidth: 1,
            borderBottomWidth: 0,
            maxHeight: '90%',
            // On a wide screen a sheet is a column in the middle, not a band across it.
            width: '100%',
            maxWidth: 640,
            alignSelf: 'center',
            // The keyboard's reported height stops short of the navigation bar.
            paddingBottom: insets.bottom + keyboard + theme.space[4],
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingLeft: theme.space[4],
              paddingRight: theme.space[2],
              paddingTop: theme.space[2],
            }}
          >
            <Txt variant="title" accessibilityRole="header" style={{ flex: 1 }}>
              {title}
            </Txt>
            <IconButton label={t('common.close')} icon={X} onPress={onClose} color={c.textMuted} />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: theme.space[4], paddingTop: theme.space[2], gap: theme.space[4] }}
          >
            {children}
          </ScrollView>
          {footer ? (
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                justifyContent: 'flex-end',
                gap: theme.space[2],
                paddingHorizontal: theme.space[4],
                paddingTop: theme.space[4],
              }}
            >
              {footer}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
