(function () {
  var config = window.APP_CONFIG || {};

  if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
    console.error('Supabase não configurado em shared/config.js.');
    window.SB_CONFIG_OK = false;
    return;
  }

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.error('Biblioteca do Supabase não carregada.');
    window.SB_CONFIG_OK = false;
    return;
  }

  window.sb = window.supabase.createClient(
    config.SUPABASE_URL,
    config.SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );

  window.SB_CONFIG_OK = true;
})();
