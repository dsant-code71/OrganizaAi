var Auth = (function () {
  var perfilAtual = null;

  var PERMISSOES = {
    gestor: [
      'tarefas.operar',
      'checklists.operar',
      'maquinas.gerir',
      'usuarios.gerir',
      'auditoria.ver',
      'exportar'
    ],
    operador: [
      'tarefas.operar',
      'checklists.operar',
      'exportar'
    ]
  };

  function configurado() {
    return !!(window.sb && window.SB_CONFIG_OK);
  }

  function normalizarEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  async function buscarPerfil(id) {
    var resposta = await window.sb
      .from('profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (resposta.error) {
      throw resposta.error;
    }

    return resposta.data || null;
  }

  async function carregarPerfil() {
    if (!configurado()) {
      perfilAtual = null;
      return null;
    }

    var sessao = await window.sb.auth.getSession();
    var session = sessao.data.session;

    if (!session) {
      perfilAtual = null;
      return null;
    }

    var perfil = await buscarPerfil(session.user.id);

    if (!perfil || perfil.ativo !== true) {
      await window.sb.auth.signOut();
      perfilAtual = null;
      return null;
    }

    perfilAtual = perfil;
    return perfil;
  }

  async function login(email, senha) {
    if (!configurado()) {
      throw new Error('Supabase não configurado.');
    }

    var resposta = await window.sb.auth.signInWithPassword({
      email: normalizarEmail(email),
      password: senha
    });

    if (resposta.error) {
      throw resposta.error;
    }

    var perfil = await buscarPerfil(resposta.data.user.id);

    if (!perfil || perfil.ativo !== true) {
      await window.sb.auth.signOut();
      throw new Error('Usuário inativo ou sem perfil cadastrado.');
    }

    perfilAtual = perfil;

    try {
      await window.sb.rpc('registrar_acesso');
    } catch (erro) {
      console.warn('Não foi possível atualizar o último acesso.', erro);
    }

    return perfil;
  }

  async function logout() {
    perfilAtual = null;

    if (configurado()) {
      await window.sb.auth.signOut();
    }
  }

  function usuarioAtual() {
    return perfilAtual;
  }

  function temPerfil(perfil) {
    return !!perfilAtual && perfilAtual.role === perfil;
  }

  function ehGestor() {
    return temPerfil('gestor');
  }

  function pode(permissao) {
    if (!perfilAtual) {
      return false;
    }

    var lista = PERMISSOES[perfilAtual.role] || [];
    return lista.indexOf(permissao) !== -1;
  }

  async function registrarAuditoria(acao, entidade, entidadeId, detalhe) {
    if (!configurado() || !perfilAtual) {
      return;
    }

    try {
      await window.sb.rpc('registrar_auditoria', {
        p_acao: acao,
        p_entidade: entidade || null,
        p_entidade_id: entidadeId ? String(entidadeId) : null,
        p_detalhe: detalhe || {}
      });
    } catch (erro) {
      console.warn('Não foi possível registrar a auditoria.', erro);
    }
  }

  async function trocarSenha(novaSenha) {
    if (!configurado()) {
      throw new Error('Supabase não configurado.');
    }

    var resposta = await window.sb.auth.updateUser({ password: novaSenha });

    if (resposta.error) {
      throw resposta.error;
    }

    await window.sb.rpc('marcar_senha_trocada');

    if (perfilAtual) {
      perfilAtual.must_change_password = false;
    }
  }

  function caminhoInterno(valor) {
    if (!valor) {
      return null;
    }

    try {
      var url = new URL(valor, window.location.href);

      if (url.origin !== window.location.origin) {
        return null;
      }

      if (/\/login\.html$/i.test(url.pathname)) {
        return null;
      }

      return url.pathname + url.search + url.hash;
    } catch (erro) {
      return null;
    }
  }

  async function proteger(opcoes) {
    var config = opcoes || {};
    var perfis = config.perfis || null;
    var login = config.login || 'login.html';
    var fallback = config.fallback || 'index.html';

    if (!configurado()) {
      return null;
    }

    var perfil = await carregarPerfil();

    if (!perfil || perfil.must_change_password === true) {
      var next = window.location.pathname + window.location.search + window.location.hash;
      window.location.replace(login + '?next=' + encodeURIComponent(next));
      return null;
    }

    if (perfis && perfis.indexOf(perfil.role) === -1) {
      window.location.replace(fallback);
      return null;
    }

    return perfil;
  }

  return {
    configurado: configurado,
    carregarPerfil: carregarPerfil,
    login: login,
    logout: logout,
    usuarioAtual: usuarioAtual,
    temPerfil: temPerfil,
    ehGestor: ehGestor,
    pode: pode,
    registrarAuditoria: registrarAuditoria,
    trocarSenha: trocarSenha,
    caminhoInterno: caminhoInterno,
    proteger: proteger
  };
})();

window.Auth = Auth;
