import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";

export default function AuthCallback() {
  const [, navigate] = useLocation();
  // Stable ref to avoid re-running on navigate reference changes
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    const supabase = createClient();
    const handleCallback = async () => {
      const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
      if (error) {
        navigateRef.current("/login");
      } else {
        navigateRef.current("/");
      }
    };
    handleCallback();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-amber-50">
      <div className="text-center space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600 mx-auto" />
        <p className="text-amber-800 font-medium">Iniciando sesión…</p>
      </div>
    </div>
  );
}
