import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getSessionOrRecover } from "@/lib/supabase-auth";
import { Session } from "@supabase/supabase-js";

export function useAuthGuard() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) navigate("/auth", { replace: true });
    });
    getSessionOrRecover()
      .then((currentSession) => {
        setSession(currentSession);
        if (!currentSession) navigate("/auth", { replace: true });
      })
      .catch(() => {
        setSession(null);
        navigate("/auth", { replace: true });
      })
      .finally(() => {
        setLoading(false);
      });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  return { session, loading };
}
