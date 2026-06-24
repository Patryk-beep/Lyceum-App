import { describe, expect, it } from "vitest";

import { insertMarkdown } from "../markdownEdit";

describe("insertMarkdown", () => {
  it("wraps a selection in bold and keeps it selected", () => {
    const r = insertMarkdown("hello world", 6, 11, "bold");
    expect(r.content).toBe("hello **world**");
    expect(r.content.slice(r.selStart, r.selEnd)).toBe("world");
  });

  it("inserts empty wrap markers with the cursor between them", () => {
    const r = insertMarkdown("", 0, 0, "code");
    expect(r.content).toBe("``");
    expect(r.selStart).toBe(1);
    expect(r.selEnd).toBe(1);
  });

  it("prefixes the current line for a heading without disturbing earlier lines", () => {
    const content = "line one\nline two";
    const r = insertMarkdown(content, 12, 12, "h2"); // cursor in "line two"
    expect(r.content).toBe("line one\n## line two");
    expect(r.selStart).toBe(15);
  });

  it("prefixes a checkbox at the line start", () => {
    const r = insertMarkdown("task", 0, 0, "check");
    expect(r.content).toBe("- [ ] task");
  });

  it("makes a link with a url placeholder", () => {
    const r = insertMarkdown("docs", 0, 4, "link");
    expect(r.content).toBe("[docs](url)");
  });
});
