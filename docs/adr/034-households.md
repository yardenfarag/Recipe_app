# ADR 034: Households share the list, the pantry and "Always have"

**Status:** Accepted
**Date:** 2026-11-26
**Deciders:** Yarden (product)
**Related:** PIN-181, ADR 024 (backend conventions), ADR 033 (pantry from photos; this ADR changes its "own rows" and "staples in the kitchen profile" points)

## Context

People who live together shop for one fridge. Each person had their own shopping list and, since ADR 033, their own pantry, so two people meant two lists that never agreed. They asked to share them.

## Decision

**Everyone always has a household.** The migration makes one for every existing account, and a trigger makes one for every new account. Until it is set up (given a name and a picture) it is a household of one, and the apps show nothing of it beyond an invitation to set one up. This is what keeps the data model single: every list line and pantry row belongs to a household, and "my own list" is just a household with one person in it.

**What is shared:** the shopping list (`shopping_list_items`), the pantry (`pantry_items`) and "Always have" (`households.staples`). **What stays personal:** recipes, credits, appliances, the kitchen profile (diets, swaps, the avoid list) and pantry scans in progress (`pantry_scan_photos`, `photo_handoffs`). On a shared row, `user_id` says who added it (the list's "Added by") or, for the pantry, who last added or scanned it. Deleting an account clears that and keeps the row for the others.

**Every member is equal.** No owner and no roles: anyone can rename the household, change its picture, invite, remove someone or leave. At most 8 people, one household per person. Each person picks the name the others see (`household_members.display_name`), because profiles have no name.

**Joining and leaving.**
- Joining from a household of one folds it in: my list lines, pantry and "Always have" move over (the same product in the same place keeps the row seen last; "Always have" is the union, at most 40) and my old household is deleted. Joining from a household with other people leaves it to them, and I arrive with nothing.
- Leaving, or being removed, gives that person a new household of one with a copy of the list, pantry and "Always have". The last person can't leave (there is nowhere to go). Removing someone also stops the live invite link, so they can't come straight back with it.
- A household nobody is left in (account deletion included) is deleted with its rows.

**Invites.** One live link per household, valid 7 days. Anyone in it can make a new one (the old one stops) or stop it. The token is 32 random bytes; it is stored so the members can share the same link again, and only the RPCs read it. Only a set-up household can invite. The link's preview works signed out but then shows only the name, picture, who invited and how many people, never who they are.

**How the apps reach it.** Households, members and invites are written only by `security definer` RPCs (`get_my_household`, `set_up_household`, `accept_household_invite`, …), because they touch other people's rows; clients have no grants on those tables. The list and pantry stay direct reads and writes under RLS, scoped by `my_household_id()`. Errors come back as the exception message (`household_full`, `invite_expired`, …), which `shared/lib/supabase/household.ts` maps to `HouseholdErrorCode`. Rows that race (the 8th seat, two people leaving at once) are locked in the RPCs.

**Live updates through change stamps.** Realtime can't filter delete events by household, so the apps don't watch the list and pantry tables. Triggers stamp `households.list_changed_at`, `pantry_changed_at` and `household_changed_at` once per statement, and the apps watch that one row (members can read only their own) and refetch what changed. Their own merge and pending-save rules stay in charge.

**Notifications** are Expo pushes only, and respect `profiles.push_opt_out`:
- Items someone adds to the shared list become one push per burst ("Omer added 4 items to the list"), sent once they've been quiet for 2 minutes (at most 10 minutes after the first). Ticks and removals don't push.
- Someone joining, leaving or being removed is told to the others, and to the person removed.
- "I'm going shopping" is a button: the `household-going-shopping` function tells the others "Dana is going shopping", at most once in 20 hours per person.

The first two are queued in `household_activity` by triggers and RPCs; the `household-activity` function sends them, called every minute by a cron job only while something is due, and each is handed out once. The words are in `_shared/household/householdCopy.ts` in all five languages, in the recipient's app language, and avoid verbs that would have to agree with a member's gender. A tap opens the list, or the household page for member news.

**The pantry rescan reminder** (ADR 033) is per household: due two weeks after anyone in it last scanned, sent only to whoever scanned last, and a scan by anyone starts the clock over for everyone.

**Old app builds** keep working on the shared list without knowing about households: they insert with their own `user_id` only and a trigger fills in the household, they read and edit the whole household's list under the new policies, and their "clear list" removes only the lines they added. They still read and write "Always have" in `profiles.kitchen`, which the new apps no longer use; their staples drift from the household's until they update, which we accept. `profiles.kitchen.pantryStaples` stays until a later migration.

**Two people editing at once.**
- The list: a phone's merge (and every build already in people's hands) saves back each line it fetched, which on a shared list could undo a tick made meanwhile. A trigger drops an update whose `updated_at` is more than 30 seconds older than the row, returning the row unchanged, and stamps every accepted update with the database's time, so a phone clock running ahead can't make others' edits look old. The new client also saves only the lines it changed, and treats a line someone else deleted as gone rather than as an error.
- "Always have": the apps send what they changed (the list before and after), and `set_household_staples` applies that difference to the current list under the household lock, so two people's edits don't overwrite each other.
- "I'm going shopping" gives the 20 hours back (and answers 502 `push_failed`) when there were phones to tell but none was reached.

## Considered options

- **An owner role** (the creator manages members, others can only use the list). Rejected: the people who asked share a home as equals, and an owner who leaves or deletes their account strands everyone else. Equal members need no handover rules.
- **Sharing by pointing at the owner's rows** (members read the owner's `user_id` rows, no household table). Rejected: every policy would need "my rows or the rows of whoever shares with me", leaving would have to split rows by who owned them, and an owner's account deletion would delete everyone's list.
- **Households only for people who share** (a nullable `household_id`, personal rows otherwise). Rejected: every query, policy and merge would have two paths. A household of one costs one row per account.
- **Watching the list and pantry tables over Realtime.** Rejected: deletes can't be filtered, so either everyone receives every household's deletes or the apps miss them.

## Consequences

- `shopping_list_items.user_id` and `pantry_items.user_id` are now nullable (who added it; null once that account is gone).
- The apps need a household screen, the invite page (`/app/join/<token>`), "Added by" on shared rows, the going-shopping button, and "Always have" from `get_my_household` / `set_household_staples` instead of the kitchen profile.
- A later contract migration can drop `profiles.kitchen.pantryStaples` once no supported build reads it.
