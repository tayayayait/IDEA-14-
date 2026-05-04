import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getSessionOrRecover } from "@/lib/supabase-auth";
import { Loader2 } from "lucide-react";

export default function Index() {
  const navigate = useNavigate();
  useEffect(() => {
    getSessionOrRecover()
      .then((session) => {
        navigate(session ? "/projects" : "/auth", { replace: true });
      })
      .catch(() => {
        navigate("/auth", { replace: true });
      });
  }, [navigate]);
  return (
    <div className="flex min-h-screen items-center justify-center text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />이동 중…
    </div>
  );
}

