import { Pressable, TextInput, View } from 'react-native';
import { Search, X } from 'lucide-react-native';
import { t } from '../i18n';
import { useTheme } from '../theme/theme';

interface Props {
  /** What is being searched, read out and shown while empty. */
  label: string;
  value: string;
  onChange: (value: string) => void;
}

/** A one-line search field with a way to clear it. Filters as you type. */
export function SearchBox({ label, value, onChange }: Props) {
  const theme = useTheme();
  const c = theme.color;
  return (
    <View
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: theme.touch,
        paddingLeft: theme.space[3],
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: c.borderStrong,
        backgroundColor: c.bg,
      }}
    >
      <Search size={18} color={c.textFaint} />
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={label}
        placeholderTextColor={c.textFaint}
        returnKeyType="search"
        autoCorrect={false}
        style={{
          flex: 1,
          minHeight: theme.touch,
          paddingHorizontal: theme.space[2],
          color: c.text,
          fontFamily: theme.font.regular,
          fontSize: theme.fontSize.md,
        }}
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.clear')}
          onPress={() => onChange('')}
          style={{ width: theme.touch, height: theme.touch, alignItems: 'center', justifyContent: 'center' }}
        >
          <X size={18} color={c.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}
