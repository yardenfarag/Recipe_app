"use client";

import { createContext, useContext, type ReactNode } from "react";

import { useProfile } from "@/lib/settings/useProfile";

type SettingsProfile = ReturnType<typeof useProfile>;

const ProfileContext = createContext<SettingsProfile | null>(null);

/** Reads the profile once for every settings page (the menu shows credits and admin links, Account the photo). */
export function SettingsProfileProvider({ children }: { children: ReactNode }) {
  const profile = useProfile();
  return <ProfileContext.Provider value={profile}>{children}</ProfileContext.Provider>;
}

export function useSettingsProfile(): SettingsProfile {
  const value = useContext(ProfileContext);
  if (!value) throw new Error("useSettingsProfile must be used inside <SettingsProfileProvider>");
  return value;
}
