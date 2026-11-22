import Link from "next/link";
import { forwardRef, type ComponentPropsWithoutRef } from "react";

/**
 * Next's Link with an id for the activity log (ADR 020), like Button's `trackId`: every press is logged under it.
 * The same as `<Link data-track="…">`; this spells it as a typed prop. Never put anything a person typed in it.
 */
export const TrackedLink = forwardRef<HTMLAnchorElement, ComponentPropsWithoutRef<typeof Link> & { trackId?: string }>(
  function TrackedLink({ trackId, ...props }, ref) {
    return <Link ref={ref} data-track={trackId} {...props} />;
  },
);
