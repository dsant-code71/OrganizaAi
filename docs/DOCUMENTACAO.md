# OrganizaAi — Documentação Técnica

## 1. Visão geral

O OrganizaAi é uma aplicação web estática com autenticação Google e persistência
no Supabase. Ele oferece dois módulos:

- **OrganizaAi**: lista de tarefas privada por usuário.
- **EstudAI**: chat de estudos com histórico de conversas e respostas em streaming.

O projeto não utiliza mais checklist, gestão de usuários, papéis, CPF ou
auditoria. O login por e-mail/senha foi removido.

## 2. Stack

| Camada | Tecnologia |
|---|---|
| Frontend | HTML5, CSS3, JavaScript sem build |
| Autenticação | Supabase Auth com Google OAuth |
| Banco | PostgreSQL no Supabase |
| Backend de IA | Edge Function `chat` em Deno |
| Modelo | Google Gemini |
| Deploy | Vercel (estático) |

## 3. Estrutura

```
index.html
login.html
assets/
  css/auth.css
  css/todolist.css
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

- `login.html` e `assets/js/login.js`: entrada Google e retorno do OAuth.
- `assets/js/auth.js`: sessão, perfil, sidebar, conta e logout.
- `ia/index.html` e `ia/ia.js`: login e sessão do EstudAI.

## 5. Modelo de dados

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
- `assets/js/todolist.js`: carrega, cria, atualiza, remove, filtra e reordena tarefas.
- `assets/js/auth.js`: valida a sessão e monta sidebar/conta.
- `assets/js/theme.js`: tema claro/escuro persistido em `localStorage`.

### 9.2 EstudAI

- `ia/index.html`: login e interface do chat.
- `ia/ia.js`: sessão, conversas, mensagens, streaming e Markdown sanitizado.
- `supabase/functions/chat/index.ts`: valida a sessão, chama o Gemini e devolve
  a resposta em streaming.

## 10. Execução local

```bash
npx serve .
```

Abra `http://localhost:3000`. Para usar outra porta, inclua a URL nas Redirect
URLs do Supabase.

Função de chat local:

```bash
npx supabase functions serve chat --env-file ./supabase/.env.local
```

## 11. Deploy

1. Aplique as migrations com `npx supabase db push`.
2. Publique a função com `npx supabase functions deploy chat`.
3. Configure `GEMINI_API_KEY` nos secrets.
4. Faça push para o GitHub; a Vercel publica os arquivos estáticos.

## 12. Segurança

- Não coloque `GEMINI_API_KEY` no frontend.
- Mantenha RLS habilitado em todas as tabelas.
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
| 401 no chat | Sessão expirada | Entrar novamente |
| 502 no chat | Chave/cota do Gemini | Revisar secret e cota |

## 14. Checklist de validação

- [ ] `login.html` abre sem sessão e mostra apenas o botão Google.
- [ ] Login Google cria/recupera o perfil.
- [ ] Usuário inativo é bloqueado.
- [ ] OrganizaAi carrega e persiste tarefas do usuário.
- [ ] Sidebar mostra apenas OrganizaAi e EstudAI.
- [ ] Tema claro/escuro funciona nas três telas.
- [ ] EstudAI lista conversas e envia mensagens.
- [ ] Logout encerra a sessão.
- [ ] RLS impede acesso a dados de outro usuário.
