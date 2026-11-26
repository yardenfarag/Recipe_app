"use client";

import { useParams } from "next/navigation";

import { JoinHousehold } from "@/components/household/JoinHousehold";

/**
 * An invite to a household (ADR 034): /join/<token>, the link householdInviteUrl makes. Open to guests, who see
 * whose household it is and sign up or in to join.
 */
export default function JoinHouseholdPage() {
  const { token } = useParams<{ token: string }>();
  return <JoinHousehold token={token ?? ""} />;
}
