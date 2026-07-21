import Svg, { Circle, Path } from 'react-native-svg';

type CookieMarkProps = {
  size?: number;
  color?: string;
};

/** App brand glyph — cookie chip mark (replaces wordmark in UI). */
export function CookieMark({ size = 28, color = '#7B6B9A' }: CookieMarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityLabel="Pinch">
      <Path
        d="M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A9,9 0 0,0 21,12C21,11.5 20.96,11 20.87,10.5C20.6,10 20,10 20,10H18V9C18,8 17,8 17,8H15V7C15,6 14,6 14,6H13V4C13,3 12,3 12,3Z"
        fill={color}
      />
      <Circle cx="9.5" cy="7.5" r="1.5" fill="#FFFFFF" fillOpacity={0.55} />
      <Circle cx="6.5" cy="11.5" r="1.5" fill="#FFFFFF" fillOpacity={0.45} />
      <Circle cx="11.5" cy="12.5" r="1.5" fill="#FFFFFF" fillOpacity={0.5} />
      <Circle cx="16.5" cy="14.5" r="1.5" fill="#FFFFFF" fillOpacity={0.4} />
      <Circle cx="11" cy="17.5" r="1.5" fill="#FFFFFF" fillOpacity={0.45} />
    </Svg>
  );
}
