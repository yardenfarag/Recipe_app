import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import { ChoiceGroup, SwitchRow } from "@/components/settings/controls";
import i18n from "@/lib/i18n";

function Modes({ dir = "ltr" }: { dir?: "ltr" | "rtl" }) {
  const [value, setValue] = useState<"system" | "light" | "dark">("light");
  return (
    <div dir={dir} style={{ direction: dir }}>
      <ChoiceGroup
        label="Light / dark"
        value={value}
        onChange={setValue}
        options={[
          { value: "system", label: "Auto" },
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ]}
      />
    </div>
  );
}

const wrap = (ui: React.ReactNode) => render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);

describe("ChoiceGroup", () => {
  it("is one tab stop, on the chosen option", () => {
    wrap(<Modes />);
    expect(screen.getByRole("radiogroup", { name: "Light / dark" })).toBeDefined();
    expect(screen.getByRole("radio", { name: "Light" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "Light" }).tabIndex).toBe(0);
    expect(screen.getByRole("radio", { name: "Dark" }).tabIndex).toBe(-1);
  });

  it("moves with the arrow keys, and focus follows", () => {
    wrap(<Modes />);
    fireEvent.keyDown(screen.getByRole("radio", { name: "Light" }), { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "Dark" }).getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Dark" }));
    fireEvent.keyDown(screen.getByRole("radio", { name: "Dark" }), { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "Auto" }).getAttribute("aria-checked")).toBe("true");
  });

  it("follows the arrows' direction on screen in a right-to-left page", () => {
    wrap(<Modes dir="rtl" />);
    fireEvent.keyDown(screen.getByRole("radio", { name: "Light" }), { key: "ArrowLeft" });
    expect(screen.getByRole("radio", { name: "Dark" }).getAttribute("aria-checked")).toBe("true");
  });
});

describe("SwitchRow", () => {
  it("is a switch named by its label, and flips", () => {
    const onChange = vi.fn();
    wrap(<SwitchRow label="Adapt new extracts automatically" hint="Uses your allergies" checked={false} onChange={onChange} />);
    const toggle = screen.getByRole("switch", { name: "Adapt new extracts automatically" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
