# OrganizAI + EstudAI

Repaginação do OrganizAI: o antigo sistema de checklists deu lugar ao
**EstudAI**, um assistente de estudos com IA integrado ao Supabase (Auth +
Postgres + Edge Functions) e ao Google Gemini.

A lista de tarefas (`index.html` / `todolist.js`) continua funcionando como **OrganizAI**.

## Arquitetura

```
Navegador (todolist + ia/)
   │  supabase-js via CDN (publishable key — pública)
   ├─ Supabase Auth        (login com Google)
   ├─ Postgres             (conversations / messages, protegidas por RLS)
   └─ Edge Function "chat" (Deno) ──streaming──> Gemini API
              └─ secret GEMINI_API_KEY (somente no servidor)
```

## Estrutura

```
index.html / todolist.css / todolist.js   OrganizAI — lista de tarefas
ia/
  index.html   EstudAI — tela de login + chat
  ia.css       Estilos (mesma identidade visual)
  ia.js        Lógica do chat (streaming, Markdown sanitizado)
  config.js    SUPABASE_URL + publishable key (públicas)
supabase/
  config.toml
  migrations/0001_ai_chat.sql   Tabelas + RLS + onboarding de usuários
  functions/chat/index.ts       Proxy autenticado para o Gemini
```

## O que já está configurado

- Projeto Supabase: `zuucmcmaexwvxypsgfks` (OrganizaAi).
- Tabelas `conversations` e `messages` com RLS (cada usuário só vê as suas).
- Trigger `on_auth_user_created`: cria um `profiles` automaticamente no
  primeiro login (necessário para o Google OAuth).
- Edge Function `chat` publicada (com fallback de modelo).
- Secret `GEMINI_API_KEY` definido.
- Auth `site_url` = `https://organizai-dsant.vercel.app` e redirects liberados.

## Passo manual restante: ativar o login com Google

1. **Google Cloud Console** → APIs & Services → Credentials
   → Create Credentials → **OAuth client ID** (Web application).
   - Authorized redirect URI:
     `https://zuucmcmaexwvxypsgfks.supabase.co/auth/v1/callback`
   - Copie o **Client ID** e o **Client Secret**.
2. **Supabase Dashboard** → Authentication → Providers → **Google**
   → habilite e cole o Client ID/Secret → Save.
3. Confirme em Authentication → URL Configuration:
   - Site URL: `https://organizai-dsant.vercel.app`
   - Redirect URLs: `https://organizai-dsant.vercel.app/**`

Sem esse passo, o botão "Entrar com Google" retorna erro de provider não habilitado.

## Deploy do frontend

O site é estático (Vercel via GitHub `dsant-code71/OrganizaAi`). Basta
commitar/pushar as alterações; a Vercel publica `index.html` e `ia/`.

## Desenvolvimento local

```bash
# servir o site estático (qualquer servidor)
npx serve .

# (opcional) rodar a function localmente
npx supabase functions serve chat --env-file ./supabase/.env.local
```

Para o login local, adicione `http://localhost:3000/**` nas Redirect URLs
(já incluído no allow list).

## Modelo da IA

- Padrão atual: `gemini-3.5-flash` (o `gemini-3.8-flash` está instável/sobrecarregado).
- A função tenta automaticamente `3.6`, `3.7` e `3.8` se o principal estiver
  indisponível (503/429) ou travar (timeout de 10s por modelo).
- A chave vai no header `x-goog-api-key` (o formato `?key=` travava na Edge Function).
- Para voltar ao 3.8 quando ele estabilizar:

```bash
npx supabase secrets set GEMINI_MODEL=gemini-3.8-flash --project-ref zuucmcmaexwvxypsgfks
```

## Segurança

- A `publishable key` é pública por design; a proteção vem do **RLS**.
- A `GEMINI_API_KEY` fica apenas nos secrets do Supabase — nunca no frontend.
- **Rotacione** as chaves que foram compartilhadas por chat:
  - Personal Access Token do Supabase (Settings → Access Tokens).
  - `GEMINI_API_KEY` (Google AI Studio) e atualize o secret:
    `npx supabase secrets set GEMINI_API_KEY=... --project-ref zuucmcmaexwvxypsgfks`

## Solução de problemas

- **"provider is not enabled"**: falta ativar o Google no passo manual acima.
- **"Conversa não encontrada" / 401**: sessão expirada — faça login de novo.
- **Erro 502 da função**: verifique o secret `GEMINI_API_KEY` e a cota do Gemini.
