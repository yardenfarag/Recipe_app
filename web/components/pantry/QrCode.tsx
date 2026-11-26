"use client";

import { useMemo } from "react";
import { encode } from "uqr";

/**
 * A QR code as an SVG, drawn in the theme's text colour on a white quiet zone. Phone cameras need dark on light, so
 * the background stays white in dark mode too (a fixed scanning surface, not a page colour).
 */
export function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const { path, size } = useMemo(() => {
    const qr = encode(value, { ecc: "M", border: 2 });
    let d = "";
    qr.data.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) d += `M${x} ${y}h1v1h-1z`;
      }),
    );
    return { path: d, size: qr.size };
  }, [value]);

  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" className={className}>
      {/* Fixed colours on purpose: a QR code must be dark on white in every theme to scan. */}
      <rect width={size} height={size} fill="#ffffff" rx={1} />
      <path d={path} fill="#111111" />
    </svg>
  );
}
