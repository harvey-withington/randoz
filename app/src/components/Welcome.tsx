import { View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { t } from '../i18n';
import { useTheme } from '../theme/theme';
import { Txt } from './Txt';

/** The hues of the three "photos" in the picture: three members' colours. */
const HUES = [205, 20, 140];

/**
 * What a wide screen shows beside the group list when no group is open:
 * a fan of three photos, each in a member's colour, and a line to say what
 * to do next.
 */
export function Welcome() {
  const theme = useTheme();
  const c = theme.color;
  const cards = [
    { rotate: -14, x: 26, y: 38, hue: HUES[0] },
    { rotate: 10, x: 124, y: 30, hue: HUES[1] },
    { rotate: -3, x: 74, y: 62, hue: HUES[2] },
  ];
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.space[4],
        padding: theme.space[6],
        backgroundColor: c.bg,
      }}
    >
      <Svg width={280} height={220} viewBox="0 0 280 220" accessible={false}>
        {cards.map((card) => (
          <G key={card.hue} transform={`translate(${card.x} ${card.y}) rotate(${card.rotate} 65 55)`}>
            <Rect width={130} height={110} rx={12} fill={c.surface} stroke={theme.tint(card.hue)} strokeWidth={3} />
            <Rect x={9} y={9} width={112} height={74} rx={6} fill={theme.tintSoft(card.hue)} />
            {/* A sun and two hills: any photo at all. */}
            <Circle cx={96} cy={30} r={9} fill={theme.tint(card.hue)} />
            <Path d="M9 83 L44 44 L70 70 L88 54 L121 83 Z" fill={theme.tint(card.hue)} opacity={0.55} />
            <Circle cx={20} cy={96} r={6} fill={theme.tint(card.hue)} />
            <Rect x={32} y={93} width={52} height={6} rx={3} fill={c.surface3} />
          </G>
        ))}
      </Svg>
      <Txt variant="heading" center>
        {t('welcome.title')}
      </Txt>
      <Txt variant="muted" center style={{ maxWidth: 360 }}>
        {t('welcome.hint')}
      </Txt>
    </View>
  );
}
