// Toasts and the confirm dialog. Nothing in the app calls alert() or
// confirm(): components take these from useShell(), as in UNCLI.

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react-native';
import { Button } from '../components/Button';
import { Sheet } from '../components/Sheet';
import { Txt } from '../components/Txt';
import { t } from '../i18n';
import { useTheme } from '../theme/theme';

export type ToastKind = 'info' | 'success' | 'error';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  /** A destructive action: the confirm button is in the danger colour. */
  danger?: boolean;
}

export interface Shell {
  toast(message: string, kind?: ToastKind): void;
  /** Resolves true if the user confirmed, false if they cancelled. */
  confirm(options: ConfirmOptions): Promise<boolean>;
}

interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

const ShellContext = createContext<Shell | null>(null);
const FADE_AFTER_MS = 3500;

interface Props {
  children: ReactNode;
}

export function ShellProvider({ children }: Props) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [asking, setAsking] = useState<ConfirmOptions | null>(null);
  const answer = useRef<((ok: boolean) => void) | null>(null);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((toast) => toast.id !== id)), []);

  const shell = useMemo<Shell>(
    () => ({
      toast(message, kind = 'info') {
        const id = nextId.current++;
        setToasts((list) => [...list, { id, message, kind }]);
        // Errors stay until dismissed; the rest fade.
        if (kind !== 'error') setTimeout(() => dismiss(id), FADE_AFTER_MS);
      },
      confirm(options) {
        return new Promise<boolean>((resolve) => {
          answer.current = resolve;
          setAsking(options);
        });
      },
    }),
    [dismiss],
  );

  const settle = (ok: boolean) => {
    answer.current?.(ok);
    answer.current = null;
    setAsking(null);
  };

  return (
    <ShellContext.Provider value={shell}>
      {children}
      <Toasts toasts={toasts} onDismiss={dismiss} />
      {asking ? (
        <Sheet
          title={asking.title}
          onClose={() => settle(false)}
          footer={
            <>
              <Button label={t('common.cancel')} onPress={() => settle(false)} />
              <Button
                label={asking.confirmLabel}
                kind={asking.danger ? 'danger' : 'primary'}
                onPress={() => settle(true)}
              />
            </>
          }
        >
          <Txt>{asking.message}</Txt>
        </Sheet>
      ) : null}
    </ShellContext.Provider>
  );
}

export function useShell(): Shell {
  const shell = useContext(ShellContext);
  if (!shell) throw new Error('useShell needs a ShellProvider above it');
  return shell;
}

interface ToastsProps {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}

function Toasts({ toasts, onDismiss }: ToastsProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const c = theme.color;
  if (toasts.length === 0) return null;
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: insets.top + theme.space[2],
        left: theme.space[3],
        right: theme.space[3],
        gap: theme.space[2],
      }}
    >
      {toasts.map((toast) => {
        const Icon = toast.kind === 'error' ? CircleAlert : toast.kind === 'success' ? CircleCheck : Info;
        const ink = toast.kind === 'error' ? c.danger : toast.kind === 'success' ? c.success : c.accent;
        return (
          <Pressable
            key={toast.id}
            accessibilityRole="alert"
            accessibilityHint={t('common.dismiss')}
            onPress={() => onDismiss(toast.id)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.space[3],
              minHeight: theme.touch,
              paddingVertical: theme.space[2],
              paddingHorizontal: theme.space[3],
              borderRadius: theme.radius.md,
              borderWidth: 1,
              borderColor: toast.kind === 'error' ? c.danger : c.borderStrong,
              backgroundColor: c.surface,
              elevation: 6,
            }}
          >
            <Icon size={20} color={ink} />
            <Txt style={{ flex: 1 }}>{toast.message}</Txt>
            {toast.kind === 'error' ? <X size={18} color={c.textMuted} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
