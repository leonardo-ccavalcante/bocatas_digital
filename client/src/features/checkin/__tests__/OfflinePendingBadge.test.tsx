/**
 * OfflinePendingBadge.test.tsx — POS-03 visibility regression.
 *
 * The badge must surface failed syncs distinctly (amber "sin sincronizar"),
 * not fold them into the ordinary "pendiente sin conexión" pending count.
 *
 * MYTHOS: POS-03
 */
import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { OfflinePendingBadge } from "../components/OfflinePendingBadge";

afterEach(() => cleanup());

describe("OfflinePendingBadge", () => {
  it("renders nothing when the queue is empty and idle", () => {
    const { container } = render(
      <OfflinePendingBadge count={0} failedCount={0} isSyncing={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("surfaces failed syncs distinctly (POS-03)", () => {
    render(<OfflinePendingBadge count={2} failedCount={2} isSyncing={false} />);
    expect(screen.getByText(/2 sin sincronizar/i)).toBeInTheDocument();
    // It must NOT be presented as ordinary pending-offline.
    expect(screen.queryByText(/pendiente/i)).not.toBeInTheDocument();
  });

  it("shows failed AND the non-failed pending remainder side by side", () => {
    // 3 queued, 1 failed → 1 failed + 2 genuinely pending connectivity. Both
    // must be visible: a failure never hides the pending remainder.
    render(<OfflinePendingBadge count={3} failedCount={1} isSyncing={false} />);
    expect(screen.getByText(/1 sin sincronizar/i)).toBeInTheDocument();
    expect(screen.getByText(/2 pendientes sin conexión/i)).toBeInTheDocument();
  });

  it("shows pending count when nothing has failed", () => {
    render(<OfflinePendingBadge count={3} failedCount={0} isSyncing={false} />);
    expect(screen.getByText(/3 pendientes sin conexión/i)).toBeInTheDocument();
  });

  it("shows the syncing state while a flush is in progress", () => {
    render(<OfflinePendingBadge count={2} failedCount={1} isSyncing={true} />);
    expect(screen.getByText(/Sincronizando/i)).toBeInTheDocument();
  });
});
