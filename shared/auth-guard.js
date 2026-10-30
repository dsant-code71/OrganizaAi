(function () {
  var script = document.currentScript;
  var perfis = script && script.dataset.perfis
    ? script.dataset.perfis.split(',').map(function (perfil) {
        return perfil.trim();
      }).filter(Boolean)
    : null;
  var login = (script && script.dataset.login) || 'login.html';
  var fallback = (script && script.dataset.fallback) || 'index.html';

  document.documentElement.classList.add('auth-pending');

  if (!window.Auth) {
    console.error('Módulo de autenticação não carregado.');
    document.documentElement.classList.remove('auth-pending');
    window.AUTH_READY = Promise.resolve(null);
    return;
  }

  window.AUTH_READY = window.Auth.proteger({
    perfis: perfis,
    login: login,
    fallback: fallback
  }).then(function (perfil) {
    if (perfil) {
      document.documentElement.classList.remove('auth-pending');
    }

    return perfil;
  }).catch(function (erro) {
    console.error('Falha ao validar a sessão.', erro);
    document.documentElement.classList.remove('auth-pending');
    return null;
  });
})();
