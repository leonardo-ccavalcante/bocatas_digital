import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect } from "react";
import { identifyStaff, resetPostHog } from "./client";
import { STAFF_ROLES } from "./events";

/**
 * Identifies the current STAFF user in PostHog (id + role only) and resets on
 * logout. Beneficiaries never authenticate, so non-staff/anonymous sessions are
 * never identified. Mount once near the app root.
 */
export function useIdentifyStaff(): void {
  const { user, isAuthenticated } = useAuth();
  const id = user?.id;
  const role = user?.role;

  useEffect(() => {
    if (isAuthenticated && id != null && role && STAFF_ROLES.has(role)) {
      identifyStaff(String(id), role);
      return;
    }
    resetPostHog();
  }, [isAuthenticated, id, role]);
}
