# Instruções do projeto — OrganizAI / EstudAI

## Git

- **Nunca faça `git push`.** O limite é commit local.
- Faça push somente se o usuário pedir explicitamente na conversa atual.
- Não reverta, reescreva ou cancele pushes já realizados sem autorização explícita.

## Regras já definidas

- EstudAI (`/ia/`) é a entrada principal; `/` redireciona para ele.
- `vercel.json` é a fonte da verdade para redirects, rewrites e headers. Use `npm run dev` localmente — não use `npx serve .`.
- Modo visitante com `ORGANIZAAI_AUTH_ENABLED = false`; nunca expor secrets ou tokens no frontend/repositório.
- Matemática nas respostas da IA sem LaTeX: usar `√`, `²`, `³`, `·`, `÷`, `≈`, frações como `a/b`.
- Documentação canônica: `README.md` e `docs/DOCUMENTACAO.md`.
