import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Notebook } from "../Notebook";
import { api } from "../../lib/ipc";
import type { NotebookEntry, SubjectSummary } from "../../lib/types";

vi.mock("../../lib/ipc", () => ({
  api: {
    listSubjects: vi.fn(),
    listNotebooks: vi.fn(),
    createNotebook: vi.fn(),
    updateNotebook: vi.fn(),
    deleteNotebook: vi.fn(),
  },
}));

const SUBJECTS = [
  { slug: "spanish", subject: "Spanish" },
] as unknown as SubjectSummary[];

function note(over: Partial<NotebookEntry> = {}): NotebookEntry {
  return {
    id: "nb001",
    title: "Verbs",
    content: "ser vs estar",
    createdAt: "2026-06-20",
    updatedAt: "2026-06-20",
    tags: [],
    ...over,
  };
}

function renderNotebook(initial = "/subject/spanish/notebook") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/subject/:slug/notebook" element={<Notebook />} />
          <Route
            path="/subject/:slug/lessons"
            element={<div data-testid="lessons" />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

describe("Notebook", () => {
  it("lists notes and opens one in the editor", async () => {
    vi.mocked(api.listSubjects).mockResolvedValue(SUBJECTS);
    vi.mocked(api.listNotebooks).mockResolvedValue([
      note(),
      note({ id: "nb002", title: "Nouns", content: "el la" }),
    ]);
    renderNotebook();

    await userEvent.click(await screen.findByText("Nouns"));
    expect(
      (screen.getByTestId("notebook-title") as HTMLInputElement).value,
    ).toBe("Nouns");
    expect(
      (screen.getByTestId("notebook-body") as HTMLTextAreaElement).value,
    ).toBe("el la");
  });

  it("creates a note on blur once it has content; an empty draft is never saved", async () => {
    vi.mocked(api.listSubjects).mockResolvedValue(SUBJECTS);
    vi.mocked(api.listNotebooks).mockResolvedValue([]);
    vi.mocked(api.createNotebook).mockResolvedValue(
      note({ id: "nb001", title: "", content: "hi" }),
    );
    renderNotebook();

    const body = await screen.findByTestId("notebook-body");
    await userEvent.click(body);
    await userEvent.tab(); // blur while empty
    expect(api.createNotebook).not.toHaveBeenCalled();

    await userEvent.type(body, "hi");
    await userEvent.tab(); // blur with content
    await waitFor(() =>
      expect(api.createNotebook).toHaveBeenCalledWith(
        "spanish",
        "",
        "hi",
        undefined,
      ),
    );
  });

  it("updates an existing note on blur", async () => {
    vi.mocked(api.listSubjects).mockResolvedValue(SUBJECTS);
    vi.mocked(api.listNotebooks).mockResolvedValue([note()]);
    vi.mocked(api.updateNotebook).mockResolvedValue(
      note({ content: "ser vs estar!!" }),
    );
    renderNotebook();

    await userEvent.click(await screen.findByText("Verbs"));
    await userEvent.type(screen.getByTestId("notebook-body"), "!!");
    await userEvent.tab();
    await waitFor(() =>
      expect(api.updateNotebook).toHaveBeenCalledWith(
        "spanish",
        "nb001",
        "Verbs",
        "ser vs estar!!",
      ),
    );
  });

  it("deletes the open note", async () => {
    vi.mocked(api.listSubjects).mockResolvedValue(SUBJECTS);
    vi.mocked(api.listNotebooks).mockResolvedValue([note()]);
    vi.mocked(api.deleteNotebook).mockResolvedValue(undefined);
    renderNotebook();

    await userEvent.click(await screen.findByText("Verbs"));
    await userEvent.click(screen.getByTestId("notebook-delete"));
    await waitFor(() =>
      expect(api.deleteNotebook).toHaveBeenCalledWith("spanish", "nb001"),
    );
  });

  it("seeds a module-anchored draft from ?module= and links back to the lesson", async () => {
    vi.mocked(api.listSubjects).mockResolvedValue(SUBJECTS);
    vi.mocked(api.listNotebooks).mockResolvedValue([]);
    renderNotebook("/subject/spanish/notebook?module=m02");

    expect(await screen.findByTestId("notebook-lesson-link")).toHaveTextContent(
      "m02",
    );
  });
});
