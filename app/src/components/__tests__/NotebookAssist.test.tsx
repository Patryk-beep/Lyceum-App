import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NotebookAssist } from "../NotebookAssist";
import { api } from "../../lib/ipc";

vi.mock("../../lib/ipc", () => ({ api: { notebookAssist: vi.fn() } }));

function renderAssist(onAccept = vi.fn(), content = "ser is permanent") {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <NotebookAssist slug="spanish" content={content} onAccept={onAccept} />
    </QueryClientProvider>,
  );
  return onAccept;
}

afterEach(() => vi.clearAllMocks());

describe("NotebookAssist", () => {
  it("requests a suggestion for the chosen mode and accepts it", async () => {
    vi.mocked(api.notebookAssist).mockResolvedValue("ser is ==permanent==");
    const onAccept = renderAssist();

    await userEvent.click(screen.getByTestId("notebook-assist-toggle"));
    await userEvent.click(screen.getByTestId("assist-flashcards"));
    await screen.findByTestId("assist-result");
    expect(api.notebookAssist).toHaveBeenCalledWith(
      "spanish",
      "flashcards",
      "ser is permanent",
    );

    await userEvent.click(screen.getByTestId("assist-accept"));
    expect(onAccept).toHaveBeenCalledWith("ser is ==permanent==");
  });

  it("rejects a suggestion without applying it", async () => {
    vi.mocked(api.notebookAssist).mockResolvedValue("a draft");
    const onAccept = renderAssist();

    await userEvent.click(screen.getByTestId("notebook-assist-toggle"));
    await userEvent.click(screen.getByTestId("assist-summarize"));
    await screen.findByTestId("assist-result");
    await userEvent.click(screen.getByTestId("assist-reject"));

    expect(screen.queryByTestId("assist-result")).not.toBeInTheDocument();
    expect(onAccept).not.toHaveBeenCalled();
  });

  it("is disabled for an empty note", () => {
    renderAssist(vi.fn(), "   ");
    expect(screen.getByTestId("notebook-assist-toggle")).toBeDisabled();
  });
});
