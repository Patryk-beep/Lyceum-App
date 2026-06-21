import { act, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Track listen()/unlisten() so we can assert exactly one live listener survives a
// StrictMode mount→cleanup→mount cycle (the async-cleanup race that doubled events).
const h = vi.hoisted(() => ({
  added: 0,
  removed: 0,
  resolvers: [] as Array<(fn: () => void) => void>,
}));

vi.mock("../engine", () => ({
  subscribeSession: () => {
    h.added += 1;
    return new Promise<() => void>((resolve) => h.resolvers.push(resolve));
  },
}));

import { useSessionSubscription } from "../useSession";

function Probe() {
  useSessionSubscription();
  return null;
}

describe("useSessionSubscription", () => {
  afterEach(() => {
    h.added = 0;
    h.removed = 0;
    h.resolvers = [];
  });

  it("keeps exactly one live listener across a StrictMode mount cycle", async () => {
    render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );
    // StrictMode mounted → cleaned up → mounted again, so listen() was called twice
    // with the first effect already torn down before its promise resolves.
    expect(h.added).toBe(2);

    // Resolve both pending listen() promises now (after the cleanup ran).
    await act(async () => {
      for (const resolve of h.resolvers) resolve(() => (h.removed += 1));
      await Promise.resolve();
    });

    // The torn-down listener must unlisten itself; net = one live listener.
    expect(h.added - h.removed).toBe(1);
  });
});
