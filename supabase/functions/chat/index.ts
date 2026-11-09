import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.5-flash";
const MAX_INPUT_CHARS = 4000;
const MAX_HISTORY_MESSAGES = 20;
const FETCH_TIMEOUT_MS = 30000;
const STREAM_IDLE_TIMEOUT_MS = 45000;
const MAX_TOTAL_MS = 60000;

const SYSTEM_INSTRUCTION = [
  "Você é o EstudAI, o assistente de estudos do OrganizAI, feito para estudantes.",
  "Explique conceitos de forma clara, didática e em português do Brasil.",
  "Quando o aluno pedir ajuda com exercícios, guie o raciocínio passo a passo em vez de apenas dar a resposta.",
  "Use exemplos curtos, formatação em Markdown e seja encorajador.",
  "Se a pergunta fugir de estudos, responda brevemente e ofereça ajuda com os estudos.",
].join(" ");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function sse(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const geminiKey = Deno.env.get("GEMINI_API_KEY");

  if (!supabaseUrl || !anonKey) {
    return jsonResponse({ error: "Servidor não configurado." }, 500);
  }

  if (!geminiKey) {
    return jsonResponse(
      { error: "GEMINI_API_KEY não configurada. Defina o secret no Supabase." },
      500,
    );
  }

  const authHeader = req.headers.get("Authorization") ?? "";

  if (!authHeader) {
    return jsonResponse({ error: "Não autenticado." }, 401);
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData?.user) {
    return jsonResponse({ error: "Sessão inválida." }, 401);
  }

  let payload: { conversationId?: string; content?: string; retry?: boolean };

  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "JSON inválido." }, 400);
  }

  const conversationId = (payload.conversationId ?? "").trim();
  const content = (payload.content ?? "").trim();
  const isRetry = payload.retry === true;

  if (!conversationId) {
    return jsonResponse({ error: "conversationId é obrigatório." }, 400);
  }

  if (!content) {
    return jsonResponse({ error: "Mensagem vazia." }, 400);
  }

  if (content.length > MAX_INPUT_CHARS) {
    return jsonResponse({ error: `Mensagem muito longa (máx. ${MAX_INPUT_CHARS} caracteres).` }, 400);
  }

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id, title")
    .eq("id", conversationId)
    .maybeSingle();

  if (conversationError || !conversation) {
    return jsonResponse({ error: "Conversa não encontrada." }, 404);
  }

  const { data: historyDesc } = await supabase
    .from("messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY_MESSAGES);

  const history = (historyDesc ?? []).slice().reverse();
  const lastMessage = history[history.length - 1];
  const skipUserInsert =
    isRetry && lastMessage?.role === "user" && lastMessage.content === content;

  if (!skipUserInsert) {
    const { error: insertUserError } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      role: "user",
      content,
    });

    if (insertUserError) {
      return jsonResponse({ error: "Não foi possível salvar a mensagem." }, 500);
    }
  }

  const contents = history.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  }));

  if (!skipUserInsert) {
    contents.push({ role: "user", parts: [{ text: content }] });
  }

  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents,
    generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
  });

  const modelCandidates = [
    ...new Set([
      GEMINI_MODEL,
      "gemini-3.5-flash",
      "gemini-3.6-flash",
      "gemini-3.7-flash",
      "gemini-3.8-flash",
    ]),
  ];
  const retryableStatuses = new Set([404, 503]);

  let upstream: Response | null = null;
  let lastDetail = "";
  let quotaExceeded = false;
  const startedAt = Date.now();

  for (const model of modelCandidates) {
    if (Date.now() - startedAt > MAX_TOTAL_MS) {
      lastDetail = "Tempo total excedido ao consultar a IA.";
      break;
    }

    const geminiUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let attempt: Response;
    try {
      attempt = await fetch(geminiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": geminiKey,
        },
        body: requestBody,
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timer);
      lastDetail = `Modelo ${model} indisponível (${String(error)}).`;
      break;
    }
    clearTimeout(timer);

    if (attempt.ok && attempt.body) {
      upstream = attempt;
      break;
    }

    lastDetail = await attempt.text().catch(() => "");

    if (attempt.status === 429) {
      quotaExceeded = true;
    }

    if (!retryableStatuses.has(attempt.status)) {
      break;
    }
  }

  if (!upstream || !upstream.body) {
    if (quotaExceeded) {
      return jsonResponse(
        { error: "Limite diário da IA atingido. Tente novamente mais tarde." },
        429,
      );
    }

    return jsonResponse(
      {
        error: "Não consegui falar com a IA agora. Tente novamente em instantes.",
        detail: lastDetail.slice(0, 300),
      },
      502,
    );
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();

      const readWithIdleTimeout = async () => {
        let timer: number | undefined;
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Tempo esgotado aguardando a IA.")),
            STREAM_IDLE_TIMEOUT_MS,
          );
        });

        try {
          return await Promise.race([reader.read(), timeout]);
        } finally {
          if (timer !== undefined) clearTimeout(timer);
        }
      };

      try {
        while (true) {
          const { done, value } = await readWithIdleTimeout();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();

            if (!trimmed.startsWith("data:")) {
              continue;
            }

            const data = trimmed.slice(5).trim();

            if (!data || data === "[DONE]") {
              continue;
            }

            try {
              const parsed = JSON.parse(data);
              const parts = parsed?.candidates?.[0]?.content?.parts ?? [];

              for (const part of parts) {
                if (typeof part?.text === "string" && part.text.length > 0) {
                  fullText += part.text;
                  controller.enqueue(encoder.encode(sse({ delta: part.text })));
                }
              }
            } catch {
              // ignora chunks malformados
            }
          }
        }

        if (fullText.trim().length > 0) {
          const { error: insertAssistantError } = await supabase.from("messages").insert({
            conversation_id: conversationId,
            role: "assistant",
            content: fullText,
          });

          if (insertAssistantError) {
            console.error("Erro ao salvar resposta da IA:", insertAssistantError.message);
          }
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (error) {
        console.error("Erro no streaming:", error);
        try {
          await reader.cancel();
        } catch {
          // ignore
        }
        controller.enqueue(encoder.encode(sse({ error: "Erro ao gerar a resposta." })));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});
