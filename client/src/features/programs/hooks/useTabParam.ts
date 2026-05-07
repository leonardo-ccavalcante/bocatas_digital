import { useCallback, useMemo } from "react";
import { useLocation } from "wouter";

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
  const [location, navigate] = useLocation();
  const current = useMemo(() => parseTabFromSearch(window.location.search), [location]);
  const setTab = useCallback(
    (tab: ProgramTab) => {
      const path = window.location.pathname;
      const search = buildTabSearch(window.location.search, tab);
      navigate(`${path}?${search}`, { replace: false });
    },
    [navigate],
  );
  return [current, setTab];
}
