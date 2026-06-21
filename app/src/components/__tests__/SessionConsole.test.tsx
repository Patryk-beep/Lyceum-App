import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useEngineStore } from "../../stores/useEngineStore";
import { SessionConsole } from "../SessionConsole";

const SLUG = "demo";

describe("SessionConsole", () => {
  beforeEach(() => useEngineStore.getState().reset());

  it("renders streamed text and the init isolation summary for its subject", () => {
    const s = useEngineStore.getState();
    s.start(SLUG);
    s.apply(SLUG, {
      kind: "sessionInit",
      data: {
        sessionId: "s",
        model: null,
        apiKeySource: "none",
        mcpServersEmpty: true,
        lyceumSkills: ["lyceum:learn", "lyceum:teach-lesson"],
        pluginOk: true,
      },
    });
    s.apply(SLUG, { kind: "textDelta", data: { turnId: 0, block: 0, text: "Hello learner" } });

    render(<SessionConsole slug={SLUG} />);
    expect(screen.getByTestId("session-text")).toHaveTextContent("Hello learner");
    const init = screen.getByTestId("session-init");
    expect(init).toHaveTextContent("Max");
    expect(init).toHaveTextContent("isolated");
    expect(init).toHaveTextContent("skills: 2");
  });

  it("shows the idle placeholder when that subject has no session", () => {
    render(<SessionConsole slug={SLUG} />);
    expect(screen.getByTestId("session-text")).toHaveTextContent("No active session");
  });
});
