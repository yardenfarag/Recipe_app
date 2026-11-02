/**
 * Admin access comes from profiles.is_admin, the same flag every admin RPC and
 * RLS policy checks. There is no email allowlist: anything in EXPO_PUBLIC_*
 * ships in the public bundle (PIN-54).
 */
export function isAdminUser(opts: { isAdmin?: boolean | null }): boolean {
  return opts.isAdmin === true;
}
