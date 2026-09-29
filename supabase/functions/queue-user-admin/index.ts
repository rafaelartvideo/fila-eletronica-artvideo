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

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const usernamePattern = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeUsername(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

async function caller(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const result = await authClient.auth.getUser(token);
  return result.error ? null : result.data.user;
}

async function canManageUsers(userId: string) {
  const { data: queueUser, error } = await admin
    .from("queue_users")
    .select("role_id,is_active")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !queueUser || queueUser.is_active === false) return false;
  const { data, error: permissionError } = await admin
    .from("queue_role_permissions")
    .select("permission_key")
    .eq("role_id", queueUser.role_id)
    .eq("permission_key", "users.manage")
    .maybeSingle();
  if (permissionError) throw permissionError;
  return Boolean(data);
}

async function ensureRole(roleId: string) {
  const { data, error } = await admin.from("queue_roles").select("id,is_active").eq("id", roleId).maybeSingle();
  if (error || !data || data.is_active === false) throw new Error("Cargo inválido ou inativo.");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const current = await caller(req);
    if (!current || !await canManageUsers(current.id)) {
      return json({ error: "Você não possui permissão para gerenciar usuários." }, 403);
    }

    const body = await req.json();
    const action = String(body?.action ?? "");
    const username = normalizeUsername(body?.username);
    const fullName = String(body?.full_name ?? "").trim();
    const roleId = String(body?.role_id ?? "");
    const password = String(body?.password ?? "");

    if (!usernamePattern.test(username)) {
      return json({ error: "Use de 3 a 32 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado." }, 400);
    }
    if (fullName.length < 2 || fullName.length > 120) return json({ error: "Informe o nome do usuário." }, 400);
    if (!uuidPattern.test(roleId)) return json({ error: "Selecione um cargo válido." }, 400);
    await ensureRole(roleId);

    const { data: sameUsername, error: usernameError } = await admin
      .from("queue_users")
      .select("user_id")
      .eq("username", username)
      .maybeSingle();
    if (usernameError) throw usernameError;

    if (action === "create") {
      if (sameUsername) return json({ error: "Este usuário já está em uso." }, 409);
      if (password.length < 8) return json({ error: "A senha deve ter pelo menos 8 caracteres." }, 400);

      const authEmail = `queue-${crypto.randomUUID()}@auth.artvideo.app`;
      const created = await admin.auth.admin.createUser({
        email: authEmail,
        password,
        email_confirm: true,
        user_metadata: { username, full_name: fullName },
      });
      if (created.error || !created.data.user) {
        const message = String(created.error?.message ?? "").toLowerCase();
        return json({ error: message.includes("password") ? "A senha não atende aos requisitos de segurança." : "Não foi possível criar o usuário." }, 400);
      }

      const { error: insertError } = await admin.from("queue_users").insert({
        user_id: created.data.user.id,
        username,
        full_name: fullName,
        role_id: roleId,
        is_active: body?.is_active !== false,
      });
      if (insertError) {
        await admin.auth.admin.deleteUser(created.data.user.id);
        throw insertError;
      }
      return json({ success: true, user_id: created.data.user.id });
    }

    if (action === "update") {
      const userId = String(body?.user_id ?? "");
      if (!uuidPattern.test(userId)) return json({ error: "Usuário inválido." }, 400);
      if (sameUsername && sameUsername.user_id !== userId) return json({ error: "Este usuário já está em uso." }, 409);
      if (userId === current.id && body?.is_active === false) return json({ error: "Você não pode desativar o próprio acesso." }, 400);

      const authPayload: { password?: string; user_metadata: Record<string, string> } = {
        user_metadata: { username, full_name: fullName },
      };
      if (password) {
        if (password.length < 8) return json({ error: "A nova senha deve ter pelo menos 8 caracteres." }, 400);
        authPayload.password = password;
      }
      const authUpdate = await admin.auth.admin.updateUserById(userId, authPayload);
      if (authUpdate.error) return json({ error: "Não foi possível atualizar a autenticação do usuário." }, 400);

      const { error: updateError } = await admin.from("queue_users").update({
        username,
        full_name: fullName,
        role_id: roleId,
        is_active: body?.is_active !== false,
        updated_at: new Date().toISOString(),
      }).eq("user_id", userId);
      if (updateError) throw updateError;
      return json({ success: true, user_id: userId });
    }

    return json({ error: "Ação inválida." }, 400);
  } catch (error) {
    console.error("[queue-user-admin]", error);
    return json({ error: error instanceof Error ? error.message : "Não foi possível processar o usuário." }, 400);
  }
});
