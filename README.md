# OrganizAI + EstudAI

Aplicação web estática com dois módulos:

- **OrganizAI**: lista de tarefas local no modo visitante ou por usuário no Supabase.
- **EstudAI**: assistente de estudos com IA.

O fluxo de **Google OAuth** via Supabase Auth continua no projeto, mas está
desativado por padrão. No modo atual (visitante), o app abre sem login e salva
tarefas e conversas no `localStorage` do navegador. O projeto não possui mais
checklist, gestão de usuários, papéis, CPF ou auditoria.

## Modo visitante (padrão atual)

O interruptor fica em `assets/js/app-config.js`:

```js
window.ORGANIZAAI_AUTH_ENABLED = false;
```

Com `false`:

- OrganizAI abre direto, sem tela de login.
- Tarefas ficam em `organizaai.tarefas.visitante.v1` no `localStorage`.
- EstudAI abre direto e as conversas ficam em
  `organizaai.estudai.visitante.v1` no `localStorage`.
- O chat chama a Edge Function com `guest: true`, sem gravar no Postgres.
- `login.html`, `auth.js`, `login.js` e as migrations continuam intactos.

Para reativar a autenticação, configure o Google no Supabase e mude a flag para
`true`.

## Arquitetura

```
Navegador (index.html, login.html, ia/)
   │  supabase-js via CDN (publishable key pública)
   ├─ Modo visitante       localStorage + chat guest
   ├─ Supabase Auth        Google OAuth (quando reativado)
   ├─ Postgres             profiles / tasks / conversations / messages
   └─ Edge Function chat   Deno + IA multi-provedor
              └─ secrets GROQ_API_KEY / GEMINI_API_KEY
```

## Estrutura

```
index.html                         OrganizAI — lista de tarefas
login.html                         Entrada com Google
assets/
  css/auth.css                     Login, sidebar, conta e tema
  css/todolist.css                 Lista de tarefas
  js/app-config.js                 Interruptor do modo visitante/auth
  js/auth.js                       Sessão, perfil, sidebar e logout
  js/login.js                      Fluxo OAuth e redirecionamento
  js/supabase-config.js            URL + publishable key
  js/theme.js                      Tema claro/escuro
  js/todolist.js                   CRUD de tarefas (local ou Supabase)
ia/
  index.html                       EstudAI — login + chat
  ia.css                           Estilos do chat
  ia.js                            Conversas locais/Supabase, streaming e Markdown
  config.js                        URL + chave pública + flag de auth
supabase/
  config.toml
  migrations/0001_init.sql         Schema histórico (perfis/tarefas)
  migrations/0002_ai_chat.sql      Conversas/mensagens + trigger de perfil
  migrations/0003_remove_legacy.sql Limpeza de checklist/admin/CPF/papéis
  functions/chat/index.ts          Proxy autenticado para IA (Groq/Gemini/OpenRouter)
docs/
  DOCUMENTACAO.md                  Documentação técnica atual
  tarefas.md                       Material didático histórico
  ref-js.md                        Referência didática histórica
```

## Reativar autenticação Google

Só é necessário quando `window.ORGANIZAAI_AUTH_ENABLED` voltar para `true`.

1. Ative o provider **Google** em Authentication → Providers.
   - Authorized redirect URI:
     `https://zuucmcmaexwvxypsgfks.supabase.co/auth/v1/callback`
   - Informe Client ID e Client Secret.
2. Configure Authentication → URL Configuration:
   - Site URL de produção: `https://organizai-dsant.vercel.app`
   - Redirect URLs:
     - `https://organizai-dsant.vercel.app/**`
     - `http://localhost:3000/**`
     - `http://127.0.0.1:8765/**`
3. Aplique as migrations:

```bash
npx supabase db push
```

4. Publique a função de chat e configure o secret:

```bash
npx supabase functions deploy chat --project-ref zuucmcmaexwvxypsgfks
npx supabase secrets set GROQ_API_KEY=... GEMINI_API_KEY=... --project-ref zuucmcmaexwvxypsgfks
```

Sem o provider Google habilitado, o botão de entrada retorna erro de provider.
No modo visitante, a autenticação não é chamada.

## Desenvolvimento local

```bash
npx serve .
```

Abra `http://localhost:3000`. A URL usada no login precisa estar nas Redirect
URLs do Supabase somente quando a autenticação estiver ativa.

Para executar a função localmente:

```bash
npx supabase functions serve chat --env-file ./supabase/.env.local
```

## Deploy do frontend

O site é estático e publicado pela Vercel a partir do GitHub
`dsant-code71/OrganizaAi`. A Vercel publica `index.html`, `login.html`,
`assets/` e `ia/`.

## Modelo da IA

- Cadeia padrão (free tier): Groq `openai/gpt-oss-120b`, `qwen/qwen3.8-27b`,
  `openai/gpt-oss-20b`, depois Gemini `gemini-3.8-flash` e
  `gemini-3.5-flash-lite`, e por fim OpenRouter `:free`.
- O consumo é reduzido com limite de histórico (`AI_HISTORY_MAX_CHARS`,
  padrão `6000`), saída máxima por segmento (`AI_SEGMENT_MAX_TOKENS`,
  padrão `1024`, com fallback do legado `AI_MAX_OUTPUT_TOKENS`) e
  `GEMINI_THINKING_LEVEL=low`.
- No Groq, `openai/gpt-oss-*` usa `reasoning_effort=low` e `qwen/*` desativa o
  raciocínio por padrão para poupar tokens. Ajuste com
  `GROQ_REASONING_EFFORT`.
- `429` em um provedor agora tenta o próximo da cadeia em vez de encerrar.
- Respostas longas são divididas em segmentos e continuadas automaticamente:
  a função detecta o marcador `[[CONTINUE]]` escrito pela IA, cortes por limite
  de tokens (`finish_reason=length`) e o limite suave por segmento (~80%),
  pausa em uma fronteira segura (fim de frase, parágrafo, item de lista, linha
  de tabela ou bloco de código fechado) e abre um novo segmento preservando a
  cauda pendente. Limites de segurança: `AI_TOTAL_OUTPUT_TOKENS` (padrão
  `8192`), `AI_MAX_SEGMENTS` (padrão `8`) e `AI_CONTINUATION_DEADLINE_MS`
  (padrão `120000`). Ao atingi-los, o aviso `truncated` é enviado ao frontend.
- Cada segmento é salvo como uma mensagem `assistant` separada (banco no modo
  autenticado; `localStorage` no modo visitante).
- Quando o aluno pede um guia, plano, cronograma ou roteiro de estudos, a IA
  escreve o guia em Markdown e anexa ao final um bloco ```plano com JSON
  (`{"versao":1,"tarefas":[{"titulo","prioridade"}]}`). O EstudAI renderiza
  esse bloco como um card interativo (tópicos, prioridades e seleção) que
  cria as tarefas na lista do OrganizAI — direto no `tasks` via Supabase no
  modo autenticado, ou na mesma chave de `localStorage` do modo visitante.
- A cadeia é configurável:

```bash
npx supabase secrets set AI_CHAIN="groq:openai/gpt-oss-120b,gemini:gemini-3.8-flash" --project-ref zuucmcmaexwvxypsgfks
```

- Chaves: `GROQ_API_KEY`, `GEMINI_API_KEY` e, opcionalmente,
  `OPENROUTER_API_KEY`.
- Para forçar um modelo Gemini específico:

```bash
npx supabase secrets set GEMINI_MODEL=gemini-3.5-flash-lite --project-ref zuucmcmaexwvxypsgfks
```

## Segurança

- A `publishable key` é pública por design; a proteção vem do RLS.
- As chaves `GROQ_API_KEY`, `GEMINI_API_KEY` e `OPENROUTER_API_KEY` ficam
  apenas nos secrets do Supabase.
- No modo visitante, a função `chat` aceita chamadas sem JWT (`guest: true`).
  Use esse modo apenas para uso local/pessoal; ao reativar a auth, o fluxo
  autenticado volta a ser exigido.
- Rotacione tokens e chaves que tenham sido compartilhados.
- Perfis inativos são bloqueados no frontend e pelas policies do banco.

## Solução de problemas

- **provider is not enabled**: habilite o Google no Supabase.
- **redirect_uri_mismatch**: revise as Redirect URLs e a URL de callback.
- **Sessão expirada / 401**: entre novamente com Google.
- **IA indisponível no modo visitante**: publique a função `chat` atualizada.
- **Tarefas/conversas somem**: o modo visitante salva por navegador e origem;
  outro navegador ou domínio terá outro `localStorage`.
- **Erro 502 na função**: confira as chaves configuradas e a cota dos provedores.
- **Perfil não encontrado**: verifique o trigger `on_auth_user_created` e a
  migration `0002_ai_chat.sql`.
