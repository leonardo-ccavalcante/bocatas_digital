/**
 * OfflinePendingBadge.test.tsx — POS-03 visibility + F033 manual retry.
 *
 * The badge must surface failed syncs distinctly (amber "sin sincronizar"),
 * not fold them into the ordinary "pendiente sin conexión" pending count,
 * and it must offer a "Reintentar" action so failed items are not stranded
 * until connectivity flaps or another check-in is queued offline.
 *
 * MYTHOS: POS-03
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { OfflinePendingBadge } from "../components/OfflinePendingBadge";

afterEach(() => cleanup());

const noop = () => undefined;

describe("OfflinePendingBadge", () => {
  it("renders nothing when the queue is empty and idle", () => {
    const { container } = render(
      <OfflinePendingBadge count={0} failedCount={0} isSyncing={false} onRetry={noop} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("surfaces failed syncs distinctly (POS-03)", () => {
    render(<OfflinePendingBadge count={2} failedCount={2} isSyncing={false} onRetry={noop} />);
    expect(screen.getByText(/2 sin sincronizar/i)).toBeInTheDocument();
    // It must NOT be presented as ordinary pending-offline.
    expect(screen.queryByText(/pendiente/i)).not.toBeInTheDocument();
  });

  it("shows failed AND the non-failed pending remainder side by side", () => {
    // 3 queued, 1 failed → 1 failed + 2 genuinely pending connectivity. Both
    // must be visible: a failure never hides the pending remainder.
    render(<OfflinePendingBadge count={3} failedCount={1} isSyncing={false} onRetry={noop} />);
    expect(screen.getByText(/1 sin sincronizar/i)).toBeInTheDocument();
    expect(screen.getByText(/2 pendientes sin conexión/i)).toBeInTheDocument();
  });

  it("shows pending count when nothing has failed", () => {
    render(<OfflinePendingBadge count={3} failedCount={0} isSyncing={false} onRetry={noop} />);
    expect(screen.getByText(/3 pendientes sin conexión/i)).toBeInTheDocument();
  });

  it("shows the syncing state while a flush is in progress", () => {
    render(<OfflinePendingBadge count={2} failedCount={1} isSyncing={true} onRetry={noop} />);
    expect(screen.getByText(/Sincronizando/i)).toBeInTheDocument();
  });

  it("offers Reintentar when there are failed items and fires onRetry (F033)", () => {
    const onRetry = vi.fn();
    render(<OfflinePendingBadge count={2} failedCount={2} isSyncing={false} onRetry={onRetry} />);

    fireEvent.click(screen.getByRole("button", { name: /reintentar/i }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("hides Reintentar while syncing and when nothing failed", () => {
    render(<OfflinePendingBadge count={2} failedCount={0} isSyncing={false} onRetry={noop} />);
    expect(screen.queryByRole("button", { name: /reintentar/i })).not.toBeInTheDocument();
    cleanup();
    render(<OfflinePendingBadge count={2} failedCount={1} isSyncing={true} onRetry={noop} />);
    expect(screen.queryByRole("button", { name: /reintentar/i })).not.toBeInTheDocument();
  });
});
