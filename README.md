# OrganizaAi + EstudAI

Aplicação web estática com dois módulos:

- **OrganizaAi**: lista de tarefas local no modo visitante ou por usuário no Supabase.
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

- OrganizaAi abre direto, sem tela de login.
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
   └─ Edge Function chat   Deno + Gemini API
              └─ secret GEMINI_API_KEY
```

## Estrutura

```
index.html                         OrganizaAi — lista de tarefas
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
  functions/chat/index.ts          Proxy autenticado para o Gemini
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
npx supabase secrets set GEMINI_API_KEY=... --project-ref zuucmcmaexwvxypsgfks
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

- Modelo padrão: `gemini-3.5-flash`.
- A função tenta modelos alternativos quando há 503/429 ou timeout.
- A chave é enviada no header `x-goog-api-key`.
- Para alterar o modelo:

```bash
npx supabase secrets set GEMINI_MODEL=gemini-3.8-flash --project-ref zuucmcmaexwvxypsgfks
```

## Segurança

- A `publishable key` é pública por design; a proteção vem do RLS.
- A `GEMINI_API_KEY` fica apenas nos secrets do Supabase.
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
- **Erro 502 na função**: confira `GEMINI_API_KEY` e a cota do Gemini.
- **Perfil não encontrado**: verifique o trigger `on_auth_user_created` e a
  migration `0002_ai_chat.sql`.
