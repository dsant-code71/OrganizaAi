(function () {
    var SUPABASE_URL = window.ORGANIZAAI_SUPABASE_URL;
    var SUPABASE_KEY = window.ORGANIZAAI_SUPABASE_KEY;

    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        console.error('Supabase JS não foi carregado.');
        return;
    }

    window.organizaaiClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
    });
})();
