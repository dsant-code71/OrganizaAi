(function () {
    'use strict';

    var scriptUrl = document.currentScript && document.currentScript.src
        ? document.currentScript.src
        : window.location.href;
    var baseUrl = window.organizaaiBaseUrl || new URL('../../', scriptUrl).href;
    var loginUrl = new URL('login.html', baseUrl).href;
    var usuariosUrl = new URL('usuarios.html', baseUrl).href;
    var indexUrl = new URL('index.html', baseUrl).href;
    var checklistUrl = new URL('ChecklistAi/index.html', baseUrl).href;
    var client = window.organizaaiClient;

    function getPathAtual() {
        return window.location.pathname + window.location.search;
    }

    function redirecionarParaLogin(motivo) {
        var url = new URL(loginUrl);
        var destino = getPathAtual();

        if (destino && !/\/login\.html$/i.test(window.location.pathname)) {
            url.searchParams.set('next', destino);
        }

        if (motivo) {
            url.searchParams.set('motivo', motivo);
        }

        window.location.replace(url.href);
    }

    async function getProfile(userId) {
        var resposta = await client
            .from('profiles')
            .select('id, nome_completo, username, email, role, ativo, must_change_password, last_login_at')
            .eq('id', userId)
            .maybeSingle();

        if (resposta.error) {
            throw resposta.error;
        }

        return resposta.data;
    }

    async function requireAuth() {
        if (!client) {
            throw new Error('Cliente Supabase não inicializado.');
        }

        var sessao = await client.auth.getSession();
        var session = sessao.data ? sessao.data.session : null;

        if (!session) {
            redirecionarParaLogin('sessao');
            return null;
        }

        var profile = null;

        try {
            profile = await getProfile(session.user.id);
        } catch (erro) {
            console.error('Não foi possível carregar o perfil.', erro);
        }

        if (!profile) {
            await client.auth.signOut();
            redirecionarParaLogin('semperfil');
            return null;
        }

        if (profile.ativo !== true) {
            await client.auth.signOut();
            redirecionarParaLogin('inativo');
            return null;
        }

        if (profile.must_change_password) {
            redirecionarParaLogin('senha');
            return null;
        }

        return {
            session: session,
            user: session.user,
            profile: profile
        };
    }

    async function signOut() {
        try {
            await client.auth.signOut();
        } finally {
            window.location.replace(loginUrl);
        }
    }

    function iniciais(nome) {
        var partes = String(nome || '').trim().split(/\s+/).filter(Boolean);

        if (partes.length === 0) {
            return 'OA';
        }

        if (partes.length === 1) {
            return partes[0].slice(0, 2).toUpperCase();
        }

        return (partes[0].charAt(0) + partes[partes.length - 1].charAt(0)).toUpperCase();
    }

    function renderUserMenu(profile) {
        var container = document.getElementById('userMenu');

        if (!container) {
            container = document.createElement('div');
            container.id = 'userMenu';
            container.className = 'user-menu';
            container.setAttribute('aria-label', 'Conta');
            document.body.appendChild(container);
        }

        container.replaceChildren();

        var chip = document.createElement('span');
        chip.className = 'user-chip';

        var avatar = document.createElement('span');
        avatar.className = 'user-avatar';
        avatar.setAttribute('aria-hidden', 'true');
        avatar.textContent = iniciais(profile.nome_completo || profile.username || profile.email);

        var info = document.createElement('span');
        info.className = 'user-info';

        var nome = document.createElement('strong');
        nome.textContent = profile.nome_completo || profile.username || profile.email;

        var papel = document.createElement('small');
        papel.textContent = profile.role === 'gestor' ? 'Gestor' : 'Operador';

        info.appendChild(nome);
        info.appendChild(papel);
        chip.appendChild(avatar);
        chip.appendChild(info);
        container.appendChild(chip);

        if (profile.role === 'gestor') {
            var linkUsuarios = document.createElement('a');
            linkUsuarios.className = 'user-link';
            linkUsuarios.href = usuariosUrl;
            linkUsuarios.textContent = 'Usuários';
            container.appendChild(linkUsuarios);
        }

        var sair = document.createElement('button');
        sair.type = 'button';
        sair.className = 'user-logout';
        sair.textContent = 'Sair';
        sair.addEventListener('click', function () {
            sair.disabled = true;
            sair.textContent = 'Saindo...';
            void signOut();
        });
        container.appendChild(sair);
    }

    async function carregarNomes() {
        var mapa = {};

        try {
            var resposta = await client.rpc('nomes_usuarios');

            if (resposta.error) {
                console.warn('Não foi possível carregar os nomes dos usuários.', resposta.error);
                return mapa;
            }

            (resposta.data || []).forEach(function (perfil) {
                mapa[perfil.id] = perfil;
            });
        } catch (erro) {
            console.warn('Não foi possível carregar os nomes dos usuários.', erro);
        }

        return mapa;
    }

    function nomeUsuario(mapa, id) {
        var perfil = mapa && mapa[id];

        if (!perfil) {
            return '';
        }

        return perfil.nome_completo || perfil.username || '';
    }

    window.OrganizaAuth = {
        client: client,
        baseUrl: baseUrl,
        loginUrl: loginUrl,
        usuariosUrl: usuariosUrl,
        indexUrl: indexUrl,
        checklistUrl: checklistUrl,
        requireAuth: requireAuth,
        getProfile: getProfile,
        signOut: signOut,
        renderUserMenu: renderUserMenu,
        carregarNomes: carregarNomes,
        nomeUsuario: nomeUsuario
    };
})();
