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
  googleBtnLabel: document.getElementById("googleBtnLabel"),
  loginMessage: document.getElementById("loginMessage"),
  loginThemeSlot: document.getElementById("loginThemeSlot"),
  loginAccentSlot: document.getElementById("loginAccentSlot"),
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
  accentSlot: document.getElementById("accentSlot"),
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

function criarIcone(nome) {
  return window.OrganizaIcons ? window.OrganizaIcons.criar(nome) : null;
}

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
  const html = DOMPurify.sanitize(marked.parse(text ?? ""));
  const template = document.createElement("template");
  template.innerHTML = html;

  template.content.querySelectorAll("table").forEach((table) => {
    const wrapper = document.createElement("div");
    wrapper.className = "table-wrap";
    table.replaceWith(wrapper);
    wrapper.appendChild(table);
  });

  return template.innerHTML;
}

/* ---------------- Plano de estudos → tarefas OrganizAI ---------------- */

// Mesma chave usada por assets/js/todolist.js (organizaai.tarefas.visitante.v1).
// Alterou aqui? Altere lá também.
const CHAVE_TAREFAS_VISITANTE = "organizaai.tarefas.visitante.v1";

function normalizarPrioridadePlano(valor) {
  const bruto = String(valor ?? "").trim().toLowerCase();

  if (bruto === "alta" || bruto === "baixa") {
    return bruto;
  }

  if (bruto === "media" || bruto === "média") {
    return "média";
  }

  return "nenhuma";
}

function normalizarItensPlano(lista) {
  return (Array.isArray(lista) ? lista : [])
    .filter((item) => item && typeof item.titulo === "string" && item.titulo.trim())
    .map((item) => ({
      titulo: item.titulo.trim().slice(0, 300),
      prioridade: normalizarPrioridadePlano(item.prioridade),
    }));
}

function tentarExtrairTarefas(bruto) {
  const texto = String(bruto ?? "").trim();
  const candidatos = [
    texto,
    texto.replace(/,\s*([}\]])/g, "$1"),
  ];

  for (const candidato of candidatos) {
    try {
      const dados = JSON.parse(candidato || "null");
      const itens = normalizarItensPlano(dados?.tarefas);

      if (itens.length > 0) {
        return itens;
      }
    } catch {
      // tenta o próximo candidato
    }
  }

  const tolerante = [...texto.matchAll(
    /"titulo"\s*:\s*"([^"]+)"(?:[^{}]*?"prioridade"\s*:\s*"([^"]+)")?/g,
  )]
    .map((correspondencia) => ({
      titulo: correspondencia[1].trim().slice(0, 300),
      prioridade: normalizarPrioridadePlano(correspondencia[2]),
    }))
    .filter((item) => item.titulo);

  return tolerante.length > 0 ? tolerante : null;
}

function extrairPlanos(texto, finalizado = false) {
  const linhas = String(texto ?? "").split("\n");
  const corpoLinhas = [];
  const planos = [];
  let emCodigo = false;
  let emPlano = false;
  let bufferPlano = null;
  let placeholder = false;

  // O bloco plano nunca é exibido como código: JSON válido vira card;
  // inválido/truncado tenta recuperação tolerante e, se não der, é descartado.
  const registrarPlano = (bruto) => {
    const itens = tentarExtrairTarefas(bruto);

    if (itens && itens.length > 0) {
      planos.push({ tarefas: itens });
    }
  };

  for (const linha of linhas) {
    const trimmed = linha.trim();
    const eCerca = trimmed.startsWith("```");

    if (emPlano) {
      if (eCerca) {
        registrarPlano(bufferPlano.join("\n"));
        emPlano = false;
        bufferPlano = null;
      } else {
        bufferPlano.push(linha);
      }
    } else if (emCodigo) {
      corpoLinhas.push(linha);
      if (eCerca && trimmed === "```") {
        emCodigo = false;
      }
    } else if (eCerca) {
      const linguagem = trimmed.slice(3).trim().toLowerCase();

      if (linguagem === "plano") {
        emPlano = true;
        bufferPlano = [];
      } else {
        emCodigo = true;
        corpoLinhas.push(linha);
      }
    } else {
      corpoLinhas.push(linha);
    }
  }

  if (emPlano && bufferPlano) {
    if (finalizado) {
      registrarPlano(bufferPlano.join("\n"));
    } else {
      placeholder = true;
    }
  }

  return { corpo: corpoLinhas.join("\n"), planos, placeholder };
}

function obterEstadoPlano(estados, indice, plano) {
  if (estados) {
    const existente = estados.get(indice);

    if (existente && existente.tarefas === plano.tarefas.length) {
      return existente;
    }
  }

  const novo = {
    tarefas: plano.tarefas.length,
    marcados: new Set(plano.tarefas.map((_, indiceTarefa) => indiceTarefa)),
    prioridades: plano.tarefas.map((tarefa) => tarefa.prioridade),
    resultado: null,
    enviando: false,
  };

  if (estados) {
    estados.set(indice, novo);
  }

  return novo;
}

async function adicionarTarefasDoPlano(itens) {
  if (!itens.length) {
    return 0;
  }

  if (!AUTH_ENABLED) {
    let lista = [];

    try {
      const bruto = window.localStorage.getItem(CHAVE_TAREFAS_VISITANTE);
      const dados = bruto ? JSON.parse(bruto) : [];

      if (Array.isArray(dados)) {
        lista = dados.filter((item) => item && typeof item === "object");
      }
    } catch {
      lista = [];
    }

    let ordem = lista.reduce((maior, item) => Math.max(maior, Number(item?.ordem) || 0), 0);
    const base = Date.now();

    for (const item of itens) {
      ordem += 1;
      lista.push({
        id: gerarIdLocal(),
        texto: item.titulo,
        concluida: false,
        prioridade: item.prioridade,
        ordem,
        criadoEm: base + ordem,
      });
    }

    window.localStorage.setItem(CHAVE_TAREFAS_VISITANTE, JSON.stringify(lista));
    return itens.length;
  }

  const { data: topo, error: erroTopo } = await supabase
    .from("tasks")
    .select("ordem")
    .order("ordem", { ascending: false })
    .limit(1);

  if (erroTopo) {
    throw erroTopo;
  }

  const maior = topo?.[0] ? Number(topo[0].ordem) : 0;
  const registros = itens.map((item, indice) => ({
    user_id: state.session.user.id,
    texto: item.titulo,
    concluida: false,
    prioridade: item.prioridade === "média" ? "media" : item.prioridade,
    ordem: (isFinite(maior) ? maior : 0) + indice + 1,
  }));

  const { error: erroInsert } = await supabase.from("tasks").insert(registros);

  if (erroInsert) {
    throw erroInsert;
  }

  return registros.length;
}

function montarCardPlano(plano, estado) {
  const card = document.createElement("div");
  card.className = "plano-card";

  const cabecalho = document.createElement("div");
  cabecalho.className = "plano-cabecalho";

  const icone = criarIcone("list-checks");
  if (icone) {
    cabecalho.appendChild(icone);
  }

  const titulo = document.createElement("span");
  titulo.textContent = "Guia de estudos";
  cabecalho.appendChild(titulo);

  const contador = document.createElement("span");
  contador.className = "plano-contador";
  cabecalho.appendChild(contador);
  card.appendChild(cabecalho);

  const lista = document.createElement("div");
  lista.className = "plano-lista";

  const opcoesPrioridade = [
    ["nenhuma", "Sem prioridade"],
    ["alta", "Alta"],
    ["média", "Média"],
    ["baixa", "Baixa"],
  ];

  const atualizarContador = () => {
    contador.textContent = `${estado.marcados.size}/${plano.tarefas.length} tópicos`;
  };

  plano.tarefas.forEach((tarefa, indice) => {
    const linha = document.createElement("label");
    linha.className = "plano-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = estado.marcados.has(indice);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        estado.marcados.add(indice);
      } else {
        estado.marcados.delete(indice);
      }
      atualizarContador();
      atualizarBotao();
    });

    const rotulo = document.createElement("span");
    rotulo.className = "plano-item-titulo";
    rotulo.textContent = tarefa.titulo;

    const select = document.createElement("select");
    select.className = "plano-prioridade";
    select.setAttribute("aria-label", "Prioridade");

    for (const [valor, texto] of opcoesPrioridade) {
      const opcao = document.createElement("option");
      opcao.value = valor;
      opcao.textContent = texto;
      select.appendChild(opcao);
    }

    select.value = estado.prioridades[indice];
    select.addEventListener("change", () => {
      estado.prioridades[indice] = select.value;
    });

    linha.append(checkbox, rotulo, select);
    lista.appendChild(linha);
  });

  card.appendChild(lista);
  atualizarContador();

  const rodape = document.createElement("div");
  rodape.className = "plano-rodape";

  const resultado = document.createElement("div");
  resultado.className = "plano-resultado";

  const renderizarResultado = () => {
    resultado.replaceChildren();
    resultado.className = "plano-resultado" + (estado.resultado ? " " + estado.resultado.tipo : "");

    if (!estado.resultado) {
      return;
    }

    const texto = document.createElement("span");
    texto.textContent = estado.resultado.texto;
    resultado.appendChild(texto);

    if (estado.resultado.tipo === "ok") {
      const link = document.createElement("a");
      link.href = "../index.html";
      link.textContent = "Ver tarefas";
      resultado.appendChild(link);
    }
  };

  const botao = document.createElement("button");
  botao.type = "button";
  botao.className = "plano-botao";

  const iconeBotao = criarIcone("plus");
  if (iconeBotao) {
    botao.appendChild(iconeBotao);
  }

  const textoBotao = document.createElement("span");
  botao.appendChild(textoBotao);

  const atualizarBotao = () => {
    const quantidade = estado.marcados.size;
    textoBotao.textContent = quantidade > 0
      ? `Adicionar ${quantidade} ${quantidade > 1 ? "tarefas" : "tarefa"}`
      : "Selecione tópicos";
    botao.disabled = quantidade === 0 || estado.enviando;
  };
  atualizarBotao();

  botao.addEventListener("click", async () => {
    estado.enviando = true;
    atualizarBotao();

    const itens = plano.tarefas
      .map((tarefa, indice) => ({ titulo: tarefa.titulo, prioridade: estado.prioridades[indice] }))
      .filter((_, indice) => estado.marcados.has(indice));

    try {
      const quantidade = await adicionarTarefasDoPlano(itens);
      estado.resultado = {
        tipo: "ok",
        texto: `${quantidade} ${quantidade > 1 ? "tarefas adicionadas" : "tarefa adicionada"} à sua lista.`,
      };
    } catch (erro) {
      console.error("Não foi possível adicionar as tarefas do plano.", erro);
      estado.resultado = {
        tipo: "erro",
        texto: "Não foi possível adicionar as tarefas. Tente novamente.",
      };
    }

    estado.enviando = false;
    renderizarResultado();
    atualizarBotao();
  });

  renderizarResultado();
  rodape.append(resultado, botao);
  card.appendChild(rodape);
  return card;
}

function renderizarConteudoAssistant(bubble, texto, estadosPlano = null, finalizado = false) {
  const { corpo, planos, placeholder } = extrairPlanos(texto, finalizado);
  bubble.innerHTML = renderMarkdown(corpo);

  if (placeholder) {
    const aviso = document.createElement("div");
    aviso.className = "plano-loading";
    aviso.textContent = "Montando plano de estudos…";
    bubble.appendChild(aviso);
  }

  planos.forEach((plano, indice) => {
    bubble.appendChild(montarCardPlano(plano, obterEstadoPlano(estadosPlano, indice, plano)));
  });
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
  el.sendBtn.classList.toggle("is-sending", sending);
  el.sendBtn.setAttribute("aria-label", sending ? "Enviando mensagem" : "Enviar mensagem");

  const label = el.sendBtn.querySelector(".btn-send-label");
  if (label) {
    label.textContent = sending ? "..." : "Enviar";
  }

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
  el.googleBtn.disabled = true;

  if (el.googleBtnLabel) {
    el.googleBtnLabel.textContent = "Redirecionando...";
  }

  const redirectTo = new URL("./", window.location.href).href;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });

  if (error) {
    el.loginMessage.textContent = "Não foi possível entrar: " + error.message;
    el.googleBtn.disabled = false;

    if (el.googleBtnLabel) {
      el.googleBtnLabel.textContent = "Entrar com Google";
    }
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

    const icon = criarIcone("message-square");
    if (icon) {
      item.appendChild(icon);
    }

    const title = document.createElement("span");
    title.className = "conversation-title";
    title.textContent = conversation.title || "Conversa";
    item.appendChild(title);
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

async function aplicarTitulo(conversationId, title) {
  const conversation = state.conversations.find((c) => c.id === conversationId);
  if (!conversation || !title.trim()) {
    return;
  }

  conversation.title = title.trim();
  el.chatTitle.textContent = conversation.title;

  if (!AUTH_ENABLED) {
    conversation.updated_at = new Date().toISOString();
    salvarConversasLocais();
    renderConversations();
    return;
  }

  const { error } = await supabase
    .from("conversations")
    .update({ title: conversation.title })
    .eq("id", conversationId);

  if (!error) {
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
    renderizarConteudoAssistant(bubble, text, null, true);
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

    const retryIcon = criarIcone("rotate-ccw");
    if (retryIcon) {
      retry.appendChild(retryIcon);
    }

    const retryLabel = document.createElement("span");
    retryLabel.textContent = "Tentar novamente";
    retry.appendChild(retryLabel);
    retry.addEventListener("click", onRetry);
    bubble.appendChild(retry);
  }

  row.appendChild(bubble);
  el.messages.appendChild(row);
  scrollToBottom(true);
  return row;
}

async function runAssistantReply(conversationId, text, isRetry = false, needsTitle = false) {
  let typingRow = appendTyping();
  let assistantBubble = null;
  let accumulated = "";
  let hasContent = false;
  let truncationReason = "";
  let estadosPlano = new Map();

  const removeTyping = () => {
    if (typingRow && typingRow.isConnected) {
      typingRow.remove();
    }
    typingRow = null;
  };

  const showTyping = () => {
    removeTyping();
    typingRow = appendTyping();
  };

  const createBubble = (prefix = "") => {
    removeTyping();
    assistantBubble = appendMessage("assistant", "");
    accumulated = prefix;
    estadosPlano = new Map();

    if (prefix) {
      renderizarConteudoAssistant(assistantBubble, accumulated, estadosPlano);
    }
  };

  const finalizeSegment = () => {
    if (!assistantBubble) {
      return;
    }

    renderizarConteudoAssistant(assistantBubble, accumulated, estadosPlano, true);

    const content = accumulated.trim();

    if (content) {
      hasContent = true;

      if (!AUTH_ENABLED) {
        salvarMensagemLocal(conversationId, "assistant", content);
      }
    } else {
      assistantBubble.closest(".msg")?.remove();
    }

    assistantBubble = null;
    accumulated = "";
  };

  try {
    await streamReply(conversationId, text, {
      onSegmentStart: (prefix) => {
        finalizeSegment();

        if (prefix) {
          createBubble(prefix);
        } else if (!typingRow) {
          showTyping();
        }
      },
      onDelta: (delta) => {
        if (!assistantBubble) {
          createBubble();
        }

        accumulated += delta;
        renderizarConteudoAssistant(assistantBubble, accumulated, estadosPlano);
        scrollToBottom();
      },
      onSegmentEnd: ({ continue: willContinue }) => {
        finalizeSegment();

        if (willContinue) {
          showTyping();
        }
      },
      onTruncated: (reason) => {
        truncationReason = reason;
      },
      onTitle: (titulo) => {
        aplicarTitulo(conversationId, titulo);
      },
    }, isRetry, needsTitle);

    finalizeSegment();
    removeTyping();

    if (truncationReason) {
      appendError(
        "A resposta atingiu o limite de continuação. Envie \"continue\" para seguir de onde parei.",
        null,
      );
    }

    if (!hasContent) {
      const errorRow = appendError("Não obtive resposta. Tente novamente.", () => {
        errorRow.remove();
        runAssistantReply(conversationId, text, true);
      });
      return;
    }
  } catch (error) {
    console.error(error);
    finalizeSegment();
    removeTyping();

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

  const conversaAtual = state.conversations.find((item) => item.id === conversationId);
  const precisaTitulo = Boolean(
    conversaAtual
    && conversaAtual.title === "Nova conversa"
    && !(conversaAtual.messages ?? []).some((mensagem) => mensagem.role === "assistant"),
  );

  if (!AUTH_ENABLED) {
    salvarMensagemLocal(conversationId, "user", text);
  }

  el.messageInput.value = "";
  autoGrow();
  setSending(true);

  appendMessage("user", text);

  try {
    await runAssistantReply(conversationId, text, false, precisaTitulo);
  } finally {
    setSending(false);
    el.messageInput.focus();
    await loadConversations();
  }
}

async function streamReply(conversationId, content, handlers = {}, isRetry = false, needsTitle = false) {
  const { onDelta, onSegmentStart, onSegmentEnd, onTruncated, onTitle } = handlers;
  const headers = {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
  };
  const body = { conversationId, content, retry: isRetry, needsTitle };

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

      if (typeof parsed.segment_start === "number") {
        if (onSegmentStart) {
          onSegmentStart(typeof parsed.prefix === "string" ? parsed.prefix : "");
        }
        continue;
      }

      if (typeof parsed.segment_end === "number") {
        if (onSegmentEnd) {
          onSegmentEnd({
            index: parsed.segment_end,
            reason: parsed.reason,
            continue: parsed.continue === true,
          });
        }
        continue;
      }

      if (parsed.truncated === true) {
        if (onTruncated) {
          onTruncated(typeof parsed.reason === "string" ? parsed.reason : "unknown");
        }
        continue;
      }

      if (typeof parsed.title === "string" && parsed.title) {
        if (onTitle) {
          onTitle(parsed.title);
        }
        continue;
      }

      if (typeof parsed.delta === "string") {
        if (onDelta) {
          onDelta(parsed.delta);
        }
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
    || el.sidebar.querySelector(".btn-new");
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

    if (typeof window.OrganizaTema.montarCor === "function") {
      window.OrganizaTema.montarCor(el.loginAccentSlot);
      window.OrganizaTema.montarCor(el.accentSlot);
    }
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
