import { useRef, useState } from 'react';
import { View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import { ClipboardPaste } from 'lucide-react-native';
import { Button } from '../components/Button';
import { IdentityPicker } from '../components/IdentityPicker';
import { Sheet } from '../components/Sheet';
import { Txt } from '../components/Txt';
import { t } from '../i18n';
import { useShell } from '../shell/shell';
import { useNode } from '../store/node';
import { useTheme } from '../theme/theme';

interface Props {
  onClose: () => void;
  /** Opens the identities sheet, to make a new one. */
  onManage: () => void;
}

const INVITE_PREFIX = 'randoz://join/';

/**
 * Scan an invite's QR code, or paste its link. Joining then carries on in
 * the group list, where it shows as "Joining…".
 */
export function JoinSheet({ onClose, onManage }: Props) {
  const theme = useTheme();
  const node = useNode();
  const shell = useShell();
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);
  const [identity, setIdentity] = useState<string | null>(node.state?.lastIdentity ?? null);

  const join = async (code: string) => {
    if (handled.current) return;
    if (!code.trim().startsWith(INVITE_PREFIX)) {
      shell.toast(t('join.notInvite'), 'error');
      return;
    }
    handled.current = true;
    try {
      await node.call('joinGroup', { code: code.trim(), identity });
      onClose();
    } catch (err) {
      handled.current = false;
      shell.toast(t('join.failed', { reason: (err as Error).message }), 'error');
    }
  };

  const paste = async () => {
    const text = await Clipboard.getStringAsync();
    if (!text.trim()) shell.toast(t('join.pasteEmpty'), 'info');
    else await join(text);
  };

  return (
    <Sheet
      title={t('join.title')}
      onClose={onClose}
      footer={<Button label={t('join.paste')} icon={ClipboardPaste} onPress={paste} />}
    >
      {permission?.granted ? (
        <View style={{ gap: theme.space[3] }}>
          <View
            style={{
              aspectRatio: 1,
              borderRadius: theme.radius.lg,
              overflow: 'hidden',
              backgroundColor: theme.color.surface3,
            }}
          >
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => {
                if (data.startsWith(INVITE_PREFIX)) join(data);
              }}
            />
          </View>
          <Txt variant="muted" center>
            {t('join.scanHint')}
          </Txt>
        </View>
      ) : (
        <View style={{ gap: theme.space[3] }}>
          <Txt>{t('join.cameraDenied')}</Txt>
          <Button label={t('join.allowCamera')} kind="primary" onPress={() => requestPermission()} />
        </View>
      )}
      <View style={{ marginTop: theme.space[4] }}>
        <IdentityPicker
          identities={node.state?.identities ?? []}
          value={identity}
          onChange={setIdentity}
          onManage={onManage}
        />
      </View>
    </Sheet>
  );
}
