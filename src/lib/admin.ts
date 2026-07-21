/**
 * Admin access: email allowlist (EXPO_PUBLIC_ADMIN_EMAILS) and/or profiles.is_admin.
 */

function parseAdminEmails(): Set<string> {
  const raw = process.env.EXPO_PUBLIC_ADMIN_EMAILS ?? '';
  return new Set(
    raw
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return parseAdminEmails().has(email.trim().toLowerCase());
}

export function isAdminUser(opts: {
  email?: string | null;
  isAdmin?: boolean | null;
}): boolean {
  return opts.isAdmin === true || isAdminEmail(opts.email);
}
