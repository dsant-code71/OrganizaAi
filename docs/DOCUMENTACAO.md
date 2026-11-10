# OrganizaAi — Documentação Técnica

## 1. Visão geral

O OrganizaAi é uma aplicação web estática com dois módulos:

- **OrganizaAi**: lista de tarefas local no modo visitante ou privada por usuário no Supabase.
- **EstudAI**: chat de estudos com histórico de conversas e respostas em streaming.

O fluxo de autenticação Google continua no projeto, mas está desativado por
padrão. No modo atual (visitante), tarefas e conversas ficam no `localStorage`
do navegador. O projeto não utiliza mais checklist, gestão de usuários, papéis,
CPF ou auditoria. O login por e-mail/senha foi removido.

## 2. Stack

| Camada | Tecnologia |
|---|---|
| Frontend | HTML5, CSS3, JavaScript sem build |
| Modo atual | Visitante local (`localStorage`) |
| Autenticação | Supabase Auth com Google OAuth (desativada por flag) |
| Banco | PostgreSQL no Supabase (modo autenticado) |
| Backend de IA | Edge Function `chat` em Deno |
| Modelo | IA multi-provedor (Groq, Gemini e OpenRouter) |
| Deploy | Vercel (estático) |

## 3. Estrutura

```
index.html
login.html
assets/
  css/auth.css
  css/todolist.css
  js/app-config.js
  js/auth.js
  js/login.js
  js/supabase-config.js
  js/theme.js
  js/todolist.js
ia/
  index.html
  ia.css
  ia.js
  config.js
supabase/
  config.toml
  migrations/0001_init.sql
  migrations/0002_ai_chat.sql
  migrations/0003_remove_legacy.sql
  functions/chat/index.ts
docs/
  DOCUMENTACAO.md
  tarefas.md
  ref-js.md
```

`docs/tarefas.md` e `docs/ref-js.md` são materiais didáticos históricos. A
documentação operacional atual é este arquivo.

## 4. Autenticação

### 4.0 Estado atual

A flag fica em `assets/js/app-config.js`:

```js
window.ORGANIZAAI_AUTH_ENABLED = false;
```

- `false`: modo visitante local. Não há login; tarefas e conversas usam
  `localStorage`; o chat chama a Edge Function com `guest: true`.
- `true`: fluxo Google OAuth + Supabase descrito abaixo.

### 4.1 Fluxo

1. O usuário acessa `index.html` ou `ia/index.html` sem sessão.
2. O frontend redireciona para `login.html` ou exibe a tela de login do EstudAI.
3. O botão Google chama `supabase.auth.signInWithOAuth`.
4. O Supabase redireciona para o Google e retorna para a URL configurada.
5. O trigger `on_auth_user_created` cria o registro em `profiles`.
6. O frontend carrega o perfil, verifica `ativo` e registra o acesso.

### 4.2 Regras

- Somente contas Google são aceitas.
- `profiles.ativo = false` bloqueia o acesso.
- O redirecionamento pós-login usa apenas caminhos internos.
- O logout encerra a sessão Supabase e volta para `login.html`.

### 4.3 Arquivos

- `assets/js/app-config.js`: liga/desliga a autenticação.
- `login.html` e `assets/js/login.js`: entrada Google e retorno do OAuth.
- `assets/js/auth.js`: sessão, perfil, sidebar, conta e logout.
- `ia/index.html` e `ia/ia.js`: login/sessão ou modo visitante do EstudAI.

## 5. Modelo de dados

No modo visitante, as tabelas abaixo não são usadas; os dados ficam no
`localStorage`. Elas continuam necessárias para o modo autenticado.

### 5.1 `profiles`

| Campo | Tipo | Observação |
|---|---|---|
| `id` | uuid | Igual a `auth.users.id` |
| `nome_completo` | text | Nome recebido do Google |
| `username` | text | Gerado a partir do e-mail |
| `email` | text | Único |
| `ativo` | boolean | Bloqueia acesso quando falso |
| `created_at` | timestamptz | Criação |
| `updated_at` | timestamptz | Atualização automática |
| `last_login_at` | timestamptz | Atualizado por `registrar_acesso()` |

### 5.2 `tasks`

| Campo | Tipo |
|---|---|
| `id` | uuid |
| `user_id` | uuid |
| `texto` | text |
| `concluida` | boolean |
| `prioridade` | enum `task_priority` |
| `ordem` | integer |
| `created_at` | timestamptz |
| `updated_at` | timestamptz |

### 5.3 `conversations`

| Campo | Tipo |
|---|---|
| `id` | uuid |
| `user_id` | uuid |
| `title` | text |
| `created_at` | timestamptz |
| `updated_at` | timestamptz |

### 5.4 `messages`

| Campo | Tipo |
|---|---|
| `id` | uuid |
| `conversation_id` | uuid |
| `role` | `user` ou `assistant` |
| `content` | text |
| `created_at` | timestamptz |

## 6. Funções do banco

| Função | Uso |
|---|---|
| `handle_new_user()` | Cria o perfil no primeiro login Google |
| `is_ativo()` | Verifica se o usuário autenticado está ativo |
| `registrar_acesso()` | Atualiza `last_login_at` |
| `set_updated_at()` | Atualiza `updated_at` em alterações |
| `bump_conversation_updated_at()` | Atualiza a conversa ao inserir mensagem |

## 7. RLS

- `profiles`: o usuário lê apenas o próprio perfil, inclusive quando inativo.
- `tasks`: leitura e escrita apenas para o próprio `user_id` e usuário ativo.
- `conversations`: leitura e escrita apenas para o próprio `user_id` e usuário ativo.
- `messages`: acesso apenas dentro de conversas do próprio usuário e usuário ativo.

A `publishable key` é pública. O isolamento depende das policies de RLS.

## 8. Migrations

### `0001_init.sql`

Schema histórico com perfis, tarefas, checklist, máquinas, auditoria e papéis.
É mantido para preservar a ordem de aplicação em bancos existentes.

### `0002_ai_chat.sql`

- Cria `conversations` e `messages`.
- Cria policies e triggers de atualização.
- Define `handle_new_user` para criar apenas `id`, `nome_completo`,
  `username`, `email` e `ativo`.

### `0003_remove_legacy.sql`

- Remove tabelas de checklist, máquinas e auditoria.
- Remove funções de papéis, auditoria e troca de senha.
- Remove `cpf`, `role`, `must_change_password` e `created_by` de `profiles`.
- Remove o tipo `app_role`.
- Recria `profiles_select` para leitura do próprio perfil.

Em bancos novos, o schema legado é criado por `0001` e removido por `0003`.
Em bancos existentes, `0003` aplica a limpeza.

## 9. Frontend

### 9.1 OrganizaAi

- `index.html`: estrutura da lista.
- `assets/js/todolist.js`: carrega, cria, atualiza, remove, filtra e reordena
  tarefas. Usa `localStorage` no modo visitante ou Supabase no modo autenticado.
- `assets/js/auth.js`: valida a sessão e monta sidebar/conta.
- `assets/js/theme.js`: tema claro/escuro persistido em `localStorage`.

### 9.2 EstudAI

- `ia/index.html`: login (modo auth) ou interface direta (modo visitante).
- `ia/ia.js`: conversas locais ou Supabase, mensagens, streaming e Markdown
  sanitizado.
- `supabase/functions/chat/index.ts`: valida a sessão no modo autenticado ou
  aceita `guest: true` sem banco; percorre a cadeia de IA (Groq, Gemini e
  OpenRouter), tenta o próximo provedor em `429`/`5xx`/timeout e devolve
  streaming. O histórico é limitado por caracteres e a saída por
  `AI_SEGMENT_MAX_TOKENS` para conter o consumo de tokens.
- Respostas longas são divididas em segmentos com continuação automática: a
  função detecta o marcador `[[CONTINUE]]`, cortes por limite de tokens e o
  limite suave por segmento, pausa em fronteira segura (fim de frase,
  parágrafo, item de lista, linha de tabela ou bloco de código fechado) e
  abre um novo segmento preservando a cauda pendente como prefixo. Os
  eventos SSE `segment_start`, `delta`, `segment_end` (`continue`),
  `truncated` e `[DONE]` guiam o frontend; cada segmento vira uma mensagem
  `assistant` separada. Limites de segurança: `AI_TOTAL_OUTPUT_TOKENS`
  (padrão `8192`), `AI_MAX_SEGMENTS` (padrão `8`) e
  `AI_CONTINUATION_DEADLINE_MS` (padrão `120000`). O legado
  `AI_MAX_OUTPUT_TOKENS` ainda é respeitado como fallback de
  `AI_SEGMENT_MAX_TOKENS`.
- Integração EstudAI → OrganizaAi: pedidos de guia/plano/cronograma de
  estudos fazem a IA anexar um bloco ```plano com JSON de tópicos. O
  `ia/ia.js` extrai o bloco (`extrairPlanos`), renderiza um card interativo
  (checkbox por tópico, prioridade alta/média/baixa/nenhuma) e cria as
  tarefas na lista do OrganizaAi: insert na tabela `tasks` (modo
  autenticado) ou escrita na chave `organizaai.tarefas.visitante.v1` do
  `localStorage` (modo visitante — a mesma chave usada por
  `assets/js/todolist.js`). Bloco com JSON inválido cai no fallback de
  bloco de código comum; fence ainda aberta durante o streaming mostra
  "Montando plano de estudos…".

## 10. Execução local

```bash
npx serve .
```

Abra `http://localhost:3000`. No modo visitante não é necessário configurar
Redirect URLs. Para usar outra porta no modo autenticado, inclua a URL nas
Redirect URLs do Supabase.

Função de chat local:

```bash
npx supabase functions serve chat --env-file ./supabase/.env.local
```

## 11. Deploy

No modo visitante, basta publicar o frontend e a função `chat` atualizada:

1. Publique a função com `npx supabase functions deploy chat`.
2. Configure `GROQ_API_KEY` e `GEMINI_API_KEY` nos secrets (e
   `OPENROUTER_API_KEY` se usar o fallback).
3. Faça push para o GitHub; a Vercel publica os arquivos estáticos.

Ao reativar a autenticação, aplique também as migrations com
`npx supabase db push` e configure o provider Google.

## 12. Segurança

- Não coloque `GROQ_API_KEY`, `GEMINI_API_KEY` nem `OPENROUTER_API_KEY` no
  frontend.
- Mantenha RLS habilitado em todas as tabelas.
- No modo visitante, a função `chat` aceita chamadas sem JWT; use apenas para
  uso local/pessoal. Ao reativar a auth, o fluxo autenticado volta a ser exigido.
- Rotacione tokens e chaves expostos.
- Revise as Redirect URLs ao trocar de domínio.
- Não desative `is_ativo()` nas policies de dados.

## 13. Solução de problemas

| Sintoma | Causa provável | Ação |
|---|---|---|
| `provider is not enabled` | Google desativado no Supabase | Ativar provider |
| `redirect_uri_mismatch` | URL não permitida | Revisar Redirect URLs |
| Perfil não encontrado | Trigger ausente ou falhou | Conferir `0002_ai_chat.sql` |
| Usuário desativado | `profiles.ativo = false` | Reativar no banco |
| 401 no chat visitante | Função antiga sem `guest` | Publicar `chat` atualizada |
| Tarefas/conversas somem | Outro navegador/origem | Usar o mesmo `localStorage` |
| 401 no chat autenticado | Sessão expirada | Entrar novamente |
| 502 no chat | Chaves/cota dos provedores | Revisar secrets e cotas |

## 14. Checklist de validação

Modo visitante (atual):

- [ ] OrganizaAi abre direto, sem tela de login.
- [ ] Tarefas persistem no `localStorage` após recarregar.
- [ ] Sidebar mostra apenas OrganizaAi e EstudAI.
- [ ] Tema claro/escuro funciona nas telas.
- [ ] EstudAI abre direto e lista conversas locais.
- [ ] Chat responde via função `chat` com `guest: true`.
- [ ] Conversas locais persistem no `localStorage`.

Modo autenticado (quando reativado):

- [ ] `login.html` abre sem sessão e mostra apenas o botão Google.
- [ ] Login Google cria/recupera o perfil.
- [ ] Usuário inativo é bloqueado.
- [ ] OrganizaAi carrega e persiste tarefas do usuário no Supabase.
- [ ] EstudAI lista conversas e envia mensagens autenticadas.
- [ ] Logout encerra a sessão.
- [ ] RLS impede acesso a dados de outro usuário.
