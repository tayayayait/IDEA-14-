import { createClient, type User } from "npm:@supabase/supabase-js@2";

type AuthSuccess = { ok: true; user: User };
type AuthFailure = { ok: false; response: Response };

export async function requireAuthenticatedUser(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<AuthSuccess | AuthFailure> {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return {
      ok: false,
      response: json({ error: "missing or invalid authorization header" }, 401, corsHeaders),
    };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      ok: false,
      response: json({ error: "supabase env missing" }, 500, corsHeaders),
    };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return {
      ok: false,
      response: json({ error: "unauthorized" }, 401, corsHeaders),
    };
  }

  return { ok: true, user: data.user };
}

function json(body: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
