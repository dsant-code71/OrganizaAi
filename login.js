(function () {
  function obter(id) {
    return document.getElementById(id);
  }

  function destino() {
    var params = new URLSearchParams(window.location.search);
    return Auth.caminhoInterno(params.get('next')) || 'index.html';
  }

  function mostrarMensagem(elemento, texto, tipo) {
    elemento.textContent = texto;
    elemento.className = 'auth-message' + (tipo ? ' ' + tipo : '');
  }

  function limparMensagem(elemento) {
    mostrarMensagem(elemento, '', '');
  }

  document.addEventListener('DOMContentLoaded', async function () {
    var loginCard = obter('loginCard');
    var changeCard = obter('changeCard');
    var loginForm = obter('loginForm');
    var changeForm = obter('changeForm');
    var emailInput = obter('loginEmail');
    var passwordInput = obter('loginPassword');
    var showPassword = obter('showPassword');
    var loginSubmit = obter('loginSubmit');
    var changeSubmit = obter('changeSubmit');
    var loginMessage = obter('loginMessage');
    var changeMessage = obter('changeMessage');
    var newPassword = obter('newPassword');
    var confirmPassword = obter('confirmPassword');

    if (!Auth.configurado()) {
      loginSubmit.disabled = true;
      mostrarMensagem(loginMessage, 'Supabase não configurado. Preencha shared/config.js.', '');
      return;
    }

    try {
      var perfil = await Auth.carregarPerfil();

      if (perfil) {
        if (perfil.must_change_password === true) {
          await Auth.logout();
        } else {
          window.location.replace(destino());
          return;
        }
      }
    } catch (erro) {
      console.warn('Não foi possível verificar a sessão.', erro);
    }

    showPassword.addEventListener('change', function () {
      passwordInput.type = showPassword.checked ? 'text' : 'password';
    });

    loginForm.addEventListener('submit', async function (evento) {
      evento.preventDefault();

      var email = emailInput.value.trim();
      var senha = passwordInput.value;

      if (!email || !senha) {
        mostrarMensagem(loginMessage, 'Informe e-mail e senha.', '');
        return;
      }

      loginSubmit.disabled = true;
      limparMensagem(loginMessage);

      try {
        var perfil = await Auth.login(email, senha);

        if (perfil.must_change_password === true) {
          loginCard.hidden = true;
          changeCard.hidden = false;
          newPassword.focus();
          return;
        }

        window.location.replace(destino());
      } catch (erro) {
        mostrarMensagem(
          loginMessage,
          'Não foi possível entrar. Verifique os dados ou contate o gestor.',
          ''
        );
      } finally {
        loginSubmit.disabled = false;
      }
    });

    changeForm.addEventListener('submit', async function (evento) {
      evento.preventDefault();

      var senha = newPassword.value;
      var confirmacao = confirmPassword.value;

      if (senha.length < 8) {
        mostrarMensagem(changeMessage, 'A senha deve ter pelo menos 8 caracteres.', '');
        return;
      }

      if (senha !== confirmacao) {
        mostrarMensagem(changeMessage, 'As senhas não conferem.', '');
        return;
      }

      changeSubmit.disabled = true;
      limparMensagem(changeMessage);

      try {
        await Auth.trocarSenha(senha);
        mostrarMensagem(changeMessage, 'Senha atualizada. Redirecionando...', 'success');
        window.setTimeout(function () {
          window.location.replace(destino());
        }, 600);
      } catch (erro) {
        mostrarMensagem(changeMessage, 'Não foi possível atualizar a senha.', '');
      } finally {
        changeSubmit.disabled = false;
      }
    });
  });
})();
