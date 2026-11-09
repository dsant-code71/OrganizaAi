(function () {
    'use strict';

    var auth = window.OrganizaAuth;
    var client = auth ? auth.client : null;
    var parametros = new URLSearchParams(window.location.search);

    var secaoLogin = document.getElementById('secaoLogin');
    var secaoTroca = document.getElementById('secaoTroca');
    var formLogin = document.getElementById('formLogin');
    var formTroca = document.getElementById('formTroca');
    var avisoLogin = document.getElementById('avisoLogin');
    var avisoTroca = document.getElementById('avisoTroca');
    var mensagemLogin = document.getElementById('mensagemLogin');
    var mensagemTroca = document.getElementById('mensagemTroca');
    var btnEntrar = document.getElementById('btnEntrar');
    var btnTrocar = document.getElementById('btnTrocar');
    var campoEmail = document.getElementById('loginEmail');
    var campoSenha = document.getElementById('loginSenha');
    var campoNovaSenha = document.getElementById('novaSenha');
    var campoConfirmar = document.getElementById('confirmarSenha');

    function mostrarMensagem(elemento, texto, tipo) {
        elemento.textContent = texto || '';
        elemento.className = 'form-message' + (tipo ? ' ' + tipo : '');
    }

    function limparMensagem(elemento) {
        mostrarMensagem(elemento, '', '');
    }

    function mostrarAviso(elemento, texto, tipo) {
        elemento.textContent = texto || '';
        elemento.className = 'notice' + (tipo ? ' ' + tipo : '');
        elemento.hidden = !texto;
    }

    function carregando(botao, ativo, textoAtivo, textoNormal) {
        botao.disabled = ativo;
        botao.textContent = ativo ? textoAtivo : textoNormal;
    }

    function traduzirErro(erro) {
        var mensagem = (erro && erro.message ? erro.message : '').toLowerCase();

        if (mensagem.indexOf('invalid login credentials') !== -1) {
            return 'Email ou senha inválidos.';
        }

        if (mensagem.indexOf('email not confirmed') !== -1) {
            return 'Este email ainda não foi confirmado. Fale com um gestor.';
        }

        if (mensagem.indexOf('user is banned') !== -1 || mensagem.indexOf('banned') !== -1) {
            return 'Este usuário está desativado. Fale com um gestor.';
        }

        if (mensagem.indexOf('password should be at least') !== -1) {
            return 'A senha deve ter pelo menos 8 caracteres.';
        }

        if (mensagem.indexOf('same password') !== -1) {
            return 'A nova senha precisa ser diferente da senha atual.';
        }

        if (mensagem.indexOf('rate limit') !== -1 || mensagem.indexOf('too many requests') !== -1) {
            return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
        }

        if (mensagem.indexOf('failed to fetch') !== -1 || mensagem.indexOf('network') !== -1) {
            return 'Falha de conexão. Verifique sua internet e tente novamente.';
        }

        return (erro && erro.message) || 'Não foi possível concluir a operação.';
    }

    function destinoSeguro() {
        var destino = parametros.get('next');
        var raiz = new URL('.', auth.loginUrl).pathname;
        var padrao = new URL('index.html', auth.loginUrl).href;

        if (!destino) {
            return padrao;
        }

        try {
            var url = new URL(destino, window.location.origin + raiz);

            if (url.origin !== window.location.origin) {
                return padrao;
            }

            if (url.pathname.indexOf(raiz) !== 0) {
                return padrao;
            }

            if (/\/login\.html$/i.test(url.pathname)) {
                return padrao;
            }

            return url.href;
        } catch (erro) {
            return padrao;
        }
    }

    function irParaApp() {
        window.location.replace(destinoSeguro());
    }

    async function registrarAcesso() {
        try {
            await client.rpc('registrar_acesso');
        } catch (erro) {
            console.warn('Não foi possível registrar o acesso.', erro);
        }
    }

    function exibirTrocaDeSenha(primeiroAcesso) {
        secaoLogin.hidden = true;
        secaoTroca.hidden = false;
        limparMensagem(mensagemTroca);

        if (primeiroAcesso) {
            document.getElementById('trocaSubtitulo').textContent =
                'Este é seu primeiro acesso ou sua senha foi redefinida. Defina uma nova senha para continuar.';
        }

        campoNovaSenha.focus();
    }

    async function concluirLogin(profile) {
        if (!profile) {
            await client.auth.signOut();
            mostrarAviso(avisoLogin, 'Seu usuário não possui perfil cadastrado. Fale com um gestor.', 'error');
            return;
        }

        if (profile.ativo !== true) {
            await client.auth.signOut();
            mostrarAviso(avisoLogin, 'Seu usuário está desativado. Fale com um gestor.', 'error');
            return;
        }

        if (profile.must_change_password) {
            exibirTrocaDeSenha(true);
            return;
        }

        await registrarAcesso();
        irParaApp();
    }

    async function carregarPerfil(userId) {
        try {
            return await auth.getProfile(userId);
        } catch (erro) {
            console.error('Não foi possível carregar o perfil.', erro);
            return null;
        }
    }

    formLogin.addEventListener('submit', async function (evento) {
        evento.preventDefault();
        limparMensagem(mensagemLogin);
        mostrarAviso(avisoLogin, '', '');

        var email = campoEmail.value.trim();
        var senha = campoSenha.value;

        if (!email || !senha) {
            mostrarMensagem(mensagemLogin, 'Informe email e senha.', 'error');
            return;
        }

        carregando(btnEntrar, true, 'Entrando...', 'Entrar');

        try {
            var resposta = await client.auth.signInWithPassword({
                email: email,
                password: senha
            });

            if (resposta.error) {
                mostrarMensagem(mensagemLogin, traduzirErro(resposta.error), 'error');
                return;
            }

            var profile = await carregarPerfil(resposta.data.user.id);
            await concluirLogin(profile);
        } catch (erro) {
            mostrarMensagem(mensagemLogin, traduzirErro(erro), 'error');
        } finally {
            carregando(btnEntrar, false, 'Entrando...', 'Entrar');
        }
    });

    formTroca.addEventListener('submit', async function (evento) {
        evento.preventDefault();
        limparMensagem(mensagemTroca);
        mostrarAviso(avisoTroca, '', '');

        var novaSenha = campoNovaSenha.value;
        var confirmacao = campoConfirmar.value;

        if (novaSenha.length < 8) {
            mostrarMensagem(mensagemTroca, 'A senha deve ter pelo menos 8 caracteres.', 'error');
            campoNovaSenha.focus();
            return;
        }

        if (novaSenha !== confirmacao) {
            mostrarMensagem(mensagemTroca, 'As senhas não coincidem.', 'error');
            campoConfirmar.focus();
            return;
        }

        carregando(btnTrocar, true, 'Salvando...', 'Salvar nova senha');

        try {
            var atualizacao = await client.auth.updateUser({ password: novaSenha });

            if (atualizacao.error) {
                mostrarMensagem(mensagemTroca, traduzirErro(atualizacao.error), 'error');
                return;
            }

            var marcacao = await client.rpc('marcar_senha_trocada');

            if (marcacao.error) {
                console.error('Não foi possível marcar a troca de senha.', marcacao.error);
                mostrarAviso(
                    avisoTroca,
                    'Senha alterada, mas não foi possível concluir o primeiro acesso. Recarregue a página e tente novamente.',
                    'error'
                );
                return;
            }

            await registrarAcesso();
            irParaApp();
        } catch (erro) {
            mostrarMensagem(mensagemTroca, traduzirErro(erro), 'error');
        } finally {
            carregando(btnTrocar, false, 'Salvando...', 'Salvar nova senha');
        }
    });

    function aplicarMotivo(motivo) {
        if (motivo === 'sessao') {
            mostrarAviso(avisoLogin, 'Sua sessão expirou. Entre novamente.', '');
        } else if (motivo === 'inativo') {
            mostrarAviso(avisoLogin, 'Seu usuário está desativado. Fale com um gestor.', 'error');
        } else if (motivo === 'semperfil') {
            mostrarAviso(avisoLogin, 'Perfil não encontrado. Fale com um gestor.', 'error');
        } else if (motivo === 'senha') {
            mostrarAviso(
                avisoLogin,
                'Sua senha foi redefinida ou é seu primeiro acesso. Entre com a senha temporária para criar uma nova.',
                ''
            );
        }
    }

    async function iniciar() {
        if (!client) {
            mostrarMensagem(mensagemLogin, 'Não foi possível conectar ao serviço. Recarregue a página.', 'error');
            btnEntrar.disabled = true;
            return;
        }

        var motivo = parametros.get('motivo');
        aplicarMotivo(motivo);

        var sessao = await client.auth.getSession();
        var session = sessao.data ? sessao.data.session : null;

        if (!session) {
            campoEmail.focus();
            return;
        }

        var profile = await carregarPerfil(session.user.id);

        if (!profile) {
            await client.auth.signOut();
            mostrarAviso(avisoLogin, 'Seu usuário não possui perfil cadastrado. Fale com um gestor.', 'error');
            return;
        }

        if (profile.ativo !== true) {
            await client.auth.signOut();
            mostrarAviso(avisoLogin, 'Seu usuário está desativado. Fale com um gestor.', 'error');
            return;
        }

        if (profile.must_change_password) {
            exibirTrocaDeSenha(true);
            return;
        }

        irParaApp();
    }

    void iniciar();
})();
