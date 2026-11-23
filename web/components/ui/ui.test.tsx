import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";

import { hideToast, showToast } from "@shared/lib/toast";

import { ConfirmDialog, Dialog, DialogContent, DialogTrigger } from "@/components/ui/Dialog";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/Sheet";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { PhotoTile } from "@/components/ui/Tile";
import { ToastHost } from "@/components/ui/Toast";
import { TooltipProvider } from "@/components/ui/Tooltip";
import i18n from "@/lib/i18n";

const wrap = (ui: React.ReactNode) =>
  render(
    <I18nextProvider i18n={i18n}>
      <TooltipProvider>{ui}</TooltipProvider>
    </I18nextProvider>,
  );

describe("Dialog", () => {
  it("is named by its title, closes with Escape, and gives focus back", async () => {
    wrap(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent title="Rename collection" description="Pick a new name." />
      </Dialog>,
    );
    const trigger = screen.getByRole("button", { name: "Open" });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Rename collection" });
    expect(dialog.textContent).toContain("Pick a new name.");

    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("has a labelled close button", async () => {
    wrap(
      <Dialog defaultOpen>
        <DialogContent title="Details" />
      </Dialog>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("ConfirmDialog", () => {
  function Harness({ onConfirm }: { onConfirm: () => Promise<void> }) {
    const [open, setOpen] = useState(true);
    return (
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete recipe?"
        description="This can't be undone."
        confirmLabel="Delete"
        onConfirm={onConfirm}
      />
    );
  }

  it("names the action, runs it, then closes", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    wrap(<Harness onConfirm={onConfirm} />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("Cancel closes without acting", async () => {
    const onConfirm = vi.fn();
    wrap(<Harness onConfirm={onConfirm} />);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("Sheet", () => {
  it("opens as a named dialog and closes with Escape", async () => {
    wrap(
      <Sheet>
        <SheetTrigger>Filters</SheetTrigger>
        <SheetContent title="Filter recipes">
          <p>Tags</p>
        </SheetContent>
      </Sheet>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    const sheet = await screen.findByRole("dialog", { name: "Filter recipes" });
    expect(sheet.textContent).toContain("Tags");
    fireEvent.keyDown(sheet, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("ToastHost", () => {
  afterEach(() => act(() => hideToast()));

  it("reads out a toast politely and replaces the previous one", () => {
    wrap(<ToastHost />);
    act(() => showToast("Link copied"));
    expect(screen.getByRole("status").textContent).toContain("Link copied");
    act(() => showToast("Saved", "info"));
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toContain("Saved");
  });

  it("marks a failure as one", () => {
    wrap(<ToastHost />);
    act(() => showToast("Couldn't save. Try again.", "error"));
    expect(screen.getByRole("status").getAttribute("data-kind")).toBe("error");
    expect(screen.getByRole("status").closest("[aria-live]")?.getAttribute("aria-live")).toBe("polite");
  });
});

describe("States", () => {
  it("an error says so and offers to try again", () => {
    const retry = vi.fn();
    wrap(<ErrorState onRetry={retry} />);
    expect(screen.getByRole("alert").textContent).toContain("Something went wrong");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("an empty state explains and offers the next step", () => {
    wrap(<EmptyState icon={<svg />} title="No recipes yet" body="Snap one to start." action={<button>Snap</button>} />);
    expect(screen.getByRole("heading", { name: "No recipes yet" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Snap" })).toBeDefined();
  });
});

describe("PhotoTile", () => {
  it("shows a placeholder until the photo loads, then fades the photo in", () => {
    const { container } = render(<PhotoTile src="https://example.com/soup.jpg" alt="Soup" priority />);
    const img = screen.getByRole("img", { name: "Soup" });
    expect(img.className).toContain("opacity-0");
    expect(img.getAttribute("fetchpriority")).toBe("high");
    expect(container.querySelector("[class*='animate-pulse']")).not.toBeNull();

    fireEvent.load(img);
    expect(img.className).toContain("opacity-100");
    expect(container.querySelector("[class*='animate-pulse']")).toBeNull();
  });
});
