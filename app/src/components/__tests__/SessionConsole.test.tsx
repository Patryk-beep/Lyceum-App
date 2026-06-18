import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useEngineStore } from "../../stores/useEngineStore";
import { SessionConsole } from "../SessionConsole";

describe("SessionConsole", () => {
  beforeEach(() => useEngineStore.getState().reset());

  it("renders streamed text and the init isolation summary", () => {
    useEngineStore.setState({
      status: "running",
      text: "Hello learner",
      init: {
        sessionId: "s",
        apiKeySource: "none",
        mcpServersEmpty: true,
        lyceumSkills: ["lyceum:learn", "lyceum:teach-lesson"],
        pluginOk: true,
      },
    });
    render(<SessionConsole />);
    expect(screen.getByTestId("session-text")).toHaveTextContent("Hello learner");
    const init = screen.getByTestId("session-init");
    expect(init).toHaveTextContent("Max");
    expect(init).toHaveTextContent("isolated");
    expect(init).toHaveTextContent("skills: 2");
  });

  it("shows the idle placeholder when there is no session", () => {
    render(<SessionConsole />);
    expect(screen.getByTestId("session-text")).toHaveTextContent("No active session");
  });
});
