import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { marked } from "https://esm.sh/marked@12.0.2";
import DOMPurify from "https://esm.sh/dompurify@3.1.6";
import { SUPABASE_URL, SUPABASE_ANON_KEY, CHAT_FUNCTION, AUTH_ENABLED } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

marked.setOptions({ gfm: true, breaks: true });

const el = {
  loginScreen: document.getElementById("loginScreen"),
  chatApp: document.getElementById("chatApp"),
  googleBtn: document.getElementById("googleBtn"),
  loginMessage: document.getElementById("loginMessage"),
  loginThemeSlot: document.getElementById("loginThemeSlot"),
  sidebar: document.getElementById("sidebar"),
  sidebarToggle: document.getElementById("sidebarToggle"),
  sidebarBackdrop: document.getElementById("sidebarBackdrop"),
  conversationsList: document.getElementById("conversationsList"),
  newConversationBtn: document.getElementById("newConversationBtn"),
  messages: document.getElementById("messages"),
  emptyState: document.getElementById("emptyState"),
  composer: document.getElementById("composer"),
  messageInput: document.getElementById("messageInput"),
  sendBtn: document.getElementById("sendBtn"),
  chatTitle: document.getElementById("chatTitle"),
  themeSlot: document.getElementById("themeSlot"),
  userAvatar: document.getElementById("userAvatar"),
  userName: document.getElementById("userName"),
  userEmail: document.getElementById("userEmail"),
  logoutBtn: document.getElementById("logoutBtn"),
};

const state = {
  session: null,
  conversations: [],
  currentId: null,
  sending: false,
};

const CHAVE_CONVERSAS_VISITANTE = "organizaai.estudai.visitante.v1";

function gerarIdLocal() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function iniciaisConta(email) {
  const nome = String(email || "EA").split("@")[0].replace(/[._-]+/g, " ").trim();
  const partes = nome.split(/\s+/).filter(Boolean);

  if (!partes.length) {
    return "EA";
  }

  if (partes.length === 1) {
    return partes[0].slice(0, 2).toUpperCase();
  }

  return (partes[0].charAt(0) + partes[partes.length - 1].charAt(0)).toUpperCase();
}

function lerConversasLocais() {
  try {
    const bruto = window.localStorage.getItem(CHAVE_CONVERSAS_VISITANTE);
    if (!bruto) {
      return [];
    }

    const dados = JSON.parse(bruto);
    if (!Array.isArray(dados)) {
      return [];
    }

    return dados
      .filter((conversa) => conversa && typeof conversa.id === "string")
      .map((conversa) => ({
        id: conversa.id,
        title: typeof conversa.title === "string" && conversa.title ? conversa.title : "Nova conversa",
        updated_at: typeof conversa.updated_at === "string"
          ? conversa.updated_at
          : new Date().toISOString(),
        messages: Array.isArray(conversa.messages)
          ? conversa.messages
            .filter((mensagem) => mensagem
              && (mensagem.role === "user" || mensagem.role === "assistant")
              && typeof mensagem.content === "string")
            .map((mensagem) => ({
              role: mensagem.role,
              content: mensagem.content,
              created_at: typeof mensagem.created_at === "string"
                ? mensagem.created_at
                : new Date().toISOString(),
            }))
          : [],
      }));
  } catch (erro) {
    console.error("Não foi possível ler as conversas locais.", erro);
    return [];
  }
}

function salvarConversasLocais() {
  try {
    window.localStorage.setItem(CHAVE_CONVERSAS_VISITANTE, JSON.stringify(state.conversations));
  } catch (erro) {
    console.error("Não foi possível salvar as conversas locais.", erro);
  }
}

function salvarMensagemLocal(conversationId, role, content) {
  const conversa = state.conversations.find((item) => item.id === conversationId);
  if (!conversa) {
    return;
  }

  const agora = new Date().toISOString();
  conversa.messages.push({ role, content, created_at: agora });
  conversa.updated_at = agora;
  salvarConversasLocais();
}

function renderMarkdown(text) {
  const html = marked.parse(text ?? "");
  return DOMPurify.sanitize(html);
}

function scrollToBottom(force = false) {
  const wrap = el.messages.parentElement;
  if (!wrap) {
    return;
  }
  const nearBottom = wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 120;
  if (force || nearBottom) {
    wrap.scrollTop = wrap.scrollHeight;
  }
}

function autoGrow() {
  el.messageInput.style.height = "auto";
  el.messageInput.style.height = Math.min(el.messageInput.scrollHeight, 160) + "px";
}

function atualizarBotaoEnviar() {
  el.sendBtn.disabled = state.sending || el.messageInput.value.trim() === "";
}

function setSending(sending) {
  state.sending = sending;
  atualizarBotaoEnviar();
  el.sendBtn.textContent = sending ? "..." : "Enviar";
  el.messages.setAttribute("aria-busy", sending ? "true" : "false");
}

/* ---------------- Autenticação ---------------- */

async function registrarAcesso() {
  try {
    await supabase.rpc("registrar_acesso");
  } catch (erro) {
    console.warn("Não foi possível registrar o acesso.", erro);
  }
}

async function perfilAtivo(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("ativo")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("Erro ao carregar o perfil:", error.message);
    return false;
  }

  return data?.ativo === true;
}

async function applyGuestState() {
  closeSidebar();
  el.loginScreen.hidden = true;
  el.chatApp.hidden = false;
  el.userAvatar.textContent = "VI";
  el.userName.textContent = "Visitante";
  el.userEmail.textContent = "Dados salvos neste navegador";
  el.logoutBtn.hidden = true;
  await loadConversations();

  if (window.matchMedia("(min-width: 821px)").matches) {
    el.messageInput.focus();
  }
}

async function initAuth() {
  if (!AUTH_ENABLED) {
    await applyGuestState();
    return;
  }

  const { data } = await supabase.auth.getSession();
  state.session = data.session ?? null;
  await applyAuthState();

  supabase.auth.onAuthStateChange((event, session) => {
    state.session = session ?? null;
    if (event === "TOKEN_REFRESHED") {
      return;
    }
    void applyAuthState();
  });
}

async function applyAuthState() {
  if (state.session) {
    if (!(await perfilAtivo(state.session.user.id))) {
      await supabase.auth.signOut();
      el.chatApp.hidden = true;
      el.loginScreen.hidden = false;
      el.loginMessage.textContent = "Seu usuário está desativado.";
      return;
    }

    await registrarAcesso();
    const email = state.session.user.email ?? "";
    el.loginScreen.hidden = true;
    el.chatApp.hidden = false;
    el.userAvatar.textContent = iniciaisConta(email);
    el.userName.textContent = email || "Conta";
    el.userEmail.textContent = "Sessão ativa";
    el.logoutBtn.hidden = false;
    loadConversations().then(() => {
      if (window.matchMedia("(min-width: 821px)").matches) {
        el.messageInput.focus();
      }
    });
  } else {
    closeSidebar();
    el.chatApp.hidden = true;
    el.loginScreen.hidden = false;
    state.conversations = [];
    state.currentId = null;
  }
}

async function signInWithGoogle() {
  el.loginMessage.textContent = "";
  const originalHtml = el.googleBtn.innerHTML;
  el.googleBtn.disabled = true;
  el.googleBtn.textContent = "Redirecionando...";

  const redirectTo = new URL("./", window.location.href).href;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });

  if (error) {
    el.loginMessage.textContent = "Não foi possível entrar: " + error.message;
    el.googleBtn.disabled = false;
    el.googleBtn.innerHTML = originalHtml;
  }
}

function showLoginErrorFromUrl() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const busca = new URLSearchParams(window.location.search);
  const error = hash.get("error_description")
    || hash.get("error")
    || busca.get("error_description")
    || busca.get("error");

  if (!error) {
    return;
  }

  try {
    el.loginMessage.textContent = decodeURIComponent(error.replace(/\+/g, " "));
  } catch (erro) {
    el.loginMessage.textContent = error;
  }
}

/* ---------------- Conversas ---------------- */

async function loadConversations() {
  if (!AUTH_ENABLED) {
    state.conversations = lerConversasLocais();
    renderConversations();

    if (state.currentId && !state.conversations.some((c) => c.id === state.currentId)) {
      state.currentId = null;
    }

    if (!state.currentId && state.conversations.length > 0) {
      await selectConversation(state.conversations[0].id);
    } else if (!state.conversations.length) {
      state.currentId = null;
      el.chatTitle.textContent = "EstudAI";
      showEmptyState();
    }
    return;
  }

  const { data, error } = await supabase
    .from("conversations")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Erro ao carregar conversas:", error.message);
    return;
  }

  state.conversations = data ?? [];
  renderConversations();

  if (state.currentId && !state.conversations.some((c) => c.id === state.currentId)) {
    state.currentId = null;
  }

  if (!state.currentId && state.conversations.length > 0) {
    await selectConversation(state.conversations[0].id);
  } else if (!state.conversations.length) {
    state.currentId = null;
    el.chatTitle.textContent = "EstudAI";
    showEmptyState();
  }
}

function renderConversations() {
  el.conversationsList.replaceChildren();

  state.conversations.forEach((conversation) => {
    const item = document.createElement("button");
    item.type = "button";
    const active = conversation.id === state.currentId;
    item.className = "conversation-item" + (active ? " is-active" : "");
    item.setAttribute("aria-current", active ? "true" : "false");
    item.textContent = conversation.title || "Conversa";
    item.title = conversation.title || "Conversa";
    item.addEventListener("click", () => {
      const wasOpen = el.sidebar.classList.contains("is-open");
      selectConversation(conversation.id);
      if (wasOpen) {
        closeSidebar();
        el.messageInput.focus();
      }
    });
    el.conversationsList.appendChild(item);
  });
}

async function createConversation() {
  if (!AUTH_ENABLED) {
    const conversa = {
      id: gerarIdLocal(),
      title: "Nova conversa",
      updated_at: new Date().toISOString(),
      messages: [],
    };

    state.conversations.unshift(conversa);
    state.currentId = conversa.id;
    el.chatTitle.textContent = conversa.title;
    salvarConversasLocais();
    renderConversations();
    showEmptyState();
    return conversa.id;
  }

  if (!state.session) {
    return null;
  }

  const { data, error } = await supabase
    .from("conversations")
    .insert({ user_id: state.session.user.id, title: "Nova conversa" })
    .select("id, title, updated_at")
    .single();

  if (error) {
    console.error("Erro ao criar conversa:", error.message);
    return null;
  }

  state.conversations.unshift(data);
  state.currentId = data.id;
  el.chatTitle.textContent = data.title;
  renderConversations();
  showEmptyState();
  return data.id;
}

async function selectConversation(id) {
  state.currentId = id;
  const conversation = state.conversations.find((c) => c.id === id);
  el.chatTitle.textContent = conversation?.title ?? "Conversa";
  renderConversations();

  if (!AUTH_ENABLED) {
    renderMessages(conversation?.messages ?? []);
    return;
  }

  const { data, error } = await supabase
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Erro ao carregar mensagens:", error.message);
    return;
  }

  renderMessages(data ?? []);
}

async function refreshTitleIfNeeded(conversationId, firstText) {
  const conversation = state.conversations.find((c) => c.id === conversationId);
  if (!conversation || conversation.title !== "Nova conversa") {
    return;
  }

  const title = firstText.replace(/\s+/g, " ").trim().slice(0, 60) || "Nova conversa";

  if (!AUTH_ENABLED) {
    conversation.title = title;
    conversation.updated_at = new Date().toISOString();
    salvarConversasLocais();
    el.chatTitle.textContent = title;
    renderConversations();
    return;
  }

  const { error } = await supabase
    .from("conversations")
    .update({ title })
    .eq("id", conversationId);

  if (!error) {
    conversation.title = title;
    el.chatTitle.textContent = title;
    renderConversations();
  }
}

/* ---------------- Mensagens ---------------- */

function showEmptyState() {
  el.messages.replaceChildren();
  el.emptyState.hidden = false;
}

function renderMessages(messages) {
  el.messages.replaceChildren();

  if (!messages.length) {
    el.emptyState.hidden = false;
    return;
  }

  el.emptyState.hidden = true;
  messages.forEach((message) => appendMessage(message.role, message.content));
  scrollToBottom(true);
}

function appendMessage(role, text) {
  el.emptyState.hidden = true;

  const row = document.createElement("div");
  row.className = "msg msg-" + role;

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  if (role === "assistant") {
    bubble.innerHTML = renderMarkdown(text);
  } else {
    bubble.textContent = text;
  }

  row.appendChild(bubble);
  el.messages.appendChild(row);
  scrollToBottom(true);
  return bubble;
}

function appendTyping() {
  el.emptyState.hidden = true;

  const row = document.createElement("div");
  row.className = "msg msg-assistant msg-typing";
  row.setAttribute("aria-label", "EstudAI está digitando");

  const bubble = document.createElement("div");
  bubble.className = "bubble typing";
  bubble.innerHTML =
    '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';

  row.appendChild(bubble);
  el.messages.appendChild(row);
  scrollToBottom(true);
  return row;
}

function appendError(text, onRetry) {
  el.emptyState.hidden = true;

  const row = document.createElement("div");
  row.className = "msg msg-assistant msg-error";

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  const message = document.createElement("p");
  message.textContent = text;
  bubble.appendChild(message);

  if (onRetry) {
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "retry-btn";
    retry.textContent = "Tentar novamente";
    retry.addEventListener("click", onRetry);
    bubble.appendChild(retry);
  }

  row.appendChild(bubble);
  el.messages.appendChild(row);
  scrollToBottom(true);
  return row;
}

async function runAssistantReply(conversationId, text, isRetry = false) {
  const typingRow = appendTyping();
  let assistantBubble = null;
  let accumulated = "";

  try {
    await streamReply(conversationId, text, (delta) => {
      if (!assistantBubble) {
        typingRow.remove();
        assistantBubble = appendMessage("assistant", "");
      }
      accumulated += delta;
      assistantBubble.innerHTML = renderMarkdown(accumulated);
      scrollToBottom();
    }, isRetry);

    if (typingRow.isConnected) {
      typingRow.remove();
    }

    if (!AUTH_ENABLED && accumulated.trim()) {
      salvarMensagemLocal(conversationId, "assistant", accumulated);
    }

    if (!accumulated.trim()) {
      if (assistantBubble) {
        assistantBubble.closest(".msg")?.remove();
      }
      const errorRow = appendError("Não obtive resposta. Tente novamente.", () => {
        errorRow.remove();
        runAssistantReply(conversationId, text, true);
      });
      return;
    }
  } catch (error) {
    console.error(error);
    typingRow.remove();
    if (assistantBubble && !accumulated.trim()) {
      assistantBubble.closest(".msg")?.remove();
    }

    if (error && error.status === 401) {
      if (!AUTH_ENABLED) {
        appendError("IA indisponível no modo visitante. Publique a função chat.", null);
        return;
      }

      await handleSessionExpired();
      return;
    }

    if (error && error.status === 429) {
      appendError("Limite diário da IA atingido. Tente novamente mais tarde.", null);
      return;
    }

    const errorRow = appendError(
      "Erro ao responder. Verifique sua conexão e tente novamente.",
      () => {
        errorRow.remove();
        runAssistantReply(conversationId, text, true);
      },
    );
  }
}

async function handleSessionExpired() {
  el.loginMessage.textContent = "Sua sessão expirou. Entre novamente.";
  await supabase.auth.signOut();
}

async function onSubmit(event) {
  event.preventDefault();

  if (state.sending || (AUTH_ENABLED && !state.session)) {
    return;
  }

  const text = el.messageInput.value.trim();
  if (!text) {
    return;
  }

  let conversationId = state.currentId;
  if (!conversationId) {
    conversationId = await createConversation();
    if (!conversationId) {
      return;
    }
  }

  const isFirstMessage = el.messages.children.length === 0;

  if (!AUTH_ENABLED) {
    salvarMensagemLocal(conversationId, "user", text);
  }

  el.messageInput.value = "";
  autoGrow();
  setSending(true);

  appendMessage("user", text);

  try {
    await runAssistantReply(conversationId, text);
  } finally {
    setSending(false);
    el.messageInput.focus();
    if (isFirstMessage) {
      await refreshTitleIfNeeded(conversationId, text);
    }
    await loadConversations();
  }
}

async function streamReply(conversationId, content, onDelta, isRetry = false) {
  const headers = {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
  };
  const body = { conversationId, content, retry: isRetry };

  if (AUTH_ENABLED) {
    headers.Authorization = `Bearer ${state.session.access_token}`;
  } else {
    const conversa = state.conversations.find((item) => item.id === conversationId);
    const historico = (conversa?.messages ?? []).map((mensagem) => ({
      role: mensagem.role,
      content: mensagem.content,
    }));
    const ultima = historico[historico.length - 1];

    if (ultima && ultima.role === "user" && ultima.content === content) {
      historico.pop();
    }

    body.guest = true;
    body.history = historico;
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/${CHAT_FUNCTION}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let message = "Erro " + response.status;
    try {
      const payload = await response.json();
      if (payload?.error) {
        message = payload.error;
      }
    } catch {
      /* resposta sem JSON */
    }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  if (!response.body) {
    throw new Error("Resposta sem corpo.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      const line = event.trim();
      if (!line.startsWith("data:")) {
        continue;
      }

      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") {
        continue;
      }

      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }

      if (parsed.error) {
        throw new Error(parsed.error);
      }

      if (typeof parsed.delta === "string") {
        onDelta(parsed.delta);
      }
    }
  }
}

/* ---------------- Sidebar mobile ---------------- */

function openSidebar() {
  el.sidebar.classList.add("is-open");
  el.sidebarBackdrop.hidden = false;
  el.sidebarToggle.setAttribute("aria-expanded", "true");
  const firstItem = el.conversationsList.querySelector("button")
    || el.sidebar.querySelector(".sidebar-system");
  if (firstItem) {
    firstItem.focus();
  }
}

function closeSidebar(returnFocus = false) {
  el.sidebar.classList.remove("is-open");
  el.sidebarBackdrop.hidden = true;
  el.sidebarToggle.setAttribute("aria-expanded", "false");
  if (returnFocus) {
    el.sidebarToggle.focus();
  }
}

/* ---------------- Eventos ---------------- */

function bindEvents() {
  if (window.OrganizaTema) {
    window.OrganizaTema.montarBotao(el.loginThemeSlot, "login-theme-toggle");
    window.OrganizaTema.montarBotao(el.themeSlot, "sidebar-theme-toggle");
  }

  el.googleBtn.addEventListener("click", signInWithGoogle);
  el.logoutBtn.addEventListener("click", () => supabase.auth.signOut());
  el.newConversationBtn.addEventListener("click", async () => {
    await createConversation();
    closeSidebar();
    el.messageInput.focus();
  });

  el.composer.addEventListener("submit", onSubmit);

  el.messageInput.addEventListener("input", () => {
    autoGrow();
    atualizarBotaoEnviar();
  });
  el.messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      el.composer.requestSubmit();
    }
  });

  el.emptyState.querySelectorAll(".suggestion").forEach((button) => {
    button.addEventListener("click", () => {
      el.messageInput.value = button.dataset.prompt ?? "";
      autoGrow();
      atualizarBotaoEnviar();
      el.composer.requestSubmit();
    });
  });

  el.sidebarToggle.addEventListener("click", openSidebar);
  el.sidebarBackdrop.addEventListener("click", () => closeSidebar(true));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && el.sidebar.classList.contains("is-open")) {
      closeSidebar(true);
    }
  });
}

/* ---------------- Início ---------------- */

showLoginErrorFromUrl();
bindEvents();
initAuth();
