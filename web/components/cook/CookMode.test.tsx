import { DirectionProvider } from "@radix-ui/react-direction";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CookMode, type CookModeTimers } from "@/components/cook/CookMode";
import { TooltipProvider } from "@/components/ui/Tooltip";
import i18n from "@/lib/i18n";

const steps = [
  { step: 1, text: "Whisk the flour and milk." },
  { step: 2, text: "Rest the batter for 10 minutes." },
  { step: 3, text: "Cook on a hot pan." },
];

function noTimers(overrides: Partial<CookModeTimers> = {}): CookModeTimers {
  return { timers: [], now: 0, start: vi.fn(), stop: vi.fn(), ...overrides };
}

function Harness({
  dir = "ltr",
  onCooked,
  timers = noTimers(),
  onClose = vi.fn(),
}: {
  dir?: "ltr" | "rtl";
  onCooked?: () => void;
  timers?: CookModeTimers;
  onClose?: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(true);
  return (
    <I18nextProvider i18n={i18n}>
      <DirectionProvider dir={dir}>
        <TooltipProvider>
          <CookMode
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              if (!next) onClose();
            }}
            title="Fluffy Pancakes"
            steps={steps}
            direction="ltr"
            contentLanguage="en"
            index={index}
            onIndexChange={setIndex}
            timers={timers}
            onCooked={onCooked}
          />
        </TooltipProvider>
      </DirectionProvider>
    </I18nextProvider>
  );
}

const stepText = () => screen.getByTestId("cook-mode-step").textContent;
const dialog = () => screen.getByRole("dialog", { name: "Fluffy Pancakes" });

afterEach(() => {
  Reflect.deleteProperty(navigator, "wakeLock");
});

describe("CookMode", () => {
  it("shows one step at a time, with Next and Back", () => {
    render(<Harness />);
    expect(dialog()).toBeDefined();
    expect(screen.getByText("Step 1 of 3")).toBeDefined();
    expect(stepText()).toBe("Whisk the flour and milk.");
    expect(screen.getByRole("button", { name: "Back" }).hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(stepText()).toBe("Rest the batter for 10 minutes.");
    expect(screen.getByText("Step 2 of 3")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(stepText()).toBe("Whisk the flour and milk.");
  });

  it("jumps to a step from the progress bar", () => {
    render(<Harness />);
    const segments = screen.getAllByRole("button", { name: /web\.cook\.goToStep|Go to step/ });
    expect(segments).toHaveLength(3);
    fireEvent.click(segments[2]);
    expect(stepText()).toBe("Cook on a hot pan.");
    expect(segments[2].getAttribute("aria-current")).toBe("step");
  });

  it("moves with the arrow keys, Space and Home/End", () => {
    render(<Harness />);
    fireEvent.keyDown(dialog(), { key: "ArrowRight" });
    expect(stepText()).toBe("Rest the batter for 10 minutes.");
    fireEvent.keyDown(dialog(), { key: "ArrowLeft" });
    expect(stepText()).toBe("Whisk the flour and milk.");
    fireEvent.keyDown(dialog(), { key: " " });
    expect(stepText()).toBe("Rest the batter for 10 minutes.");
    fireEvent.keyDown(dialog(), { key: "End" });
    expect(stepText()).toBe("Cook on a hot pan.");
    fireEvent.keyDown(dialog(), { key: "Home" });
    expect(stepText()).toBe("Whisk the flour and milk.");
  });

  it("in a right-to-left app, the left arrow goes forward", () => {
    render(<Harness dir="rtl" />);
    fireEvent.keyDown(dialog(), { key: "ArrowLeft" });
    expect(stepText()).toBe("Rest the batter for 10 minutes.");
    fireEvent.keyDown(dialog(), { key: "ArrowRight" });
    expect(stepText()).toBe("Whisk the flour and milk.");
  });

  it("finishes on a last screen with I cooked this, which also closes", () => {
    const onCooked = vi.fn();
    const onClose = vi.fn();
    render(<Harness onCooked={onCooked} onClose={onClose} />);
    fireEvent.keyDown(dialog(), { key: "End" });
    fireEvent.click(screen.getByRole("button", { name: /web\.cook\.finish|Finish/ }));
    expect(screen.getByRole("heading", { name: "That’s it" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "I cooked this" }));
    expect(onCooked).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("starts over from the last screen", () => {
    render(<Harness />);
    fireEvent.keyDown(dialog(), { key: "End" });
    fireEvent.keyDown(dialog(), { key: "ArrowRight" });
    expect(screen.queryByRole("button", { name: "I cooked this" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /web\.cook\.startOver|Start over/ }));
    expect(stepText()).toBe("Whisk the flour and milk.");
  });

  it("offers a timer for a time in the step, and shows running ones", () => {
    const start = vi.fn();
    const timers = noTimers({
      start,
      now: 0,
      timers: [{ id: "a", label: "10 minutes", step: 2, seconds: 600, endsAt: 125_000 }],
    });
    render(<Harness timers={timers} />);
    fireEvent.keyDown(dialog(), { key: "ArrowRight" });
    fireEvent.click(screen.getByRole("button", { name: "Start 10 minutes timer" }));
    expect(start).toHaveBeenCalledWith("10 minutes", 600, 2);
    expect(screen.getByRole("timer").textContent).toBe("2:05");
  });

  it("closes with the close button", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close cook mode" }));
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the screen awake where the browser allows", async () => {
    const release = vi.fn(() => Promise.resolve());
    const request = vi.fn(() => Promise.resolve({ released: false, release, addEventListener: vi.fn() }));
    Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
    render(<Harness />);
    await act(async () => {});
    expect(request).toHaveBeenCalledWith("screen");
    expect(screen.getByText(/web\.cook\.screenOn|Screen stays on/)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Close cook mode" }));
    expect(release).toHaveBeenCalled();
  });
});
