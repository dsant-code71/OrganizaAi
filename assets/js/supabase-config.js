(function () {
    var SUPABASE_URL = 'https://zuucmcmaexwvxypsgfks.supabase.co';
    var SUPABASE_KEY = 'sb_publishable_XtSStg3PPKWmmr_nIqpZFQ_N-C1icfu';
    var script = document.currentScript;
    var baseUrl = new URL('../../', script && script.src ? script.src : window.location.href);

    window.organizaaiBaseUrl = baseUrl.href;

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
