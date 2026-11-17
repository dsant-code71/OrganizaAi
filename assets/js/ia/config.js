// Configuração pública do Supabase (segura para o navegador).
// A proteção real dos dados vem das políticas RLS no banco.
export const SUPABASE_URL = window.ORGANIZAAI_SUPABASE_URL;
export const SUPABASE_ANON_KEY = window.ORGANIZAAI_SUPABASE_KEY;
export const CHAT_FUNCTION = "chat";
export const AUTH_ENABLED = window.ORGANIZAAI_AUTH_ENABLED === true;
