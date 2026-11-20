/** The Pinch cookie mark, drawn on a 24×24 grid. Each app renders it with its own SVG component. */
export const COOKIE_MARK = {
  viewBox: '0 0 24 24',
  path: 'M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A9,9 0 0,0 21,12C21,11.5 20.96,11 20.87,10.5C20.6,10 20,10 20,10H18V9C18,8 17,8 17,8H15V7C15,6 14,6 14,6H13V4C13,3 12,3 12,3Z',
  /** The chips: white dots at these opacities. */
  chips: [
    { cx: 9.5, cy: 7.5, r: 1.5, opacity: 0.55 },
    { cx: 6.5, cy: 11.5, r: 1.5, opacity: 0.45 },
    { cx: 11.5, cy: 12.5, r: 1.5, opacity: 0.5 },
    { cx: 16.5, cy: 14.5, r: 1.5, opacity: 0.4 },
    { cx: 11, cy: 17.5, r: 1.5, opacity: 0.45 },
  ],
} as const;
