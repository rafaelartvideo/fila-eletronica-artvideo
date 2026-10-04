import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const url = Deno.env.get("SUPABASE_URL")!;
const secretKey =
  Deno.env.get("SUPABASE_SECRET_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";
const integrationSecret = Deno.env.get("CRM_QUEUE_SHARED_SECRET") ?? "";

const admin = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

function secureEquals(left: string, right: string) {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index];
  return diff === 0;
}

function validFourDigitCode(value: unknown) {
  const code = String(value ?? "").trim();
  return /^\d{4}$/.test(code) ? code : null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  if (!secretKey || !integrationSecret) {
    return json({ error: "Integração com CRM não configurada." }, 503);
  }

  const suppliedSecret = req.headers.get("x-union-integration-secret") ?? "";
  if (!secureEquals(suppliedSecret, integrationSecret)) {
    return json({ error: "Não autorizado." }, 401);
  }

  try {
    const body = await req.json();
    const action = String(body?.action ?? "").trim();

    if (action === "reserve") {
      const code = validFourDigitCode(body?.code);
      if (!code) return json({ error: "Informe um código de 4 dígitos." }, 400);

      const ttlSeconds = Number(body?.ttl_seconds ?? 600);
      const { data, error } = await admin.rpc("reserve_ticket_os_code_for_crm", {
        p_code: code,
        p_ttl_seconds: Number.isFinite(ttlSeconds) ? Math.trunc(ttlSeconds) : 600,
      });
      if (error) throw error;

      const result = Array.isArray(data) ? data[0] : null;
      if (!result?.valid) {
        if (result?.error_code === "rate_limited") {
          return json({ error: "Muitas tentativas. Tente novamente em instantes.", code: "rate_limited" }, 429);
        }
        return json({ error: "Código inválido, expirado ou já reservado.", code: "invalid_code" }, 404);
      }

      return json({
        ok: true,
        ticket_id: result.external_ticket_id,
        ticket_number: result.ticket_number,
        service_type_name: result.service_type_name,
        service_priority: result.service_priority,
        reservation_token: result.reservation_token,
        expires_at: result.expires_at,
      });
    }

    if (action === "consume") {
      const token = String(body?.reservation_token ?? "").trim();
      const crmOrderId = String(body?.crm_order_id ?? "").trim();
      if (!token || !crmOrderId) {
        return json({ error: "Reserva e OS são obrigatórias." }, 400);
      }

      const { data, error } = await admin.rpc("consume_ticket_os_code_for_crm", {
        p_reservation_token: token,
        p_crm_order_id: crmOrderId,
      });
      if (error) throw error;
      if (!data) return json({ error: "Reserva expirada, já utilizada ou inválida." }, 409);
      return json({ ok: true });
    }

    if (action === "release") {
      const token = String(body?.reservation_token ?? "").trim();
      if (!token) return json({ error: "Reserva obrigatória." }, 400);

      const { data, error } = await admin.rpc("release_ticket_os_code_for_crm", {
        p_reservation_token: token,
      });
      if (error) throw error;
      return json({ ok: Boolean(data) });
    }

    return json({ error: "Ação inválida." }, 400);
  } catch (cause) {
    console.error("crm-os-code", cause);
    return json({ error: "Não foi possível processar a integração com o CRM." }, 500);
  }
});
