(function () {
  var usuarios = [];
  var busca = '';
  var usuarioEmEdicao = null;
  var usuarioSenha = null;

  function obter(id) {
    return document.getElementById(id);
  }

  function mostrarMensagem(elemento, texto, tipo) {
    elemento.textContent = texto;
    elemento.className = 'admin-message' + (tipo ? ' ' + tipo : '');
  }

  function limparMensagem(elemento) {
    elemento.textContent = '';
    elemento.className = 'admin-message';
  }

  function rotuloPerfil(perfil) {
    return perfil === 'gestor' ? 'Gestor' : 'Operador';
  }

  function formatarData(valor) {
    if (!valor) {
      return '—';
    }

    try {
      return new Date(valor).toLocaleString('pt-BR');
    } catch (erro) {
      return '—';
    }
  }

  function criarCelula(texto) {
    var td = document.createElement('td');
    td.textContent = texto;
    return td;
  }

  function criarBadge(texto, classe) {
    var span = document.createElement('span');
    span.className = 'admin-badge ' + classe;
    span.textContent = texto;
    return span;
  }

  function renderizarUsuarios() {
    var tbody = obter('usersTableBody');
    var termo = busca.trim().toLowerCase();
    var lista = usuarios.filter(function (usuario) {
      if (!termo) {
        return true;
      }

      return [
        usuario.nome_completo,
        usuario.username,
        usuario.email,
        usuario.cpf
      ].some(function (valor) {
        return String(valor || '').toLowerCase().indexOf(termo) !== -1;
      });
    });

    tbody.replaceChildren();
    obter('usersEmpty').hidden = lista.length > 0;

    lista.forEach(function (usuario) {
      var tr = document.createElement('tr');

      var tdUsuario = document.createElement('td');
      var cell = document.createElement('div');
      cell.className = 'admin-user-cell';
      var nome = document.createElement('strong');
      nome.textContent = usuario.nome_completo;
      var detalhe = document.createElement('span');
      detalhe.textContent = usuario.username + ' · ' + usuario.email;
      cell.appendChild(nome);
      cell.appendChild(detalhe);
      tdUsuario.appendChild(cell);

      var tdPerfil = document.createElement('td');
      tdPerfil.appendChild(criarBadge(rotuloPerfil(usuario.role), usuario.role));

      var tdStatus = document.createElement('td');
      tdStatus.appendChild(
        criarBadge(usuario.ativo ? 'Ativo' : 'Inativo', usuario.ativo ? 'ativo' : 'inativo')
      );

      var tdAcoes = document.createElement('td');
      var acoes = document.createElement('div');
      acoes.className = 'admin-row-actions';

      var editar = document.createElement('button');
      editar.type = 'button';
      editar.textContent = 'Editar';
      editar.addEventListener('click', function () {
        abrirEdicao(usuario);
      });

      var senha = document.createElement('button');
      senha.type = 'button';
      senha.textContent = 'Senha';
      senha.addEventListener('click', function () {
        abrirRedefinicao(usuario);
      });

      acoes.appendChild(editar);
      acoes.appendChild(senha);

      var atual = Auth.usuarioAtual();

      if (!atual || atual.id !== usuario.id) {
        var status = document.createElement('button');
        status.type = 'button';
        status.textContent = usuario.ativo ? 'Desativar' : 'Reativar';

        if (usuario.ativo) {
          status.className = 'danger';
        }

        status.addEventListener('click', function () {
          alternarStatus(usuario);
        });

        acoes.appendChild(status);
      }

      tdAcoes.appendChild(acoes);

      tr.appendChild(tdUsuario);
      tr.appendChild(criarCelula(usuario.cpf));
      tr.appendChild(tdPerfil);
      tr.appendChild(tdStatus);
      tr.appendChild(tdAcoes);
      tbody.appendChild(tr);
    });
  }

  async function carregarUsuarios() {
    var resposta = await window.sb
      .from('profiles')
      .select('*')
      .order('nome_completo', { ascending: true });

    if (resposta.error) {
      mostrarMensagem(obter('usersMessage'), 'Não foi possível carregar os usuários.', '');
      return;
    }

    usuarios = resposta.data || [];
    renderizarUsuarios();
  }

  async function carregarAuditoria() {
    var lista = obter('auditList');
    var vazio = obter('auditEmpty');
    var resposta = await window.sb
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    lista.replaceChildren();

    if (resposta.error) {
      vazio.hidden = false;
      vazio.textContent = 'Não foi possível carregar a auditoria.';
      return;
    }

    var registros = resposta.data || [];
    vazio.hidden = registros.length > 0;

    registros.forEach(function (registro) {
      var item = document.createElement('div');
      item.className = 'audit-item';

      var conteudo = document.createElement('div');
      var titulo = document.createElement('strong');
      titulo.textContent = registro.acao + (registro.entidade ? ' · ' + registro.entidade : '');
      var detalhe = document.createElement('span');
      detalhe.textContent = (registro.actor_nome || 'Sistema') + ' (' + rotuloPerfil(registro.actor_role) + ')';
      conteudo.appendChild(titulo);
      conteudo.appendChild(detalhe);

      var data = document.createElement('time');
      data.dateTime = registro.created_at || '';
      data.textContent = formatarData(registro.created_at);

      item.appendChild(conteudo);
      item.appendChild(data);
      lista.appendChild(item);
    });
  }

  async function chamarAdmin(body) {
    var resposta = await window.sb.functions.invoke('admin-users', { body: body });

    if (resposta.error) {
      throw new Error(resposta.error.message || 'Falha ao chamar a função de administração.');
    }

    if (resposta.data && resposta.data.error) {
      throw new Error(resposta.data.error);
    }

    return resposta.data;
  }

  function abrirDialogo(dialogo) {
    if (!dialogo.open) {
      dialogo.showModal();
    }
  }

  function fecharDialogo(dialogo) {
    if (dialogo.open) {
      dialogo.close();
    }
  }

  function abrirNovo() {
    usuarioEmEdicao = null;
    obter('userId').value = '';
    obter('userName').value = '';
    obter('userUsername').value = '';
    obter('userCpf').value = '';
    obter('userEmail').value = '';
    obter('userRole').value = 'operador';
    obter('userActive').checked = true;
    obter('userPassword').value = '';
    obter('userPasswordField').hidden = false;
    obter('userPassword').required = true;
    obter('userDialogTitle').textContent = 'Novo usuário';
    limparMensagem(obter('userFormMessage'));
    abrirDialogo(obter('userDialog'));
    obter('userName').focus();
  }

  function abrirEdicao(usuario) {
    usuarioEmEdicao = usuario;
    obter('userId').value = usuario.id;
    obter('userName').value = usuario.nome_completo;
    obter('userUsername').value = usuario.username;
    obter('userCpf').value = usuario.cpf;
    obter('userEmail').value = usuario.email;
    obter('userRole').value = usuario.role;
    obter('userActive').checked = usuario.ativo === true;
    obter('userPassword').value = '';
    obter('userPasswordField').hidden = true;
    obter('userPassword').required = false;
    obter('userDialogTitle').textContent = 'Editar usuário';
    limparMensagem(obter('userFormMessage'));
    abrirDialogo(obter('userDialog'));
    obter('userName').focus();
  }

  function abrirRedefinicao(usuario) {
    usuarioSenha = usuario;
    obter('passwordTarget').textContent = 'Redefinir a senha de ' + usuario.nome_completo + '.';
    obter('resetPassword').value = '';
    obter('resetPasswordConfirm').value = '';
    limparMensagem(obter('passwordMessage'));
    abrirDialogo(obter('passwordDialog'));
    obter('resetPassword').focus();
  }

  async function alternarStatus(usuario) {
    var acao = usuario.ativo ? 'deactivate' : 'reactivate';
    var pergunta = usuario.ativo
      ? 'Desativar o usuário ' + usuario.nome_completo + '?'
      : 'Reativar o usuário ' + usuario.nome_completo + '?';

    if (!window.confirm(pergunta)) {
      return;
    }

    try {
      await chamarAdmin({ action: acao, id: usuario.id });
      await carregarUsuarios();
      await carregarAuditoria();
      mostrarMensagem(obter('usersMessage'), 'Status atualizado.', 'success');
    } catch (erro) {
      mostrarMensagem(obter('usersMessage'), erro.message, '');
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var pronto = window.AUTH_READY || Promise.resolve(null);

    pronto.then(function (perfil) {
      if (!perfil) {
        return;
      }

      obter('newUserBtn').addEventListener('click', abrirNovo);
      obter('userSearch').addEventListener('input', function (evento) {
        busca = evento.target.value;
        renderizarUsuarios();
      });

      obter('closeUserDialog').addEventListener('click', function () {
        fecharDialogo(obter('userDialog'));
      });
      obter('cancelUserDialog').addEventListener('click', function () {
        fecharDialogo(obter('userDialog'));
      });
      obter('closePasswordDialog').addEventListener('click', function () {
        fecharDialogo(obter('passwordDialog'));
      });
      obter('cancelPasswordDialog').addEventListener('click', function () {
        fecharDialogo(obter('passwordDialog'));
      });

      obter('userForm').addEventListener('submit', async function (evento) {
        evento.preventDefault();

        var botao = obter('saveUserBtn');
        var mensagem = obter('userFormMessage');
        var id = obter('userId').value;
        var dados = {
          nome_completo: obter('userName').value.trim(),
          username: obter('userUsername').value.trim(),
          cpf: obter('userCpf').value.trim(),
          email: obter('userEmail').value.trim(),
          role: obter('userRole').value,
          ativo: obter('userActive').checked
        };

        limparMensagem(mensagem);

        if (!dados.nome_completo || !dados.username || !dados.cpf || !dados.email) {
          mostrarMensagem(mensagem, 'Preencha todos os campos obrigatórios.', '');
          return;
        }

        if (!usuarioEmEdicao) {
          var senha = obter('userPassword').value;

          if (senha.length < 8) {
            mostrarMensagem(mensagem, 'A senha deve ter pelo menos 8 caracteres.', '');
            return;
          }

          dados.password = senha;
        }

        botao.disabled = true;

        try {
          if (usuarioEmEdicao) {
            dados.action = 'update';
            dados.id = id;
            await chamarAdmin(dados);
          } else {
            dados.action = 'create';
            await chamarAdmin(dados);
          }

          fecharDialogo(obter('userDialog'));
          await carregarUsuarios();
          await carregarAuditoria();
          mostrarMensagem(
            obter('usersMessage'),
            usuarioEmEdicao
              ? 'Usuário atualizado.'
              : 'Usuário salvo. No primeiro acesso, será necessário trocar a senha.',
            'success'
          );
        } catch (erro) {
          mostrarMensagem(mensagem, erro.message, '');
        } finally {
          botao.disabled = false;
        }
      });

      obter('passwordForm').addEventListener('submit', async function (evento) {
        evento.preventDefault();

        var botao = obter('savePasswordBtn');
        var mensagem = obter('passwordMessage');
        var senha = obter('resetPassword').value;
        var confirmacao = obter('resetPasswordConfirm').value;

        limparMensagem(mensagem);

        if (!usuarioSenha) {
          return;
        }

        if (senha.length < 8) {
          mostrarMensagem(mensagem, 'A senha deve ter pelo menos 8 caracteres.', '');
          return;
        }

        if (senha !== confirmacao) {
          mostrarMensagem(mensagem, 'As senhas não conferem.', '');
          return;
        }

        botao.disabled = true;

        try {
          await chamarAdmin({
            action: 'reset-password',
            id: usuarioSenha.id,
            password: senha
          });

          fecharDialogo(obter('passwordDialog'));
          await carregarAuditoria();
          mostrarMensagem(
            obter('usersMessage'),
            'Senha redefinida. O usuário deverá trocá-la no próximo acesso.',
            'success'
          );
        } catch (erro) {
          mostrarMensagem(mensagem, erro.message, '');
        } finally {
          botao.disabled = false;
        }
      });

      carregarUsuarios();
      carregarAuditoria();
    });
  });
})();
