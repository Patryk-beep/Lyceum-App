import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RichMarkdown } from "../RichMarkdown";

// mermaid is lazy-imported and can't lay out headless (jsdom has no getBBox), so it's
// mocked. "A real diagram renders" is a MANUAL/live check, not a unit test.
vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    parse: vi.fn(),
    render: vi.fn(),
  },
}));

// Imported after vi.mock so this is the mocked default — used as a typed handle to vary
// parse/render behavior per test.
import mermaid from "mermaid";

const FENCE = "```mermaid\ngraph TD; A-->B;\n```";

function renderMd(md: string) {
  return render(
    <article className="reader">
      <RichMarkdown>{md}</RichMarkdown>
    </article>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(mermaid.parse).mockResolvedValue(true as never);
  vi.mocked(mermaid.render).mockResolvedValue({
    svg: "<svg data-mmd='1'><g/></svg>",
  } as never);
});

describe("MermaidDiagram", () => {
  it("wires a ```mermaid fence to a rendered, sanitized diagram", async () => {
    const { container } = renderMd(FENCE);
    await waitFor(() =>
      expect(container.querySelector(".reader__mermaid svg")).toBeInTheDocument(),
    );
    expect(mermaid.render).toHaveBeenCalledTimes(1);
    // Unwrapped: the diagram is NOT nested inside a <pre>.
    expect(container.querySelector("pre .reader__mermaid")).toBeNull();
  });

  it("sanitizes hostile SVG from mermaid before injecting it (DOMPurify regression net)", async () => {
    // mermaid's output is the dangerouslySetInnerHTML sink and csp:null means DOMPurify is
    // the ONLY guard — pin that it strips <script>/event handlers from the rendered SVG.
    vi.mocked(mermaid.render).mockResolvedValueOnce({
      svg:
        "<svg><script>globalThis.__pwned=1</script>" +
        "<g onclick=\"globalThis.__pwned=1\"></g></svg>",
    } as never);
    const { container } = renderMd(FENCE);
    await waitFor(() =>
      expect(container.querySelector(".reader__mermaid")).toBeInTheDocument(),
    );
    const host = container.querySelector(".reader__mermaid")!;
    expect(host.querySelector("script")).toBeNull();
    expect(host.querySelector("g")?.hasAttribute("onclick")).toBe(false);
    expect((globalThis as Record<string, unknown>).__pwned).toBeUndefined();
  });

  it("falls back to the raw source in a <pre> when mermaid can't parse", async () => {
    vi.mocked(mermaid.parse).mockRejectedValueOnce(new Error("Parse error"));
    const { container } = renderMd(FENCE);
    const pre = await screen.findByText(/graph TD; A-->B;/);
    expect(pre.closest("pre")).toBeInTheDocument();
    expect(container.querySelector(".reader__mermaid svg")).toBeNull();
  });

  it("gives concurrent diagrams distinct render ids (no #id collision)", async () => {
    const { container } = renderMd(`${FENCE}\n\n${FENCE}`);
    await waitFor(() =>
      expect(container.querySelectorAll(".reader__mermaid svg")).toHaveLength(2),
    );
    const ids = vi.mocked(mermaid.render).mock.calls.map((c) => c[0]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2); // unique → no querySelector('#id') collision
    expect(ids.every((id) => !id.includes(":"))).toBe(true); // colons stripped from useId
  });
});
