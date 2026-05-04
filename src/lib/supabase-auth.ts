import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  clearSupabaseAuthStorage,
  isInvalidRefreshTokenError,
} from "@/lib/supabase-auth-session";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export async function clearInvalidAuthSession(error: unknown): Promise<boolean> {
  if (!isInvalidRefreshTokenError(error)) return false;

  if (typeof window !== "undefined") {
    clearSupabaseAuthStorage(window.localStorage, SUPABASE_URL);
  }

  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  return true;
}

export async function getSessionOrRecover(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (!error) return data.session;

  const recovered = await clearInvalidAuthSession(error);
  if (recovered) return null;

  throw error;
}
