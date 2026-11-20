import Svg, { Circle, Path } from 'react-native-svg';

import { COOKIE_MARK } from '@shared/constants/cookieMark';

type CookieMarkProps = {
  size?: number;
  color?: string;
  /** Only pass when the mark stands alone as meaningful content; decorative by default. */
  accessibilityLabel?: string;
};

/** App brand glyph — cookie chip mark (replaces wordmark in UI). */
export function CookieMark({ size = 28, color = '#7B6B9A', accessibilityLabel }: CookieMarkProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox={COOKIE_MARK.viewBox}
      {...(accessibilityLabel
        ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel }
        : { accessible: false, importantForAccessibility: 'no-hide-descendants' as const })}
    >
      <Path d={COOKIE_MARK.path} fill={color} />
      {COOKIE_MARK.chips.map((chip) => (
        <Circle key={`${chip.cx}-${chip.cy}`} cx={chip.cx} cy={chip.cy} r={chip.r} fill="#FFFFFF" fillOpacity={chip.opacity} />
      ))}
    </Svg>
  );
}
