import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("placeholder page", () => {
  it("shows the Pinch heading", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { level: 1, name: "Pinch" })).toBeDefined();
  });
});
