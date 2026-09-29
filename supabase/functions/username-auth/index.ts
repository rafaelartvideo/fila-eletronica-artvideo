import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json" },
});

const usernamePattern = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const normalizeUsername = (value: unknown) => String(value ?? "").trim().toLowerCase();

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const body = await req.json();
    const username = normalizeUsername(body?.username);
    const password = String(body?.password ?? "");
    if (!usernamePattern.test(username) || !password) return json({ error: "Credenciais inválidas." }, 400);

    const { data: queueUser, error: queueUserError } = await admin
      .from("queue_users")
      .select("user_id,is_active")
      .eq("username", username)
      .maybeSingle();
    if (queueUserError || !queueUser || queueUser.is_active === false) return json({ error: "Credenciais inválidas." }, 400);

    const authResult = await admin.auth.admin.getUserById(queueUser.user_id);
    const email = authResult.data.user?.email;
    if (authResult.error || !email) return json({ error: "Credenciais inválidas." }, 400);

    const client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const signIn = await client.auth.signInWithPassword({ email, password });
    if (signIn.error || !signIn.data.session) return json({ error: "Credenciais inválidas." }, 400);

    return json({
      access_token: signIn.data.session.access_token,
      refresh_token: signIn.data.session.refresh_token,
      expires_at: signIn.data.session.expires_at ?? null,
    });
  } catch (error) {
    console.error("[username-auth]", error);
    return json({ error: "Credenciais inválidas." }, 400);
  }
});
