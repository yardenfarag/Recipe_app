import type { ReactNode } from "react";

import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminGate } from "@/components/admin/AdminGate";

/**
 * The admin pages (PIN-144). Only admins see them; anyone else gets "not found". The database is what keeps the data
 * private: every admin read and write is an admin-only function or row rule.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminGate>
      <AdminFrame>{children}</AdminFrame>
    </AdminGate>
  );
}
