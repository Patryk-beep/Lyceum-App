import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../../lib/ipc";
import { RichMarkdown } from "../RichMarkdown";

// The SVG-file channel fetches through read_artifact; mock the IPC surface.
vi.mock("../../lib/ipc", () => ({
  api: { readArtifact: vi.fn() },
}));

function renderMd(md: string, slug?: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <article className="reader">
        <RichMarkdown slug={slug}>{md}</RichMarkdown>
      </article>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("RichMarkdown", () => {
  it("renders a GFM table", () => {
    const { container } = renderMd("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(container.querySelector("table")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("renders block math as KaTeX", () => {
    const { container } = renderMd("$$x^2 + y^2$$");
    expect(container.querySelector(".katex")).toBeInTheDocument();
  });

  it("does not throw on malformed math and keeps the source readable", () => {
    // throwOnError:false → rehype-katex renders the error inline instead of crashing the
    // whole render. The guarantee: a bad $$ block never blanks the lesson.
    const { container } = renderMd("Before $$\\frac{1}{$$ after");
    expect(container).toBeInTheDocument();
    expect(container.textContent).toContain("Before");
    expect(container.textContent).toContain("after");
  });

  it("leaves bare single-dollar prose alone (singleDollarTextMath off)", () => {
    const { container } = renderMd("It costs $5 to $10 per item.");
    // No KaTeX: bare $ is not math, so the prose renders verbatim.
    expect(container.querySelector(".katex")).toBeNull();
    expect(container.textContent).toContain("$5 to $10");
  });

  it("captions an external/remote image instead of fetching it (offline by construction)", () => {
    // No <img> is ever rendered for a remote URL — that would be a network beacon under
    // csp:null. It degrades straight to the alt caption.
    const { container } = renderMd("![a labeled flowchart](https://x.test/diagram.png)");
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("a labeled flowchart")).toBeInTheDocument();
  });

  it("serves a contained .svg through read_artifact as a blob image", async () => {
    vi.mocked(api.readArtifact).mockResolvedValue("<svg><circle r='4'/></svg>");
    renderMd("![a venn diagram](assets/m03-1.svg)", "calc");
    const img = await screen.findByAltText("a venn diagram");
    expect(img).toHaveAttribute("src", "blob:mock-svg");
    expect(api.readArtifact).toHaveBeenCalledWith("calc", "assets/m03-1.svg");
  });

  it("never routes a ../ escape to the IPC channel — degrades to a caption", () => {
    renderMd("![escape attempt](../assets/x.svg)", "calc");
    expect(screen.getByText("escape attempt")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
    expect(api.readArtifact).not.toHaveBeenCalled();
  });

  it("degrades a slug-less relative svg to a caption (no channel without a slug)", () => {
    renderMd("![no slug](assets/m03-1.svg)");
    expect(screen.getByText("no slug")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
    expect(api.readArtifact).not.toHaveBeenCalled();
  });
});
