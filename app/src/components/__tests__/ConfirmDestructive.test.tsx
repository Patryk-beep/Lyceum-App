import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConfirmDestructive } from "../ConfirmDestructive";

describe("ConfirmDestructive", () => {
  it("keeps the danger button disabled until the confirm word is typed exactly", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDestructive
        title="Delete it?"
        body="gone forever"
        confirmWord="my-slug"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    const danger = screen.getByTestId("confirm-danger");
    expect(danger).toBeDisabled();

    fireEvent.change(screen.getByTestId("confirm-input"), { target: { value: "wrong" } });
    expect(danger).toBeDisabled();

    fireEvent.change(screen.getByTestId("confirm-input"), { target: { value: "my-slug" } });
    expect(danger).toBeEnabled();
    danger.click();
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("is armed immediately when no confirm word is required", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDestructive
        title="Delete it?"
        body="gone"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    expect(screen.queryByTestId("confirm-input")).toBeNull();
    const danger = screen.getByTestId("confirm-danger");
    expect(danger).toBeEnabled();
    danger.click();
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
