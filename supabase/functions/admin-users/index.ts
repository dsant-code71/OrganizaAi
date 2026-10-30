import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validUsername(value: string) {
  return /^[a-z0-9._-]{3,40}$/.test(value);
}

function validCpf(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 11;
}

function validPassword(value: string) {
  return value.length >= 8;
}

function validRole(value: string): value is "gestor" | "operador" {
  return value === "gestor" || value === "operador";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Método não permitido." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: "Função sem configuração do Supabase." }, 500);
  }

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return json({ error: "Não autenticado." }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser(token);

  if (authError || !authData.user) {
    return json({ error: "Sessão inválida." }, 401);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: caller, error: callerError } = await admin
    .from("profiles")
    .select("id, nome_completo, role, ativo")
    .eq("id", authData.user.id)
    .single();

  if (callerError || !caller || caller.role !== "gestor" || caller.ativo !== true) {
    return json({ error: "Acesso negado." }, 403);
  }

  let body: Record<string, unknown>;

  try {
    body = await req.json();
  } catch {
    return json({ error: "Corpo da requisição inválido." }, 400);
  }

  const action = clean(body.action);

  async function audit(
    acao: string,
    entidade: string | null,
    entidadeId: string | null,
    detalhe: Record<string, unknown> = {},
  ) {
    await admin.from("audit_log").insert({
      actor_id: caller.id,
      actor_nome: caller.nome_completo,
      actor_role: caller.role,
      acao,
      entidade,
      entidade_id: entidadeId,
      detalhe,
    });
  }

  try {
    if (action === "create") {
      const nome = clean(body.nome_completo);
      const username = clean(body.username).toLowerCase();
      const cpf = clean(body.cpf);
      const email = clean(body.email).toLowerCase();
      const password = typeof body.password === "string" ? body.password : "";
      const role = clean(body.role) || "operador";

      if (!nome || !username || !cpf || !email || !password) {
        return json({ error: "Preencha todos os campos obrigatórios." }, 400);
      }

      if (!validEmail(email)) {
        return json({ error: "E-mail inválido." }, 400);
      }

      if (!validUsername(username)) {
        return json({ error: "Usuário deve ter de 3 a 40 caracteres e usar apenas letras, números, ponto, hífen ou sublinhado." }, 400);
      }

      if (!validCpf(cpf)) {
        return json({ error: "CPF inválido." }, 400);
      }

      if (!validPassword(password)) {
        return json({ error: "A senha deve ter pelo menos 8 caracteres." }, 400);
      }

      if (!validRole(role)) {
        return json({ error: "Perfil inválido." }, 400);
      }

      const { data: criado, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nome_completo: nome, username, cpf },
      });

      if (createError || !criado.user) {
        return json({ error: createError?.message || "Não foi possível criar o usuário." }, 400);
      }

      const { error: profileError } = await admin.from("profiles").insert({
        id: criado.user.id,
        nome_completo: nome,
        username,
        cpf,
        email,
        role,
        ativo: true,
        must_change_password: true,
        created_by: caller.id,
      });

      if (profileError) {
        await admin.auth.admin.deleteUser(criado.user.id);
        return json({ error: profileError.message }, 400);
      }

      await audit("USUARIO_CRIADO", "profiles", criado.user.id, { username, role });

      return json({ ok: true, id: criado.user.id });
    }

    if (action === "update") {
      const id = clean(body.id);

      if (!id) {
        return json({ error: "Usuário não informado." }, 400);
      }

      const { data: atual, error: atualError } = await admin
        .from("profiles")
        .select("*")
        .eq("id", id)
        .single();

      if (atualError || !atual) {
        return json({ error: "Usuário não encontrado." }, 404);
      }

      const updates: Record<string, unknown> = {};

      if (body.nome_completo !== undefined) {
        const nome = clean(body.nome_completo);

        if (!nome) {
          return json({ error: "Nome completo é obrigatório." }, 400);
        }

        updates.nome_completo = nome;
      }

      if (body.username !== undefined) {
        const username = clean(body.username).toLowerCase();

        if (!validUsername(username)) {
          return json({ error: "Usuário inválido." }, 400);
        }

        updates.username = username;
      }

      if (body.cpf !== undefined) {
        const cpf = clean(body.cpf);

        if (!validCpf(cpf)) {
          return json({ error: "CPF inválido." }, 400);
        }

        updates.cpf = cpf;
      }

      if (body.email !== undefined) {
        const email = clean(body.email).toLowerCase();

        if (!validEmail(email)) {
          return json({ error: "E-mail inválido." }, 400);
        }

        updates.email = email;
      }

      if (body.role !== undefined) {
        const role = clean(body.role);

        if (!validRole(role)) {
          return json({ error: "Perfil inválido." }, 400);
        }

        updates.role = role;
      }

      if (body.ativo !== undefined) {
        const ativo = body.ativo === true;

        if (id === caller.id && ativo === false) {
          return json({ error: "Você não pode desativar seu próprio usuário." }, 400);
        }

        updates.ativo = ativo;
      }

      if (Object.keys(updates).length === 0) {
        return json({ error: "Nenhuma alteração informada." }, 400);
      }

      if (updates.email && updates.email !== atual.email) {
        const { error: emailError } = await admin.auth.admin.updateUserById(id, {
          email: updates.email as string,
          email_confirm: true,
        });

        if (emailError) {
          return json({ error: emailError.message }, 400);
        }
      }

      if (updates.ativo !== undefined) {
        const { error: banError } = await admin.auth.admin.updateUserById(id, {
          ban_duration: updates.ativo === true ? "none" : "876000h",
        });

        if (banError) {
          return json({ error: banError.message }, 400);
        }
      }

      const { error: updateError } = await admin
        .from("profiles")
        .update(updates)
        .eq("id", id);

      if (updateError) {
        return json({ error: updateError.message }, 400);
      }

      await audit("USUARIO_ATUALIZADO", "profiles", id, updates);

      return json({ ok: true });
    }

    if (action === "reset-password") {
      const id = clean(body.id);
      const password = typeof body.password === "string" ? body.password : "";

      if (!id || !validPassword(password)) {
        return json({ error: "Informe uma senha com pelo menos 8 caracteres." }, 400);
      }

      const { error: passwordError } = await admin.auth.admin.updateUserById(id, { password });

      if (passwordError) {
        return json({ error: passwordError.message }, 400);
      }

      const { error: profileError } = await admin
        .from("profiles")
        .update({ must_change_password: true })
        .eq("id", id);

      if (profileError) {
        return json({ error: profileError.message }, 400);
      }

      await audit("SENHA_REDEFINIDA", "profiles", id);

      return json({ ok: true });
    }

    if (action === "deactivate") {
      const id = clean(body.id);

      if (!id) {
        return json({ error: "Usuário não informado." }, 400);
      }

      if (id === caller.id) {
        return json({ error: "Você não pode desativar seu próprio usuário." }, 400);
      }

      const { error: banError } = await admin.auth.admin.updateUserById(id, {
        ban_duration: "876000h",
      });

      if (banError) {
        return json({ error: banError.message }, 400);
      }

      const { error: profileError } = await admin
        .from("profiles")
        .update({ ativo: false })
        .eq("id", id);

      if (profileError) {
        return json({ error: profileError.message }, 400);
      }

      await audit("USUARIO_DESATIVADO", "profiles", id);

      return json({ ok: true });
    }

    if (action === "reactivate") {
      const id = clean(body.id);

      if (!id) {
        return json({ error: "Usuário não informado." }, 400);
      }

      const { error: banError } = await admin.auth.admin.updateUserById(id, {
        ban_duration: "none",
      });

      if (banError) {
        return json({ error: banError.message }, 400);
      }

      const { error: profileError } = await admin
        .from("profiles")
        .update({ ativo: true })
        .eq("id", id);

      if (profileError) {
        return json({ error: profileError.message }, 400);
      }

      await audit("USUARIO_REATIVADO", "profiles", id);

      return json({ ok: true });
    }

    return json({ error: "Ação inválida." }, 400);
  } catch (erro) {
    console.error(erro);
    return json({ error: "Erro inesperado ao processar a solicitação." }, 500);
  }
});
