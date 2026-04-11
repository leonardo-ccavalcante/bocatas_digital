import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { createClient } from "./client";

export type BocatasRole = "superadmin" | "admin" | "voluntario" | "beneficiario";

export interface BocatasUser {
  id: string;
  email: string | undefined;
  name: string | null;
  role: BocatasRole;
  avatarUrl: string | null;
}

function getRoleFromSession(session: Session | null): BocatasRole {
  if (!session) return "voluntario";
  const meta = session.user.app_metadata as Record<string, unknown>;
  const role = meta?.role as string | undefined;
  if (role === "superadmin" || role === "admin" || role === "beneficiario") {
    return role;
  }
  return "voluntario";
}

function mapUser(user: User, session: Session): BocatasUser {
  const meta = user.user_metadata as Record<string, unknown>;
  return {
    id: user.id,
    email: user.email,
    name: (meta?.full_name as string | undefined) ?? (meta?.name as string | undefined) ?? null,
    role: getRoleFromSession(session),
    avatarUrl: (meta?.avatar_url as string | undefined) ?? null,
  };
}

export function useSupabaseAuth() {
  const supabase = createClient();
  const [user, setUser] = useState<BocatasUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(mapUser(session.user, session));
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(mapUser(session.user, session));
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return { user, loading, signOut };
}
