(function () {
    'use strict';

    var scriptUrl = document.currentScript && document.currentScript.src
        ? document.currentScript.src
        : window.location.href;
    var baseUrl = window.organizaaiBaseUrl || new URL('../../', scriptUrl).href;
    var loginUrl = new URL('login.html', baseUrl).href;
    var indexUrl = new URL('index.html', baseUrl).href;
    var iaUrl = new URL('ia/index.html', baseUrl).href;
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
            .select('id, nome_completo, username, email, ativo, last_login_at')
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

    async function signInWithGoogle(redirectTo) {
        if (!client) {
            throw new Error('Cliente Supabase não inicializado.');
        }

        return client.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: redirectTo || loginUrl
            }
        });
    }

    function criarIcone(nome) {
        return window.OrganizaIcons ? window.OrganizaIcons.criar(nome) : null;
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

    function paginaAtualSidebar() {
        var caminho = window.location.pathname.replace(/\\/g, '/').toLowerCase();

        if (/\/ia\/index\.html$/.test(caminho)) {
            return 'ia';
        }

        if (caminho === '/' || /\/index\.html$/.test(caminho)) {
            return 'organiza';
        }

        return '';
    }

    function criarItemSidebar(opcoes) {
        var link = document.createElement('a');
        link.className = opcoes.classe;
        link.href = opcoes.href;

        if (opcoes.ativo) {
            link.classList.add('is-active');
            link.setAttribute('aria-current', 'page');
        }

        if (opcoes.titulo) {
            link.title = opcoes.titulo;
        }

        var marca = document.createElement('span');
        marca.className = 'sidebar-system-mark';
        marca.setAttribute('aria-hidden', 'true');
        marca.textContent = opcoes.marca;
        link.appendChild(marca);

        var texto = document.createElement('span');
        texto.className = 'sidebar-system-text';

        var titulo = document.createElement('strong');
        titulo.textContent = opcoes.texto;

        var descricao = document.createElement('small');
        descricao.textContent = opcoes.descricao;

        texto.appendChild(titulo);
        texto.appendChild(descricao);
        link.appendChild(texto);

        return link;
    }

    function renderSidebar() {
        var pagina = paginaAtualSidebar();
        var sidebar = document.getElementById('sidebar');

        if (!sidebar) {
            sidebar = document.createElement('aside');
            sidebar.id = 'sidebar';
            sidebar.className = 'sidebar';
            sidebar.setAttribute('aria-label', 'Navegação principal');
            document.body.appendChild(sidebar);
        }

        sidebar.replaceChildren();
        document.body.classList.add('has-sidebar');

        var topo = document.createElement('div');
        topo.className = 'sidebar-top';

        var rotuloSistemas = document.createElement('span');
        rotuloSistemas.className = 'sidebar-section-label';
        rotuloSistemas.textContent = 'Sistemas';
        topo.appendChild(rotuloSistemas);

        var sistemas = document.createElement('nav');
        sistemas.className = 'sidebar-systems';
        sistemas.setAttribute('aria-label', 'Sistemas');

        sistemas.appendChild(criarItemSidebar({
            classe: 'sidebar-system',
            href: indexUrl,
            texto: 'OrganizaAi',
            descricao: 'Lista de tarefas',
            marca: 'OA',
            ativo: pagina === 'organiza'
        }));

        sistemas.appendChild(criarItemSidebar({
            classe: 'sidebar-system',
            href: iaUrl,
            texto: 'EstudAI',
            descricao: 'Assistente de estudos',
            marca: 'EA',
            ativo: pagina === 'ia'
        }));

        topo.appendChild(sistemas);
        sidebar.appendChild(topo);

        var rodape = document.createElement('div');
        rodape.className = 'sidebar-footer';

        if (window.OrganizaTema) {
            var ferramentas = document.createElement('div');
            ferramentas.className = 'sidebar-tools';

            var rotuloPreferencias = document.createElement('span');
            rotuloPreferencias.className = 'sidebar-section-label';
            rotuloPreferencias.textContent = 'Preferências';
            ferramentas.appendChild(rotuloPreferencias);

            var tema = document.createElement('div');
            tema.className = 'sidebar-theme';
            ferramentas.appendChild(tema);

            window.OrganizaTema.montarBotao(tema, 'sidebar-theme-toggle');

            rodape.appendChild(ferramentas);
        }

        if (rodape.childNodes.length > 0) {
            sidebar.appendChild(rodape);
        }
    }

    function renderUserMenu(profile, opcoes) {
        renderSidebar();

        var visitante = !!(opcoes && opcoes.visitante);
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

        var email = document.createElement('small');
        email.textContent = profile.email || '';

        info.appendChild(nome);
        info.appendChild(email);
        chip.appendChild(avatar);
        chip.appendChild(info);
        container.appendChild(chip);

        if (!visitante) {
            var sair = document.createElement('button');
            sair.type = 'button';
            sair.className = 'user-logout';

            var iconeSair = criarIcone('log-out');
            if (iconeSair) {
                sair.appendChild(iconeSair);
            }

            var rotuloSair = document.createElement('span');
            rotuloSair.textContent = 'Sair';
            sair.appendChild(rotuloSair);

            sair.addEventListener('click', function () {
                sair.disabled = true;
                rotuloSair.textContent = 'Saindo...';
                void signOut();
            });
            container.appendChild(sair);
        }
    }

    window.OrganizaAuth = {
        client: client,
        baseUrl: baseUrl,
        loginUrl: loginUrl,
        indexUrl: indexUrl,
        iaUrl: iaUrl,
        requireAuth: requireAuth,
        getProfile: getProfile,
        signOut: signOut,
        signInWithGoogle: signInWithGoogle,
        renderSidebar: renderSidebar,
        renderUserMenu: renderUserMenu
    };
})();
