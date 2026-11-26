import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { encode } from 'uqr';

// Fixed colours on purpose: a QR code must be dark on white in every theme and in dark mode to scan, like a printed
// label (the web's QrCode does the same).
const QR_LIGHT = '#FFFFFF';
const QR_DARK = '#111111';

/**
 * A QR code for `value`, drawn with react-native-svg from uqr's matrix (pure JS, so it ships over the air). Each run
 * of dark modules in a row is one rectangle, and the drawing is a whole number of points per module, so no hairline
 * seams show between modules.
 */
export function QrCode({ value, size, label }: { value: string; size: number; label: string }) {
  const { path, modules } = useMemo(() => {
    const qr = encode(value, { ecc: 'M', border: 2 });
    let d = '';
    qr.data.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        if (!row[x]) {
          x += 1;
          continue;
        }
        const start = x;
        while (x < row.length && row[x]) x += 1;
        d += `M${start} ${y}h${x - start}v1h${start - x}z`;
      }
    });
    return { path: d, modules: qr.size };
  }, [value]);

  const drawn = Math.max(modules, Math.floor(size / modules) * modules);

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ width: drawn, height: drawn }}>
      <Svg width={drawn} height={drawn} viewBox={`0 0 ${modules} ${modules}`}>
        <Rect width={modules} height={modules} rx={1} fill={QR_LIGHT} />
        <Path d={path} fill={QR_DARK} />
      </Svg>
    </View>
  );
}
