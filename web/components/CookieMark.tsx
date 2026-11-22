import { COOKIE_MARK } from "@shared/constants/cookieMark";

import { cn } from "@/lib/cn";

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

/** Mark and name together, for the phone's top bar and the sign-in pages. The mark sits on a tile in the brand colour. */
export function PinchLogo({ compact = false, narrowCompact = false }: { compact?: boolean; narrowCompact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px] bg-primary text-on-primary">
        <CookieMark size={22} />
      </span>
      {compact ? (
        <span className="sr-only">Pinch</span>
      ) : (
        // `narrowCompact`: the mark alone on the narrowest phones, where the bar beside it needs the room.
        <span className={cn("font-display text-xl font-bold tracking-tight text-text", narrowCompact && "max-[420px]:sr-only")}>Pinch</span>
      )}
    </span>
  );
}
