(function () {
  var script = document.currentScript;
  var base = (script && script.dataset.base) || './';

  function iniciais(nome) {
    var partes = String(nome || '').trim().split(/\s+/).filter(Boolean);

    if (partes.length === 0) {
      return '?';
    }

    if (partes.length === 1) {
      return partes[0].slice(0, 2).toUpperCase();
    }

    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
  }

  function montar(perfil) {
    var container = document.getElementById('headerActions');

    if (!container) {
      container = document.createElement('div');
      container.id = 'headerActions';
      container.className = 'header-actions';
      document.body.appendChild(container);
    }

    container.replaceChildren();

    var chip = document.createElement('div');
    chip.className = 'user-chip';

    var avatar = document.createElement('span');
    avatar.className = 'user-avatar';
    avatar.textContent = iniciais(perfil.nome_completo);
    avatar.setAttribute('aria-hidden', 'true');

    var info = document.createElement('div');
    info.className = 'user-info';

    var nome = document.createElement('strong');
    nome.textContent = perfil.nome_completo;

    var papel = document.createElement('span');
    papel.className = 'user-role ' + perfil.role;
    papel.textContent = perfil.role === 'gestor' ? 'Gestor' : 'Operador';

    info.appendChild(nome);
    info.appendChild(papel);

    var acoes = document.createElement('div');
    acoes.className = 'user-actions';

    if (perfil.role === 'gestor') {
      var linkAdmin = document.createElement('a');
      linkAdmin.className = 'header-link';
      linkAdmin.href = base + 'usuarios.html';
      linkAdmin.textContent = 'Usuários';
      acoes.appendChild(linkAdmin);
    }

    var sair = document.createElement('button');
    sair.type = 'button';
    sair.className = 'header-logout';
    sair.textContent = 'Sair';
    sair.addEventListener('click', async function () {
      await Auth.logout();
      window.location.href = base + 'login.html';
    });

    acoes.appendChild(sair);
    chip.appendChild(avatar);
    chip.appendChild(info);
    chip.appendChild(acoes);
    container.appendChild(chip);
  }

  function aplicarPermissoes() {
    document.querySelectorAll('[data-perm]').forEach(function (elemento) {
      if (!Auth.pode(elemento.dataset.perm)) {
        elemento.hidden = true;
      }
    });
  }

  var pronto = window.AUTH_READY || Promise.resolve(null);

  pronto.then(function (perfil) {
    if (!perfil) {
      return;
    }

    montar(perfil);
    aplicarPermissoes();
  });
})();
