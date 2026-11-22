"use client";

import { useMemo, useState } from "react";

import { formatDate } from "@shared/lib/adminDashboard";
import { parseCreditAmount } from "@shared/lib/adminFormat";
import { errorText } from "@shared/lib/errorText";
import { FREE_MONTHLY_EXTRACT_LIMIT } from "@shared/lib/quotas";
import { adminDeleteUser, fetchAdminPeople, type AdminPerson } from "@shared/lib/supabase/adminPeople";
import { adminAdjustRecipeCredits } from "@shared/lib/supabase/profile";
import { showToast } from "@shared/lib/toast";

import { useAuth } from "@/components/AuthProvider";
import { Badge, Card, EmptyLine, ErrorLine, SearchBox, Skeleton, TableWrap, numClass, tableClass, tdClass, thClass } from "@/components/admin/ui";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAdminData } from "@/lib/admin/useAdminData";
import { cn } from "@/lib/cn";

/** Every account, with a way to add or take recipe credits and to delete an account. */
export function PeoplePage({
  load = fetchAdminPeople,
  adjust = adminAdjustRecipeCredits,
  remove = adminDeleteUser,
}: {
  load?: typeof fetchAdminPeople;
  adjust?: typeof adminAdjustRecipeCredits;
  remove?: typeof adminDeleteUser;
}) {
  const { user } = useAuth();
  const { data, error, loading, reload, setData } = useAdminData("people", load, "Could not load people.");
  const people = useMemo(() => data ?? [], [data]);
  const [query, setQuery] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminPerson | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return people;
    return people.filter((p) => p.email?.toLowerCase().includes(needle) || p.id.toLowerCase().includes(needle));
  }, [people, query]);

  async function applyCredits(person: AdminPerson) {
    const amount = parseCreditAmount(amounts[person.id] ?? "");
    if (amount == null || busyId) return;
    setActionError(null);
    setBusyId(person.id);
    try {
      const balance = await adjust(person.id, amount);
      setData((current) => current?.map((row) => (row.id === person.id ? { ...row, purchasedCredits: balance } : row)) ?? current);
      setAmounts((current) => ({ ...current, [person.id]: "" }));
      showToast(`${person.email ?? "This account"} now has ${balance} purchased credits.`);
    } catch (err) {
      setActionError(`Couldn’t update credits: ${errorText(err, "Please try again.")}`);
    } finally {
      setBusyId(null);
    }
  }

  async function deleteAccount(person: AdminPerson) {
    setActionError(null);
    setBusyId(person.id);
    try {
      await remove(person.id);
      setData((current) => current?.filter((row) => row.id !== person.id) ?? current);
      showToast(`Deleted ${person.email ?? person.id}.`);
    } catch (err) {
      setActionError(`Couldn’t delete account: ${errorText(err, "Please try again.")}`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="People"
        tabTitle="Admin people"
        subtitle={`${people.length} accounts. Purchased credits never expire. Free extracts reset monthly (${FREE_MONTHLY_EXTRACT_LIMIT} each).`}
        actions={
          <Button variant="outline" size="sm" trackId="admin.users.refresh" onClick={reload} busy={loading && data != null}>
            Refresh
          </Button>
        }
      />
      {error ? (
        <div className="mb-5">
          <ErrorLine>{error}</ErrorLine>
        </div>
      ) : null}
      <Card
        title="Accounts"
        subtitle="To add credits type a number such as 10; to take some away, -5."
        actions={<SearchBox label="Search email" value={query} onChange={setQuery} />}
      >
        {actionError ? (
          <div className="mb-4">
            <ErrorLine>{actionError}</ErrorLine>
          </div>
        ) : null}
        {!data && loading ? (
          <Skeleton className="h-64" />
        ) : visible.length === 0 ? (
          <EmptyLine>{people.length === 0 ? "No accounts." : "Nobody matches."}</EmptyLine>
        ) : (
          <TableWrap>
            <table className={tableClass}>
              <thead>
                <tr>
                  <th scope="col" className={thClass}>Account</th>
                  <th scope="col" className={thClass}>Plan</th>
                  <th scope="col" className={cn(thClass, numClass)}>Purchased</th>
                  <th scope="col" className={cn(thClass, numClass)}>Free used this month</th>
                  <th scope="col" className={thClass}>Joined</th>
                  <th scope="col" className={thClass}>Adjust credits</th>
                  <th scope="col" className={thClass}>
                    <span className="sr-only">Delete</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((person) => {
                  const name = person.email ?? person.id;
                  const busy = busyId === person.id;
                  const self = person.id === user?.id;
                  return (
                    <tr key={person.id}>
                      <td className={cn(tdClass, "max-w-72")}>
                        <span className="block truncate font-semibold">{person.email ?? "No email"}</span>
                        <span className="mt-0.5 flex flex-wrap gap-1">
                          {person.isAdmin ? <Badge>admin</Badge> : null}
                          {self ? <Badge>you</Badge> : null}
                        </span>
                      </td>
                      <td className={tdClass}>{person.plan}</td>
                      <td className={cn(tdClass, numClass)}>{person.purchasedCredits}</td>
                      <td className={cn(tdClass, numClass)}>{person.freeExtractsUsed}</td>
                      <td className={cn(tdClass, "whitespace-nowrap")}>{formatDate(person.joinedAt)}</td>
                      <td className={tdClass}>
                        <form
                          className="flex items-center gap-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void applyCredits(person);
                          }}
                        >
                          <input
                            inputMode="numeric"
                            aria-label={`Credit amount, ${name}`}
                            placeholder="+10 or -5"
                            value={amounts[person.id] ?? ""}
                            onChange={(e) => setAmounts((current) => ({ ...current, [person.id]: e.target.value }))}
                            className="h-10 w-28 rounded-btn border border-border bg-surface px-3 text-sm text-text transition-[border-color,box-shadow] placeholder:text-muted/80 hover:border-muted/60 focus:border-primary focus:ring-4 focus:ring-primary/15"
                          />
                          <Button
                            type="submit"
                            size="sm"
                            trackId="admin.users.adjust_credits"
                            busy={busy}
                            disabled={parseCreditAmount(amounts[person.id] ?? "") == null || (busyId != null && !busy)}
                            aria-label={`Apply adjustment, ${name}`}
                          >
                            Apply
                          </Button>
                        </form>
                      </td>
                      <td className={cn(tdClass, "text-end")}>
                        {self ? null : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-danger"
                            trackId="admin.users.delete"
                            disabled={busyId != null}
                            aria-label={`Delete account, ${name}`}
                            onClick={() => setDeleting(person)}
                          >
                            Delete
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
      <ConfirmDialog
        open={deleting != null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this account?"
        description={deleting ? `${deleting.email ?? deleting.id} and their recipes will be removed. This cannot be undone.` : undefined}
        confirmLabel="Delete"
        trackId="admin.users.delete_dialog"
        onConfirm={async () => {
          if (deleting) await deleteAccount(deleting);
        }}
      />
    </>
  );
}
