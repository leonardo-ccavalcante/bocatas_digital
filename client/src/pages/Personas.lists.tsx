/**
 * Personas.lists.tsx — virtualized desktop/mobile person list components.
 *
 * Extracted from Personas.tsx (MYT-121, gh #121) to bring the page file back
 * under the 300-line max-lines cap. This is the virtualization work from the
 * #118 Manus-perf merge — behavior is UNCHANGED, this is a pure relocation,
 * not a rewrite. See Personas.tsx's file header for the v6 perf fixes.
 */
import { useLayoutEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { PersonRowDesktop } from "@/features/persons/components/PersonRowDesktop";
import { PersonCardMobile } from "@/features/persons/components/PersonCardMobile";
import type { PersonRowData } from "@/features/persons/components/PersonRowDesktop";

/**
 * Hook that resolves the AppShell <main> scroll container via a layout effect,
 * so the ref is always populated before the virtualizer reads it.
 * This avoids the null-on-first-render bug that caused the virtualizer to
 * render 0 items and then re-render all of them.
 */
function useScrollContainer(): React.RefObject<HTMLElement | null> {
  const ref = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    ref.current = document.querySelector("main.flex-1.overflow-y-auto") as HTMLElement | null;
  }, []);
  return ref;
}

// ─── Virtualized Desktop List ─────────────────────────────────────────────────

export interface VirtualizedDesktopListProps {
  rows: PersonRowData[];
  activePersonId: string | null;
  onMouseEnter: (id: string) => void;
  rowHeight: number;
}

export function VirtualizedDesktopList({
  rows,
  activePersonId,
  onMouseEnter,
  rowHeight,
}: VirtualizedDesktopListProps) {
  // Fix 2: resolve scroll container via layout effect so it's never null on
  // first render (null → virtualizer renders 0 items → re-render all items).
  const scrollContainerRef = useScrollContainer();

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => rowHeight,
    overscan: 5,
  });

  const items = virtualizer.getVirtualItems();
  const totalHeight = virtualizer.getTotalSize();

  return (
    <ul
      aria-label="Lista de personas"
      className="relative"
      style={{ height: `${totalHeight}px` }}
    >
      {items.map((virtualItem) => {
        const p = rows[virtualItem.index];
        return (
          <PersonRowDesktop
            key={p.id}
            person={p}
            active={activePersonId === p.id}
            compact={false}
            onMouseEnter={() => onMouseEnter(p.id)}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`,
              borderBottom: "1px solid var(--border)",
            }}
          />
        );
      })}
    </ul>
  );
}

// ─── Virtualized Mobile List ──────────────────────────────────────────────────

export interface VirtualizedMobileListProps {
  rows: PersonRowData[];
  rowHeight: number;
}

export function VirtualizedMobileList({ rows, rowHeight }: VirtualizedMobileListProps) {
  // Fix 2: same scroll container resolution via layout effect
  const scrollContainerRef = useScrollContainer();

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => rowHeight,
    overscan: 5,
  });

  const items = virtualizer.getVirtualItems();
  const totalHeight = virtualizer.getTotalSize();

  return (
    <ul
      aria-label="Lista de personas"
      className="sm:hidden relative"
      style={{ height: `${totalHeight}px` }}
    >
      {items.map((virtualItem) => {
        const p = rows[virtualItem.index];
        return (
          <li
            key={p.id}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtualItem.start}px)`,
              paddingBottom: "8px",
            }}
          >
            <PersonCardMobile person={p} />
          </li>
        );
      })}
    </ul>
  );
}
