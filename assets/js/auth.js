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

    function paginaAtualSidebar() {
        var caminho = window.location.pathname.replace(/\\/g, '/').toLowerCase();

        if (/\/checklistai\/index\.html$/.test(caminho)) {
            return 'checklist';
        }

        if (/\/usuarios\.html$/.test(caminho)) {
            return 'usuarios';
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

        if (opcoes.icone) {
            link.setAttribute('aria-label', opcoes.texto);

            var icone = document.createElement('i');
            icone.setAttribute('data-lucide', opcoes.icone);
            icone.setAttribute('aria-hidden', 'true');
            link.appendChild(icone);
        } else {
            var marca = document.createElement('span');
            marca.className = 'sidebar-system-mark';
            marca.setAttribute('aria-hidden', 'true');
            marca.textContent = opcoes.marca;
            link.appendChild(marca);
        }

        var texto = document.createElement('span');

        if (opcoes.icone) {
            texto.className = 'sidebar-action-text';
            texto.textContent = opcoes.texto;
            link.appendChild(texto);
            return link;
        }

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

    function renderSidebar(profile) {
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
            href: checklistUrl,
            texto: 'ChecklistAi',
            descricao: 'Checklist de máquinas',
            marca: 'CA',
            ativo: pagina === 'checklist'
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

            var botaoTema = window.OrganizaTema.montarBotao(tema, 'sidebar-theme-toggle');

            if (botaoTema && window.lucide && !botaoTema.querySelector('svg, [data-lucide]')) {
                var iconeTema = document.createElement('i');
                iconeTema.setAttribute('data-lucide', 'sun-moon');
                iconeTema.setAttribute('aria-hidden', 'true');
                botaoTema.insertBefore(iconeTema, botaoTema.firstChild);
            }

            rodape.appendChild(ferramentas);
        }

        if (profile.role === 'gestor') {
            var rotuloGestao = document.createElement('span');
            rotuloGestao.className = 'sidebar-section-label';
            rotuloGestao.textContent = 'Gestão';
            rodape.appendChild(rotuloGestao);

            var gestao = document.createElement('nav');
            gestao.className = 'sidebar-management';
            gestao.setAttribute('aria-label', 'Gestão');

            gestao.appendChild(criarItemSidebar({
                classe: 'sidebar-action',
                href: usuariosUrl,
                texto: 'Usuários',
                titulo: 'Gestão de usuários',
                icone: 'users',
                ativo: pagina === 'usuarios'
            }));

            rodape.appendChild(gestao);
        }

        if (rodape.childNodes.length > 0) {
            sidebar.appendChild(rodape);
        }

        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }

    function renderUserMenu(profile) {
        renderSidebar(profile);

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
        renderSidebar: renderSidebar,
        renderUserMenu: renderUserMenu,
        carregarNomes: carregarNomes,
        nomeUsuario: nomeUsuario
    };
})();
