"use client";

import { useParams, usePathname } from "next/navigation";
import { useMemo } from "react";

/**
 * The name a page goes by in the activity log and in in-app message `screens` (ADR 020): the route pattern, never
 * the real address, so no recipe id or share token is logged ("/recipe/[id]", not "/recipe/9f1c…").
 *
 * Screens that are the same as on mobile get the mobile name, so the Activity page counts them together and an
 * admin's screen list works on both apps: the five main pages are the mobile tabs ("/(tabs)", "/(tabs)/hub" …),
 * everything else already has the same path ("/recipe/[id]", "/settings/credits", "/s/[token]").
 */
const MOBILE_TABS: Record<string, string> = {
  "/": "/(tabs)",
  "/hub": "/(tabs)/hub",
  "/add": "/(tabs)/add",
  "/list": "/(tabs)/list",
  "/settings": "/(tabs)/settings",
};

type Params = Record<string, string | string[] | undefined> | null;

/** An id-looking segment on a page Next has no params for (a mistyped address): never logged as is. */
const ID_LIKE = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+|(?=[A-Za-z_-]*\d)[A-Za-z0-9_-]{16,})$/i;

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** "/recipe/abc" with params { id: "abc" } is "/recipe/[id]". Pure, for tests. */
export function screenNameFor(pathname: string | null, params: Params): string {
  const path = (pathname ?? "/").split(/[?#]/)[0] || "/";
  const values = new Map<string, string>();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (typeof value === "string") values.set(value, `[${key}]`);
    else if (Array.isArray(value)) for (const part of value) values.set(part, `[...${key}]`);
  }
  const segments: string[] = [];
  for (const raw of path.split("/").filter(Boolean)) {
    const segment = decode(raw);
    const pattern = values.get(segment) ?? (ID_LIKE.test(segment) ? "[id]" : segment);
    // A catch-all is one entry, however many segments it spans.
    if (pattern.startsWith("[...") && segments[segments.length - 1] === pattern) continue;
    segments.push(pattern);
  }
  const name = `/${segments.join("/")}`;
  return MOBILE_TABS[name] ?? name;
}

/** The current page's screen name. */
export function useScreenName(): string {
  const pathname = usePathname();
  const params = useParams();
  return useMemo(() => screenNameFor(pathname, params as Params), [pathname, params]);
}
