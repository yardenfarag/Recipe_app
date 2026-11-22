"use client";

import { useState } from "react";

import { parseCreditAmount, shortId } from "@shared/lib/adminFormat";
import { errorText } from "@shared/lib/errorText";
import { adminAdjustRecipeCredits } from "@shared/lib/supabase/profile";
import { showToast } from "@shared/lib/toast";

import { Card, ErrorLine } from "@/components/admin/ui";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";

/**
 * Adds (or, with a minus, takes away) purchased recipe credits on any account, by its user id. The database function
 * (`admin_grant_recipe_credits`) refuses anyone who isn't an admin, and records the change in the ledger.
 */
export function CreditGrantCard({ grant = adminAdjustRecipeCredits }: { grant?: typeof adminAdjustRecipeCredits }) {
  const [userId, setUserId] = useState("");
  const [amount, setAmount] = useState("10");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = userId.trim();
  const parsed = parseCreditAmount(amount);

  async function submit() {
    if (!id || parsed == null || busy) return;
    setBusy(true);
    setError(null);
    try {
      const balance = await grant(id, parsed);
      showToast(`User ${shortId(id)} now has ${balance} purchased credits.`);
      setUserId("");
    } catch (err) {
      setError(`Couldn’t update credits: ${errorText(err, "Please try again.")}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Adjust recipe credits" subtitle="Support tool: enter a profile user ID and a positive or negative amount.">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="grid gap-4 @2xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <TextField
            label="User ID"
            placeholder="user uuid"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="font-mono text-sm"
          />
          <TextField label="Credit amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        {error ? <ErrorLine>{error}</ErrorLine> : null}
        <div>
          <Button type="submit" trackId="admin.usage.grant" busy={busy} disabled={!id || parsed == null}>
            Apply adjustment
          </Button>
        </div>
      </form>
    </Card>
  );
}
