import { Pressable, View } from 'react-native';
import { Check, Dices, Plus } from 'lucide-react-native';
import { t } from '../i18n';
import { IDENTITY_HUE, type Identity, type Person } from '../lib/types';
import { useTheme } from '../theme/theme';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { Txt } from './Txt';

interface Props {
  identities: Identity[];
  /** The chosen identity's id, or null for the random one. */
  value: string | null;
  onChange: (value: string | null) => void;
  /** Shows "New identity…", for somewhere that can open the identities sheet. */
  onManage?: () => void;
}

/** An identity as an `Avatar` draws it. Its colour is the app's, not a group's. */
export const identityPerson = (identity: Identity): Person => ({
  name: identity.name,
  hue: IDENTITY_HUE,
  icon: identity.icon,
});

/**
 * How to appear in a group: one of this phone's identities, or the random
 * nickname and colour the group makes up.
 */
export function IdentityPicker({ identities, value, onChange, onManage }: Props) {
  const theme = useTheme();
  const c = theme.color;
  return (
    <View accessibilityRole="radiogroup" style={{ gap: theme.space[2] }}>
      <Txt variant="label">{t('identity.pick')}</Txt>
      <Option
        selected={value === null}
        title={t('identity.random')}
        detail={t('identity.randomHint')}
        onPress={() => onChange(null)}
        mark={
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: c.surface3,
            }}
          >
            <Dices size={18} color={c.textMuted} />
          </View>
        }
      />
      {identities.map((identity) => (
        <Option
          key={identity.id}
          selected={value === identity.id}
          title={identity.name}
          detail={identity.about}
          onPress={() => onChange(identity.id)}
          mark={<Avatar person={identityPerson(identity)} />}
        />
      ))}
      {onManage ? (
        <Button
          label={t('identity.manage')}
          icon={Plus}
          kind="ghost"
          onPress={onManage}
          style={{ alignSelf: 'flex-start' }}
        />
      ) : null}
    </View>
  );
}

interface OptionProps {
  selected: boolean;
  title: string;
  detail: string;
  mark: React.ReactNode;
  onPress: () => void;
}

function Option({ selected, title, detail, mark, onPress }: OptionProps) {
  const theme = useTheme();
  const c = theme.color;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space[3],
        minHeight: theme.touch,
        paddingVertical: theme.space[2],
        paddingHorizontal: theme.space[3],
        borderRadius: theme.radius.md,
        borderWidth: 1.5,
        borderColor: selected ? c.accent : c.border,
        backgroundColor: selected ? c.accentSoft : 'transparent',
      }}
    >
      {mark}
      <View style={{ flex: 1 }}>
        <Txt numberOfLines={1}>{title}</Txt>
        {detail ? (
          <Txt variant="muted" numberOfLines={2}>
            {detail}
          </Txt>
        ) : null}
      </View>
      {selected ? <Check size={20} color={c.accent} /> : null}
    </Pressable>
  );
}
