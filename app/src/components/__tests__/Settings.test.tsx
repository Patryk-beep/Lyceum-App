import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { Settings } from "../../routes/Settings";
import { useThemeStore } from "../../stores/useThemeStore";

describe("Settings", () => {
  beforeEach(() => useThemeStore.getState().setTheme("night"));

  it("switches the active theme", async () => {
    const user = userEvent.setup();
    render(<Settings />);
    expect(useThemeStore.getState().theme).toBe("night");

    await user.click(screen.getByTestId("theme-almanac"));
    expect(useThemeStore.getState().theme).toBe("almanac");

    await user.click(screen.getByTestId("theme-momentum"));
    expect(useThemeStore.getState().theme).toBe("momentum");

    await user.click(screen.getByTestId("theme-aurelia-dark"));
    expect(useThemeStore.getState().theme).toBe("aurelia-dark");
  });
});
