import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Provider = "gemini" | "groq" | "openrouter" | "deepseek";
type Candidate = { provider: Provider; model: string };
type ChatMessage = { role: string; content: string };
type Usage = {
  promptTokens?: number;
  completionTokens?: number;
  thoughtTokens?: number;
  totalTokens?: number;
};
type StreamState = { finishReason?: string };
type Boundary = { index: number; fenceOpen: boolean };
type OpenUpstreamResult =
  | { ok: true; upstream: Response; candidate: Candidate }
  | { ok: false; quotaExceeded: boolean; detail: string };

const MAX_INPUT_CHARS = 4000;
const MAX_HISTORY_MESSAGES = 20;
const FETCH_TIMEOUT_MS = 30000;
const STREAM_IDLE_TIMEOUT_MS = 45000;
const MAX_TOTAL_MS = 60000;

const SYSTEM_INSTRUCTION = [
  "Você é o EstudAI, o assistente de estudos do OrganizAI, feito para estudantes.",
  "Explique conceitos de forma clara, didática e em português do Brasil.",
  "Calibre sempre o nível da resposta conforme o nível da pergunta: se for uma dúvida de matéria universitária, responda como um professor universitário, com rigor conceitual, terminologia adequada à disciplina, clareza e coesão; para perguntas mais introdutórias (ensino fundamental ou médio), use uma linguagem simples e acessível, sem sacrificar a correção.",
  "Quando o aluno pedir ajuda com exercícios, guie o raciocínio passo a passo em vez de apenas dar a resposta.",
  "Use exemplos curtos, formatação em Markdown e seja encorajador.",
  "Se a pergunta fugir de estudos, responda brevemente e ofereça ajuda com os estudos.",
  "Quando a resposta for longa, organize-a em partes coesas e termine cada parte em um ponto natural, como fim de parágrafo, item de lista, fim de frase ou bloco de código fechado.",
  "Se ainda houver conteúdo para continuar, escreva exatamente [[CONTINUE]] na última linha da sua resposta, sem deixar tabelas ou blocos de código abertos. Caso a resposta esteja completa, não escreva o marcador.",
].join(" ");

const VALID_PROVIDERS = new Set<Provider>(["gemini", "groq", "openrouter", "deepseek"]);

const DEFAULT_CHAIN: Candidate[] = [
  { provider: "groq", model: "openai/gpt-oss-120b" },
  { provider: "groq", model: "qwen/qwen3.8-27b" },
  { provider: "groq", model: "openai/gpt-oss-20b" },
  { provider: "gemini", model: "gemini-3.8-flash" },
  { provider: "gemini", model: "gemini-3.5-flash-lite" },
  { provider: "openrouter", model: "openrouter/free" },
];

const OPENAI_BASE_URLS: Record<Exclude<Provider, "gemini">, string> = {
  groq: "https://api.groq.com/openai/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
  deepseek: "https://api.deepseek.com/chat/completions",
};

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = Deno.env.get(name);
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

const LEGACY_MAX_OUTPUT_TOKENS = Deno.env.get("AI_MAX_OUTPUT_TOKENS");
const SEGMENT_MAX_OUTPUT_TOKENS = envInt(
  "AI_SEGMENT_MAX_TOKENS",
  LEGACY_MAX_OUTPUT_TOKENS ? Number.parseInt(LEGACY_MAX_OUTPUT_TOKENS, 10) || 1024 : 1024,
  256,
  4096,
);
const TOTAL_OUTPUT_TOKENS = envInt("AI_TOTAL_OUTPUT_TOKENS", 8192, SEGMENT_MAX_OUTPUT_TOKENS, 32768);
const MAX_SEGMENTS = envInt("AI_MAX_SEGMENTS", 8, 1, 20);
const CONTINUATION_MAX_MS = envInt("AI_CONTINUATION_DEADLINE_MS", 120000, 30000, 300000);
const SEGMENT_SOFT_TOKEN_RATIO = 0.8;
const CONTINUATION_MARKER = "[[CONTINUE]]";
const CONTINUE_INSTRUCTION =
  "Continue exatamente de onde a resposta anterior parou, sem repetir o conteúdo já escrito. Mantenha a mesma formatação em Markdown. Não escreva o marcador [[CONTINUE]] se a resposta estiver completa.";
const MAX_HISTORY_CHARS = envInt("AI_HISTORY_MAX_CHARS", 6000, 1000, 20000);
const GEMINI_THINKING_LEVEL = (Deno.env.get("GEMINI_THINKING_LEVEL") ?? "low").toLowerCase();
const GROQ_REASONING_EFFORT_RAW = Deno.env.get("GROQ_REASONING_EFFORT")?.trim().toLowerCase();
const GROQ_REASONING_EFFORT = GROQ_REASONING_EFFORT_RAW ?? "low";
const GROQ_QWEN_REASONING_EFFORT = GROQ_REASONING_EFFORT_RAW ?? "none";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function sse(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function getProviderKey(provider: Provider): string | undefined {
  switch (provider) {
    case "gemini":
      return Deno.env.get("GEMINI_API_KEY") ?? undefined;
    case "groq":
      return Deno.env.get("GROQ_API_KEY") ?? undefined;
    case "openrouter":
      return Deno.env.get("OPENROUTER_API_KEY") ?? undefined;
    case "deepseek":
      return Deno.env.get("DEEPSEEK_API_KEY") ?? undefined;
  }
}

function parseChain(raw: string): Candidate[] {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const separator = part.indexOf(":");
      if (separator <= 0 || separator === part.length - 1) {
        return [];
      }

      const provider = part.slice(0, separator).trim().toLowerCase() as Provider;
      const model = part.slice(separator + 1).trim();

      if (!VALID_PROVIDERS.has(provider) || !model) {
        return [];
      }

      return [{ provider, model }];
    });
}

function resolveChain(): Candidate[] {
  const raw = Deno.env.get("AI_CHAIN")?.trim();
  const configured = raw ? parseChain(raw) : null;
  const chain = configured ?? [...DEFAULT_CHAIN];
  const legacyModel = Deno.env.get("GEMINI_MODEL")?.trim();

  if (!configured && legacyModel) {
    const index = chain.findIndex((candidate) => candidate.provider === "gemini");

    if (index >= 0) {
      chain[index] = { provider: "gemini", model: legacyModel };
    } else {
      chain.push({ provider: "gemini", model: legacyModel });
    }
  }

  const seen = new Set<string>();

  return chain.filter((candidate) => {
    const key = `${candidate.provider}:${candidate.model}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function trimMessages(messages: ChatMessage[], maxChars: number): ChatMessage[] {
  const kept: ChatMessage[] = [];
  let total = 0;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const content = message.content.length > MAX_INPUT_CHARS
      ? message.content.slice(0, MAX_INPUT_CHARS)
      : message.content;

    if (kept.length > 0 && total + content.length > maxChars) {
      break;
    }

    kept.unshift({ role: message.role, content });
    total += content.length;
  }

  while (kept.length > 1 && kept[0].role === "assistant") {
    kept.shift();
  }

  return kept;
}

function isLengthFinish(reason?: string): boolean {
  if (!reason) {
    return false;
  }

  const normalized = reason.toLowerCase();
  return normalized === "length" || normalized === "max_tokens" || normalized === "max tokens";
}

function approximateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

class ContinuationFilter {
  private buffer = "";
  markerFound = false;

  push(chunk: string): string {
    this.buffer += chunk;

    if (this.buffer.includes(CONTINUATION_MARKER)) {
      this.markerFound = true;
    }

    this.buffer = this.buffer.split(CONTINUATION_MARKER).join("");
    const keep = CONTINUATION_MARKER.length - 1;

    if (this.buffer.length <= keep) {
      return "";
    }

    const text = this.buffer.slice(0, this.buffer.length - keep);
    this.buffer = this.buffer.slice(-keep);
    return text;
  }

  finish(): string {
    if (this.buffer.includes(CONTINUATION_MARKER)) {
      this.markerFound = true;
    }

    const text = this.buffer.split(CONTINUATION_MARKER).join("");
    this.buffer = "";
    return text;
  }
}

function findLastSafeBoundary(text: string, initialFenceOpen: boolean): Boundary | null {
  let fenceOpen = initialFenceOpen;
  let last: Boundary | null = null;
  let offset = 0;
  const lines = text.split("\n");

  for (const line of lines) {
    const lineStart = offset;
    const lineEnd = lineStart + line.length;
    const trimmedStart = line.trimStart();
    const isFence = trimmedStart.startsWith("```");

    if (isFence) {
      fenceOpen = !fenceOpen;
      if (!fenceOpen && lineEnd > 0) {
        last = { index: Math.min(text.length, lineEnd + 1), fenceOpen: false };
      }
    } else if (!fenceOpen) {
      if (line.trim() === "") {
        if (lineEnd > 0) {
          last = { index: Math.min(text.length, lineEnd + 1), fenceOpen: false };
        }
      } else if (/^(#{1,6}\s|([-*+]|\d+[.)])\s|\|)/.test(trimmedStart)) {
        if (lineStart > 0) {
          last = { index: lineStart, fenceOpen: false };
        }
      } else {
        const sentence = /[.!?…](?:["')\]]|\*|_)*(?=\s|$)/g;
        let match: RegExpExecArray | null;

        while ((match = sentence.exec(line)) !== null) {
          const index = lineStart + match.index + match[0].length;
          if (index > 0) {
            last = { index: Math.min(text.length, index), fenceOpen: false };
          }
        }
      }
    }

    offset = lineEnd + 1;
  }

  return last;
}

class SafeBoundaryBuffer {
  private pending = "";
  private fenceOpen = false;

  push(text: string): { emitted: string; boundary: boolean } {
    if (!text) {
      return { emitted: "", boundary: false };
    }

    this.pending += text;
    const boundary = findLastSafeBoundary(this.pending, this.fenceOpen);

    if (!boundary || boundary.index <= 0) {
      return { emitted: "", boundary: false };
    }

    const emitted = this.pending.slice(0, boundary.index);
    this.pending = this.pending.slice(boundary.index);
    this.fenceOpen = boundary.fenceOpen;
    return { emitted, boundary: true };
  }

  get pendingText(): string {
    return this.pending;
  }

  takePending(): string {
    const text = this.pending;
    this.pending = "";
    this.fenceOpen = false;
    return text;
  }
}

function buildGeminiContents(messages: ChatMessage[]) {
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

  for (const message of messages) {
    const role = message.role === "assistant" ? "model" : "user";
    const last = contents[contents.length - 1];

    if (last && last.role === role) {
      last.parts[0].text += `\n\n${message.content}`;
    } else {
      contents.push({ role, parts: [{ text: message.content }] });
    }
  }

  return contents;
}

function buildGeminiRequest(
  messages: ChatMessage[],
  maxTokens = SEGMENT_MAX_OUTPUT_TOKENS,
): string {
  const generationConfig: Record<string, unknown> = {
    temperature: 0.7,
    maxOutputTokens: maxTokens,
  };

  if (GEMINI_THINKING_LEVEL !== "none" && GEMINI_THINKING_LEVEL !== "off") {
    generationConfig.thinkingConfig = { thinkingLevel: GEMINI_THINKING_LEVEL.toUpperCase() };
  }

  return JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: buildGeminiContents(messages),
    generationConfig,
  });
}

function buildProviderMessages(
  provider: Exclude<Provider, "gemini">,
  messages: ChatMessage[],
): ChatMessage[] {
  if (provider !== "groq") {
    return [{ role: "system", content: SYSTEM_INSTRUCTION }, ...messages];
  }

  const merged = messages.map((message) => ({ ...message }));

  for (let index = merged.length - 1; index >= 0; index -= 1) {
    if (merged[index].role === "user") {
      merged[index].content = `${SYSTEM_INSTRUCTION}\n\n${merged[index].content}`;
      break;
    }
  }

  return merged;
}

function buildOpenAIRequest(
  provider: Exclude<Provider, "gemini">,
  model: string,
  messages: ChatMessage[],
  maxTokens = SEGMENT_MAX_OUTPUT_TOKENS,
): string {
  const body: Record<string, unknown> = {
    model,
    messages: buildProviderMessages(provider, messages),
    temperature: 0.7,
    stream: true,
  };

  if (provider === "groq") {
    body.max_completion_tokens = maxTokens;

    if (model.startsWith("openai/gpt-oss")) {
      body.reasoning_effort = GROQ_REASONING_EFFORT === "medium" || GROQ_REASONING_EFFORT === "high"
        ? GROQ_REASONING_EFFORT
        : "low";
      body.include_reasoning = false;
    } else if (model.startsWith("qwen/")) {
      const qwenEffort = GROQ_QWEN_REASONING_EFFORT === "low"
        || GROQ_QWEN_REASONING_EFFORT === "medium"
        || GROQ_QWEN_REASONING_EFFORT === "high"
        ? GROQ_QWEN_REASONING_EFFORT
        : "none";

      body.reasoning_effort = qwenEffort;
      if (qwenEffort !== "none") {
        body.reasoning_format = "hidden";
      }
    }
  } else {
    body.max_tokens = maxTokens;
  }

  if (provider === "openrouter") {
    body.stream_options = { include_usage: true };
  }

  return JSON.stringify(body);
}

function makeIdleReader(reader: ReadableStreamDefaultReader<Uint8Array>) {
  return async (): Promise<ReadableStreamReadResult<Uint8Array>> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("Tempo esgotado aguardando a IA.")),
        STREAM_IDLE_TIMEOUT_MS,
      );
    });

    try {
      return await Promise.race([reader.read(), timeout]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  };
}

function applyGeminiUsage(meta: Record<string, unknown> | undefined, usage: Usage) {
  if (!meta) {
    return;
  }

  usage.promptTokens = (meta.promptTokenCount as number | undefined) ?? usage.promptTokens;
  usage.completionTokens = (meta.candidatesTokenCount as number | undefined) ?? usage.completionTokens;
  usage.thoughtTokens = (meta.thoughtsTokenCount as number | undefined) ?? usage.thoughtTokens;
  usage.totalTokens = (meta.totalTokenCount as number | undefined) ?? usage.totalTokens;
}

function applyOpenAIUsage(meta: Record<string, unknown> | undefined, usage: Usage) {
  if (!meta) {
    return;
  }

  usage.promptTokens = (meta.prompt_tokens as number | undefined) ?? usage.promptTokens;
  usage.completionTokens = (meta.completion_tokens as number | undefined) ?? usage.completionTokens;
  usage.totalTokens = (meta.total_tokens as number | undefined) ?? usage.totalTokens;

  const details = meta.completion_tokens_details as Record<string, unknown> | undefined;
  if (details) {
    usage.thoughtTokens = (details.reasoning_tokens as number | undefined) ?? usage.thoughtTokens;
  }
}

async function* streamGemini(
  body: ReadableStream<Uint8Array>,
  usage: Usage,
  state: StreamState,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const read = makeIdleReader(reader);
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await read();

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
          applyGeminiUsage(parsed?.usageMetadata, usage);

          const finishReason = parsed?.candidates?.[0]?.finishReason;
          if (typeof finishReason === "string") {
            state.finishReason = finishReason;
          }

          const parts = parsed?.candidates?.[0]?.content?.parts ?? [];
          for (const part of parts) {
            if (typeof part?.text === "string" && part.text.length > 0) {
              yield part.text;
            }
          }
        } catch {
          // ignora chunks malformados
        }
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // ignore
    }
  }
}

async function* streamOpenAI(
  body: ReadableStream<Uint8Array>,
  usage: Usage,
  state: StreamState,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const read = makeIdleReader(reader);
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await read();

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
          applyOpenAIUsage(parsed?.x_groq?.usage, usage);
          applyOpenAIUsage(parsed?.usage, usage);

          const finishReason = parsed?.choices?.[0]?.finish_reason;
          if (typeof finishReason === "string") {
            state.finishReason = finishReason;
          }

          const delta = parsed?.choices?.[0]?.delta;
          let text = "";

          if (typeof delta?.content === "string") {
            text = delta.content;
          } else if (Array.isArray(delta?.content)) {
            text = delta.content
              .map((part: Record<string, unknown>) => typeof part?.text === "string" ? part.text : "")
              .join("");
          }

          if (text.length > 0) {
            yield text;
          }
        } catch {
          // ignora chunks malformados
        }
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // ignore
    }
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido." }, 405);
  }

  const chain = resolveChain().filter((candidate) => Boolean(getProviderKey(candidate.provider)));

  if (chain.length === 0) {
    return jsonResponse(
      { error: "Nenhum provedor de IA configurado. Defina GEMINI_API_KEY e/ou GROQ_API_KEY nos secrets do Supabase." },
      500,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  let payload: {
    conversationId?: string;
    content?: string;
    retry?: boolean;
    guest?: boolean;
    history?: Array<{ role?: string; content?: string }>;
  };

  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "JSON inválido." }, 400);
  }

  if (!payload || typeof payload !== "object") {
    return jsonResponse({ error: "JSON inválido." }, 400);
  }

  const isGuest = payload.guest === true;
  const content = (payload.content ?? "").trim();
  const isRetry = payload.retry === true;

  if (!content) {
    return jsonResponse({ error: "Mensagem vazia." }, 400);
  }

  if (content.length > MAX_INPUT_CHARS) {
    return jsonResponse({ error: `Mensagem muito longa (máx. ${MAX_INPUT_CHARS} caracteres).` }, 400);
  }

  let supabase: SupabaseClient | null = null;
  let conversationId = "";
  let history: ChatMessage[] = [];
  let skipUserInsert = false;

  if (isGuest) {
    const historico = Array.isArray(payload.history) ? payload.history : [];
    history = historico
      .filter((message) =>
        message
        && (message.role === "user" || message.role === "assistant")
        && typeof message.content === "string"
      )
      .slice(-MAX_HISTORY_MESSAGES)
      .map((message) => ({
        role: message.role as string,
        content: message.content as string,
      }));
  } else {
    if (!supabaseUrl || !anonKey) {
      return jsonResponse({ error: "Servidor não configurado." }, 500);
    }

    const authHeader = req.headers.get("Authorization") ?? "";

    if (!authHeader) {
      return jsonResponse({ error: "Não autenticado." }, 401);
    }

    const db = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    supabase = db;

    const { data: userData, error: userError } = await db.auth.getUser();

    if (userError || !userData?.user) {
      return jsonResponse({ error: "Sessão inválida." }, 401);
    }

    conversationId = (payload.conversationId ?? "").trim();

    if (!conversationId) {
      return jsonResponse({ error: "conversationId é obrigatório." }, 400);
    }

    const { data: conversation, error: conversationError } = await db
      .from("conversations")
      .select("id, title")
      .eq("id", conversationId)
      .maybeSingle();

    if (conversationError || !conversation) {
      return jsonResponse({ error: "Conversa não encontrada." }, 404);
    }

    const { data: historyDesc } = await db
      .from("messages")
      .select("role, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(MAX_HISTORY_MESSAGES);

    history = (historyDesc ?? []).slice().reverse();
    const lastMessage = history[history.length - 1];
    skipUserInsert = isRetry && lastMessage?.role === "user" && lastMessage.content === content;

    if (!skipUserInsert) {
      const { error: insertUserError } = await db.from("messages").insert({
        conversation_id: conversationId,
        role: "user",
        content,
      });

      if (insertUserError) {
        return jsonResponse({ error: "Não foi possível salvar a mensagem." }, 500);
      }
    }
  }

  const pending: ChatMessage[] = history.map((message) => ({
    role: message.role,
    content: message.content,
  }));

  if (isGuest || !skipUserInsert) {
    pending.push({ role: "user", content });
  }

  const messages = trimMessages(pending, MAX_HISTORY_CHARS);

  const startedAt = Date.now();
  const streamDeadline = startedAt + CONTINUATION_MAX_MS;

  const openUpstream = async (
    requestMessages: ChatMessage[],
    deadline: number,
  ): Promise<OpenUpstreamResult> => {
    let lastDetail = "";
    let quotaExceeded = false;

    for (const candidate of chain) {
      if (Date.now() > deadline) {
        lastDetail = "Tempo total excedido ao consultar a IA.";
        break;
      }

      const key = getProviderKey(candidate.provider);

      if (!key) {
        continue;
      }

      const requestController = new AbortController();
      const timer = setTimeout(() => requestController.abort(), FETCH_TIMEOUT_MS);

      let attempt: Response;

      try {
        if (candidate.provider === "gemini") {
          const geminiUrl =
            `https://generativelanguage.googleapis.com/v1beta/models/${candidate.model}:streamGenerateContent?alt=sse`;

          attempt = await fetch(geminiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": key,
            },
            body: buildGeminiRequest(requestMessages),
            signal: requestController.signal,
          });
        } else {
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          };

          if (candidate.provider === "openrouter") {
            const siteUrl = Deno.env.get("OPENROUTER_SITE_URL");
            const appName = Deno.env.get("OPENROUTER_APP_NAME");
            if (siteUrl) {
              headers["HTTP-Referer"] = siteUrl;
            }
            if (appName) {
              headers["X-Title"] = appName;
            }
          }

          attempt = await fetch(OPENAI_BASE_URLS[candidate.provider], {
            method: "POST",
            headers,
            body: buildOpenAIRequest(candidate.provider, candidate.model, requestMessages),
            signal: requestController.signal,
          });
        }
      } catch (error) {
        clearTimeout(timer);
        lastDetail = `${candidate.provider}:${candidate.model} indisponível (${String(error)}).`;
        continue;
      }

      clearTimeout(timer);

      if (attempt.ok && attempt.body) {
        return { ok: true, upstream: attempt, candidate };
      }

      lastDetail = await attempt.text().catch(() => "");

      if (attempt.status === 429) {
        quotaExceeded = true;
      }
    }

    return { ok: false, quotaExceeded, detail: lastDetail };
  };

  const initial = await openUpstream(messages, Math.min(streamDeadline, startedAt + MAX_TOTAL_MS));

  if (!initial.ok) {
    if (initial.quotaExceeded) {
      return jsonResponse(
        { error: "Limite de uso da IA atingido em todos os provedores. Tente novamente mais tarde." },
        429,
      );
    }

    return jsonResponse(
      {
        error: "Não consegui falar com a IA agora. Tente novamente em instantes.",
        detail: initial.detail.slice(0, 300),
      },
      502,
    );
  }

  let currentUpstream = initial.upstream;
  let currentCandidate = initial.candidate;
  const encoder = new TextEncoder();
  const usage: Usage = {};

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const startedStream = Date.now();
      let generatedAll = "";
      let nextPrefix = "";
      let segmentsSaved = 0;
      let truncated = false;
      let truncationReason = "";

      try {
        for (let segmentIndex = 0; segmentIndex < MAX_SEGMENTS; segmentIndex += 1) {
          const upstreamBody = currentUpstream.body;

          if (!upstreamBody) {
            throw new Error("Resposta da IA sem corpo.");
          }

          const state: StreamState = {};
          const filter = new ContinuationFilter();
          const boundaries = new SafeBoundaryBuffer();
          const prefix = nextPrefix;
          nextPrefix = "";
          let segmentGenerated = "";
          let segmentVisible = prefix;
          let guardStopped = false;

          controller.enqueue(encoder.encode(sse({ segment_start: segmentIndex, prefix })));

          const iterator = currentCandidate.provider === "gemini"
            ? streamGemini(upstreamBody, usage, state)
            : streamOpenAI(upstreamBody, usage, state);

          for await (const delta of iterator) {
            const filtered = filter.push(delta);

            if (!filtered) {
              continue;
            }

            generatedAll += filtered;
            segmentGenerated += filtered;
            const out = boundaries.push(filtered);

            if (out.emitted) {
              segmentVisible += out.emitted;
              controller.enqueue(encoder.encode(sse({ delta: out.emitted })));
            }

            if (
              !guardStopped
              && out.boundary
              && approximateTokens(segmentGenerated)
                >= Math.floor(SEGMENT_MAX_OUTPUT_TOKENS * SEGMENT_SOFT_TOKEN_RATIO)
            ) {
              guardStopped = true;
              break;
            }
          }

          const tail = filter.finish();

          if (tail) {
            generatedAll += tail;
            segmentGenerated += tail;
            const out = boundaries.push(tail);

            if (out.emitted) {
              segmentVisible += out.emitted;
              controller.enqueue(encoder.encode(sse({ delta: out.emitted })));
            }
          }

          const likelyCut = !state.finishReason
            && approximateTokens(segmentGenerated) >= Math.floor(SEGMENT_MAX_OUTPUT_TOKENS * 0.95);
          const limitReached = isLengthFinish(state.finishReason) || likelyCut;
          const markerFound = filter.markerFound;
          let shouldContinue = markerFound || limitReached || guardStopped;

          if (!segmentVisible.trim() && !boundaries.pendingText.trim()) {
            shouldContinue = false;
          }

          const totalLimitReached = approximateTokens(generatedAll) >= TOTAL_OUTPUT_TOKENS;
          const timeLimitReached = Date.now() >= streamDeadline;
          const segmentLimitReached = segmentIndex + 1 >= MAX_SEGMENTS;

          if (shouldContinue && (totalLimitReached || timeLimitReached || segmentLimitReached)) {
            truncated = true;
            truncationReason = totalLimitReached
              ? "total_tokens"
              : timeLimitReached
                ? "time"
                : "segments";
            shouldContinue = false;
          }

          const flushPending = !shouldContinue || markerFound;

          if (flushPending) {
            const pending = boundaries.takePending();

            if (pending) {
              segmentVisible += pending;
              controller.enqueue(encoder.encode(sse({ delta: pending })));
            }
          } else {
            nextPrefix = boundaries.takePending();
          }

          const contentToSave = segmentVisible.trim();

          if (contentToSave) {
            if (!isGuest && supabase) {
              const { error: insertAssistantError } = await supabase.from("messages").insert({
                conversation_id: conversationId,
                role: "assistant",
                content: contentToSave,
              });

              if (insertAssistantError) {
                console.error("Erro ao salvar resposta da IA:", insertAssistantError.message);
              }
            }

            segmentsSaved += 1;
          }

          controller.enqueue(encoder.encode(sse({
            segment_end: segmentIndex,
            reason: state.finishReason ?? (guardStopped ? "soft_limit" : "stop"),
            continue: shouldContinue,
          })));

          if (!shouldContinue) {
            break;
          }

          const generatedForContext = generatedAll.length > MAX_INPUT_CHARS
            ? generatedAll.slice(-MAX_INPUT_CHARS)
            : generatedAll;
          const continuationMessages = trimMessages([
            ...messages,
            { role: "assistant", content: generatedForContext },
            { role: "user", content: CONTINUE_INSTRUCTION },
          ], MAX_HISTORY_CHARS);
          const next = await openUpstream(continuationMessages, streamDeadline);

          if (!next.ok) {
            controller.enqueue(encoder.encode(sse({
              error: next.quotaExceeded
                ? "Limite de uso da IA atingido ao continuar a resposta."
                : "Erro ao continuar a resposta.",
            })));
            break;
          }

          currentUpstream = next.upstream;
          currentCandidate = next.candidate;
        }

        if (truncated) {
          controller.enqueue(encoder.encode(sse({ truncated: true, reason: truncationReason })));
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (error) {
        console.error("Erro no streaming:", error);
        try {
          controller.enqueue(encoder.encode(sse({ error: "Erro ao gerar a resposta." })));
        } catch {
          // ignore
        }
      } finally {
        console.log(JSON.stringify({
          event: "ai_usage",
          provider: currentCandidate.provider,
          model: currentCandidate.model,
          promptTokens: usage.promptTokens ?? null,
          completionTokens: usage.completionTokens ?? null,
          thoughtTokens: usage.thoughtTokens ?? null,
          totalTokens: usage.totalTokens ?? null,
          outputChars: generatedAll.length,
          segments: segmentsSaved,
          truncated,
          truncationReason: truncated ? truncationReason : null,
          durationMs: Date.now() - startedStream,
        }));

        try {
          controller.close();
        } catch {
          // ignore
        }
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
