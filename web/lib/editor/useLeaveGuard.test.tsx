import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useLeaveGuard } from "@/lib/editor/useLeaveGuard";

function Page({ active, onBlocked, onAppClick }: { active: boolean; onBlocked: (proceed: () => void) => void; onAppClick: () => void }) {
  const { release } = useLeaveGuard(active, onBlocked);
  return (
    <div>
      {/* Stands in for next/link, which navigates from its own click handler. */}
      <a
        href="/app/list"
        onClick={(event) => {
          event.preventDefault();
          onAppClick();
        }}
      >
        Shopping list
      </a>
      <a href="https://example.com/" target="_blank" rel="noreferrer">
        Elsewhere
      </a>
      <button type="button" onClick={release}>
        Release
      </button>
    </div>
  );
}

describe("useLeaveGuard", () => {
  it("lets links through when there is nothing to lose", () => {
    const onBlocked = vi.fn();
    const onAppClick = vi.fn();
    render(<Page active={false} onBlocked={onBlocked} onAppClick={onAppClick} />);
    fireEvent.click(screen.getByText("Shopping list"));
    expect(onBlocked).not.toHaveBeenCalled();
    expect(onAppClick).toHaveBeenCalledTimes(1);
  });

  it("holds an in-app link back, and follows it when told to", () => {
    let proceed: (() => void) | null = null;
    const onBlocked = vi.fn((next: () => void) => {
      proceed = next;
    });
    const onAppClick = vi.fn();
    render(<Page active onBlocked={onBlocked} onAppClick={onAppClick} />);
    fireEvent.click(screen.getByText("Shopping list"));
    expect(onBlocked).toHaveBeenCalledTimes(1);
    expect(onAppClick).not.toHaveBeenCalled();

    proceed!();
    expect(onAppClick).toHaveBeenCalledTimes(1);
    expect(onBlocked).toHaveBeenCalledTimes(1);
  });

  it("ignores links that open elsewhere, and modified clicks", () => {
    const onBlocked = vi.fn();
    const onAppClick = vi.fn();
    render(<Page active onBlocked={onBlocked} onAppClick={onAppClick} />);
    fireEvent.click(screen.getByText("Elsewhere"));
    fireEvent.click(screen.getByText("Shopping list"), { ctrlKey: true });
    expect(onBlocked).not.toHaveBeenCalled();
  });

  it("asks the browser before the tab closes, until released", () => {
    render(<Page active onBlocked={vi.fn()} onAppClick={vi.fn()} />);
    const first = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(first);
    expect(first.defaultPrevented).toBe(true);

    fireEvent.click(screen.getByText("Release"));
    const second = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(second);
    expect(second.defaultPrevented).toBe(false);
  });
});
