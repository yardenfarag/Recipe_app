import { useThemePreference } from '@/hooks/useThemePreference';

/** Active palette for the resolved light/dark scheme. */
export function useTheme() {
  return useThemePreference().colors;
}
