import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthForm } from "./AuthForm";

export const metadata: Metadata = { title: "Sign in · Pinch" };

/** Sign in, sign up, sign in with an emailed code, and forgot password. ?mode=, ?next= and ?reason= set it up. */
export default function AuthPage() {
  // The form reads the address bar, which only exists in the browser.
  return (
    <Suspense>
      <AuthForm />
    </Suspense>
  );
}
