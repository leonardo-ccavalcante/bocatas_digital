import { useCallback, useMemo } from "react";
import { useLocation, useSearch } from "wouter";

export type ProgramTab = "familias" | "mapa" | "reports" | "uploads" | "derivar";

export const PROGRAM_TABS: readonly ProgramTab[] = [
  "familias",
  "mapa",
  "reports",
  "uploads",
  "derivar",
];

const DEFAULT_TAB: ProgramTab = "familias";

/** Single source of truth for which tabs are live in this phase. */
export const ENABLED_TABS: readonly ProgramTab[] = ["familias", "uploads"];

/** Pure: parse the `tab` query param from a URL search string. */
export function parseTabFromSearch(search: string): ProgramTab {
  const params = new URLSearchParams(search);
  const raw = params.get("tab");
  return PROGRAM_TABS.includes(raw as ProgramTab) ? (raw as ProgramTab) : DEFAULT_TAB;
}

/** Pure: build a new search string with the chosen tab applied to the current search. */
export function buildTabSearch(currentSearch: string, tab: ProgramTab): string {
  const next = new URLSearchParams(currentSearch);
  next.set("tab", tab);
  return next.toString();
}

/** React hook that exposes the current tab + a setter that updates the URL. */
export function useTabParam(): [ProgramTab, (tab: ProgramTab) => void] {
  const [, navigate] = useLocation();
  const search = useSearch(); // reactive to ?tab= changes (wouter v3)
  // useSearch returns the search string WITHOUT the leading "?", so prepend
  // it for parseTabFromSearch which expects a URL search component.
  const current = useMemo(() => parseTabFromSearch(`?${search}`), [search]);
  const setTab = useCallback(
    (tab: ProgramTab) => {
      const path = window.location.pathname;
      const next = buildTabSearch(`?${search}`, tab);
      navigate(`${path}?${next}`, { replace: false });
    },
    [navigate, search],
  );
  return [current, setTab];
}
