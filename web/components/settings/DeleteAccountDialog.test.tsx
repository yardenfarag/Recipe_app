import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { DeleteAccountDialog } from "@/components/settings/AccountSettings";
import { addSettingsStrings } from "@/components/settings/testStrings";
import i18n from "@/lib/i18n";

const mocks = vi.hoisted(() => ({ deleteAccount: vi.fn() }));
vi.mock("@shared/lib/supabase/auth", () => ({ deleteAccount: mocks.deleteAccount }));
vi.mock("@/lib/auth", () => ({ signOut: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

beforeAll(addSettingsStrings);
beforeEach(() => {
  mocks.deleteAccount.mockReset();
});

function open(onDeleted = vi.fn()) {
  render(
    <I18nextProvider i18n={i18n}>
      <DeleteAccountDialog open onOpenChange={vi.fn()} email="cook@example.com" onDeleted={onDeleted} />
    </I18nextProvider>,
  );
  return onDeleted;
}

describe("DeleteAccountDialog", () => {
  it("says what goes, and only deletes once the email is typed", async () => {
    mocks.deleteAccount.mockResolvedValue(undefined);
    const onDeleted = open();
    expect(screen.getByRole("dialog", { name: "Delete account?" })).toBeDefined();
    expect(screen.getByText(/permanently deletes your recipes/)).toBeDefined();

    const confirm = screen.getByRole("button", { name: "Delete account" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/type your email/), { target: { value: "cook@example" } });
    expect(confirm.disabled).toBe(true);
    // Case and spaces don't matter, as when signing in.
    fireEvent.change(screen.getByLabelText(/type your email/), { target: { value: " Cook@Example.com " } });
    expect(confirm.disabled).toBe(false);

    fireEvent.click(confirm);
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(mocks.deleteAccount).toHaveBeenCalledTimes(1);
  });

  it("keeps the dialog open and says why when deleting fails", async () => {
    mocks.deleteAccount.mockRejectedValue(new Error("Server said no"));
    const onDeleted = open();
    fireEvent.change(screen.getByLabelText(/type your email/), { target: { value: "cook@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Server said no");
    expect(onDeleted).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeDefined();
  });
});
