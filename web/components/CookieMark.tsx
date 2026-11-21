import { COOKIE_MARK } from "@shared/constants/cookieMark";

/** The Pinch cookie mark. Decorative unless given a label. */
export function CookieMark({ size = 24, className = "", label }: { size?: number; className?: string; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={COOKIE_MARK.viewBox}
      className={className}
      fill="currentColor"
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <path d={COOKIE_MARK.path} />
      {COOKIE_MARK.chips.map((chip) => (
        <circle key={`${chip.cx}-${chip.cy}`} cx={chip.cx} cy={chip.cy} r={chip.r} fill="#FFFFFF" fillOpacity={chip.opacity} />
      ))}
    </svg>
  );
}

/** Mark and name together, for the sidebar and sign-in pages. */
export function PinchLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary">
        <CookieMark size={20} />
      </span>
      {compact ? <span className="sr-only">Pinch</span> : <span className="text-lg font-bold tracking-tight text-text">Pinch</span>}
    </span>
  );
}
