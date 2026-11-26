"use client";

import { House } from "lucide-react";

import { householdAvatarDataUri, householdAvatarIdFrom } from "@shared/lib/householdAvatars";
import { memberInitial } from "@shared/lib/household";

import { ProfileAvatar } from "@/components/settings/ProfileAvatar";
import { cn } from "@/lib/cn";

/**
 * A household's picture: one of the household drawings (householdAvatars.ts), which bring their own rounded-square
 * shape so a household never looks like a person; a house on the soft brand colour when it has none yet.
 * Decorative: say the household's name next to it.
 */
export function HouseholdAvatar({ value, className }: { value: string | null | undefined; className?: string }) {
  const id = householdAvatarIdFrom(value);
  if (id) {
    // A drawing that ships with the app; the SVG is already the right shape.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={householdAvatarDataUri(id)} alt="" aria-hidden className={cn("block shrink-0", className)} />;
  }
  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center rounded-[26%] bg-primary-soft text-primary-text", className)}>
      <House className="h-1/2 w-1/2" />
    </span>
  );
}

/**
 * A person in a household: their profile picture, or the first letter of their household name. Decorative. The
 * letter is sized in em: give the circle a font size equal to its height (`h-11 w-11 text-[44px]`).
 */
export function MemberAvatar({ name, avatarUrl, className }: { name: string; avatarUrl: string | null; className?: string }) {
  return (
    <ProfileAvatar
      url={avatarUrl}
      className={className}
      fallback={<span className="font-display text-[0.42em] leading-none font-bold">{memberInitial(name)}</span>}
    />
  );
}

/**
 * The people in a household as overlapping circles: up to `max`, then "+n". Decorative: give the names in text
 * (or `aria-label` on what holds it). Each circle is ringed in the page colour so the overlap reads.
 */
export function AvatarStack({
  people,
  max = 4,
  size = "md",
  className,
}: {
  people: { displayName: string; avatarUrl: string | null }[];
  max?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const shown = people.length > max ? people.slice(0, max - 1) : people;
  const more = people.length - shown.length;
  // The font size is the circle's size, so the initial (sized in em) scales with it.
  const dimension = size === "sm" ? "h-7 w-7 text-[28px]" : size === "lg" ? "h-11 w-11 text-[44px]" : "h-9 w-9 text-[36px]";
  return (
    <span aria-hidden className={cn("flex items-center", className)}>
      {shown.map((person, index) => (
        <MemberAvatar
          key={`${person.displayName}-${index}`}
          name={person.displayName}
          avatarUrl={person.avatarUrl}
          className={cn(dimension, "ring-2 ring-surface", index > 0 && "-ms-2")}
        />
      ))}
      {more > 0 ? (
        <span className={cn(dimension, "-ms-2 grid shrink-0 place-items-center rounded-full bg-element font-display font-bold text-text ring-2 ring-surface")}>
          <span className="text-[0.36em] leading-none" dir="ltr">
            +{more}
          </span>
        </span>
      ) : null}
    </span>
  );
}
