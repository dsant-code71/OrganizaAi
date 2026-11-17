(function () {
    'use strict';

    var auth = window.OrganizaAuth;
    var client = auth ? auth.client : null;
    var parametros = new URLSearchParams(window.location.search);

    var avisoLogin = document.getElementById('avisoLogin');
    var mensagemLogin = document.getElementById('mensagemLogin');
    var googleBtn = document.getElementById('googleBtn');
    var googleBtnLabel = document.getElementById('googleBtnLabel');

    function mostrarMensagem(texto, tipo) {
        mensagemLogin.textContent = texto || '';
        mensagemLogin.className = 'form-message' + (tipo ? ' ' + tipo : '');
    }

    function mostrarAviso(texto, tipo) {
        avisoLogin.textContent = texto || '';
        avisoLogin.className = 'notice' + (tipo ? ' ' + tipo : '');
        avisoLogin.hidden = !texto;
    }

    function carregando(ativo) {
        googleBtn.disabled = ativo;

        if (googleBtnLabel) {
            googleBtnLabel.textContent = ativo ? 'Redirecionando...' : 'Entrar com Google';
        }
    }

    function traduzirErro(erro) {
        var mensagem = (erro && erro.message ? erro.message : '').toLowerCase();

        if (mensagem.indexOf('provider is not enabled') !== -1) {
            return 'O login com Google não está habilitado no Supabase.';
        }

        if (mensagem.indexOf('redirect_uri_mismatch') !== -1) {
            return 'A URL de retorno do Google não está configurada corretamente.';
        }

        if (mensagem.indexOf('access_denied') !== -1) {
            return 'Login cancelado.';
        }

        if (mensagem.indexOf('rate limit') !== -1 || mensagem.indexOf('too many requests') !== -1) {
            return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
        }

        if (mensagem.indexOf('failed to fetch') !== -1 || mensagem.indexOf('network') !== -1) {
            return 'Falha de conexão. Verifique sua internet e tente novamente.';
        }

        return (erro && erro.message) || 'Não foi possível concluir o login.';
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

    async function carregarPerfil(userId) {
        try {
            return await auth.getProfile(userId);
        } catch (erro) {
            console.error('Não foi possível carregar o perfil.', erro);
            return null;
        }
    }

    async function concluirLogin(profile) {
        if (!profile) {
            await client.auth.signOut();
            mostrarAviso('Seu usuário não possui perfil cadastrado. Tente entrar novamente.', 'error');
            return;
        }

        if (profile.ativo !== true) {
            await client.auth.signOut();
            mostrarAviso('Seu usuário está desativado.', 'error');
            return;
        }

        await registrarAcesso();
        irParaApp();
    }

    function aplicarMotivo(motivo) {
        if (motivo === 'sessao') {
            mostrarAviso('Sua sessão expirou. Entre novamente.', '');
        } else if (motivo === 'inativo') {
            mostrarAviso('Seu usuário está desativado.', 'error');
        } else if (motivo === 'semperfil') {
            mostrarAviso('Perfil não encontrado. Tente entrar novamente.', 'error');
        }
    }

    function erroOAuth() {
        var hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        var busca = new URLSearchParams(window.location.search);
        var descricao = hash.get('error_description')
            || hash.get('error')
            || busca.get('error_description')
            || busca.get('error');

        if (!descricao) {
            return '';
        }

        try {
            return decodeURIComponent(descricao.replace(/\+/g, ' '));
        } catch (erro) {
            return descricao;
        }
    }

    async function iniciar() {
        if (!client || !auth) {
            mostrarMensagem('Não foi possível conectar ao serviço. Recarregue a página.', 'error');
            googleBtn.disabled = true;
            return;
        }

        var erro = erroOAuth();

        if (erro) {
            mostrarMensagem('Não foi possível entrar: ' + erro, 'error');
        }

        aplicarMotivo(parametros.get('motivo'));

        var sessao = await client.auth.getSession();
        var session = sessao.data ? sessao.data.session : null;

        if (!session) {
            googleBtn.focus();
            return;
        }

        var profile = await carregarPerfil(session.user.id);
        await concluirLogin(profile);
    }

    googleBtn.addEventListener('click', async function () {
        if (!auth) {
            return;
        }

        mostrarMensagem('', '');
        mostrarAviso('', '');
        carregando(true);

        try {
            var url = new URL(auth.loginUrl);
            var next = parametros.get('next');

            if (next) {
                url.searchParams.set('next', next);
            }

            var resposta = await auth.signInWithGoogle(url.href);

            if (resposta && resposta.error) {
                mostrarMensagem(traduzirErro(resposta.error), 'error');
                carregando(false);
            }
        } catch (erro) {
            mostrarMensagem(traduzirErro(erro), 'error');
            carregando(false);
        }
    });

    void iniciar();
})();
