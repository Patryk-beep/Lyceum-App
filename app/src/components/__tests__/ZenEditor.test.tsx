import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ZenEditor } from "../ZenEditor";
import { useZenStore } from "../../stores/useZenStore";

function renderZen(props: Partial<Parameters<typeof ZenEditor>[0]> = {}) {
  return render(
    <ZenEditor
      inputType="text"
      onSubmit={props.onSubmit ?? vi.fn()}
      brief={props.brief ?? <div data-testid="brief-body">the prompt</div>}
      briefTitle={props.briefTitle ?? "Brief"}
      storageKey={props.storageKey ?? "draft:test:1"}
      submitLabel={props.submitLabel}
      busy={props.busy}
    />,
  );
}

describe("ZenEditor", () => {
  beforeEach(() => {
    useZenStore.setState({ active: false, briefOpen: true, available: false });
    localStorage.clear();
  });

  it("expands from the inline Zen button into the full-cover layer with the brief rail", async () => {
    const user = userEvent.setup();
    renderZen();
    expect(screen.queryByTestId("zen")).toBeNull();
    await user.click(screen.getByTestId("zen-enter"));
    expect(screen.getByTestId("zen")).toBeInTheDocument();
    expect(screen.getByTestId("zen-rail")).toHaveTextContent("the prompt");
  });

  it("toggles the brief rail", async () => {
    const user = userEvent.setup();
    renderZen();
    await user.click(screen.getByTestId("zen-enter"));
    expect(screen.getByTestId("zen-rail")).toBeInTheDocument();
    await user.click(screen.getByTestId("zen-rail-toggle"));
    expect(screen.queryByTestId("zen-rail")).toBeNull();
  });

  it("Esc collapses the open rail first, then exits", async () => {
    const user = userEvent.setup();
    renderZen();
    await user.click(screen.getByTestId("zen-enter"));
    // First Esc: rail (open by default) collapses but we stay in zen.
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("zen-rail")).toBeNull();
    expect(screen.getByTestId("zen")).toBeInTheDocument();
    // Second Esc: exit.
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("zen")).toBeNull();
  });

  it("preserves the draft across the inline→zen switch", async () => {
    const user = userEvent.setup();
    renderZen();
    await user.type(screen.getByTestId("submission-textarea"), "half-written");
    await user.click(screen.getByTestId("zen-enter"));
    expect(screen.getByTestId("submission-textarea")).toHaveValue("half-written");
  });

  it("autosaves to the storageKey and clears it on submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderZen({ onSubmit, storageKey: "draft:test:save" });
    await user.type(screen.getByTestId("submission-textarea"), "keep me");
    await waitFor(() =>
      expect(localStorage.getItem("draft:test:save")).toBe("keep me"),
    );
    await user.click(screen.getByTestId("submission-submit"));
    expect(onSubmit).toHaveBeenCalledWith("keep me");
    expect(localStorage.getItem("draft:test:save")).toBeNull();
  });

  it("cancels the pending autosave on submit so the cleared draft can't resurrect", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderZen({ onSubmit, storageKey: "draft:test:race" });
    await user.type(screen.getByTestId("submission-textarea"), "abc");
    // Submit INSIDE the 600ms debounce window (no waitFor) — a stale timer would re-save.
    await user.click(screen.getByTestId("submission-submit"));
    expect(onSubmit).toHaveBeenCalledWith("abc");
    await new Promise((r) => setTimeout(r, 700));
    expect(localStorage.getItem("draft:test:race")).toBeNull();
  });

  it("restores focus to the Zen trigger on exit", async () => {
    const user = userEvent.setup();
    renderZen();
    await user.click(screen.getByTestId("zen-enter"));
    await user.keyboard("{Escape}"); // collapse rail
    await user.keyboard("{Escape}"); // exit
    await waitFor(() => expect(screen.getByTestId("zen-enter")).toHaveFocus());
  });

  it("passes submitLabel through and focuses the field on enter", async () => {
    const user = userEvent.setup();
    renderZen({ submitLabel: "Submit answer" });
    await user.click(screen.getByTestId("zen-enter"));
    expect(screen.getByTestId("submission-submit")).toHaveTextContent("Submit answer");
    await waitFor(() =>
      expect(screen.getByTestId("submission-textarea")).toHaveFocus(),
    );
  });
});
