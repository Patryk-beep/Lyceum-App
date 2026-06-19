import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SubmissionEditor } from "../SubmissionEditor";

describe("SubmissionEditor", () => {
  it("submits typed markdown content", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<SubmissionEditor inputType="markdown" onSubmit={onSubmit} />);
    await user.type(screen.getByTestId("submission-textarea"), "Hello **world**");
    await user.click(screen.getByTestId("submission-submit"));
    expect(onSubmit).toHaveBeenCalledWith("Hello **world**");
  });

  it("disables submit until there is content", () => {
    render(<SubmissionEditor inputType="text" onSubmit={vi.fn()} />);
    expect(screen.getByTestId("submission-submit")).toBeDisabled();
  });

  it("submits a selected multiple-choice option", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <SubmissionEditor
        inputType="choice"
        options={["ser", "estar", "haber"]}
        onSubmit={onSubmit}
      />,
    );
    await user.click(screen.getAllByTestId("submission-choice")[1]);
    await user.click(screen.getByTestId("submission-submit"));
    expect(onSubmit).toHaveBeenCalledWith("estar");
  });

  it("loads a text file into the hand-in via the file picker", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<SubmissionEditor inputType="file" onSubmit={onSubmit} />);
    const file = new File(["answer from file"], "a.txt", { type: "text/plain" });
    await user.upload(screen.getByTestId("submission-file-input"), file);
    const ta = screen.getByTestId("submission-textarea") as HTMLTextAreaElement;
    await waitFor(() => expect(ta.value).toContain("answer from file"));
    await user.click(screen.getByTestId("submission-submit"));
    expect(onSubmit).toHaveBeenCalledWith("answer from file");
  });

  it("toggles a markdown preview", async () => {
    const user = userEvent.setup();
    render(<SubmissionEditor inputType="markdown" onSubmit={vi.fn()} />);
    await user.type(screen.getByTestId("submission-textarea"), "# Title");
    await user.click(screen.getByTestId("submission-preview-toggle"));
    expect(screen.getByTestId("submission-preview")).toBeInTheDocument();
  });
});
