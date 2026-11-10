(function () {
    'use strict';

    var CHAVE = 'organizaai-tema';
    var midia = window.matchMedia
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;

    function lerPreferencia() {
        try {
            var valor = window.localStorage.getItem(CHAVE);
            return valor === 'dark' || valor === 'light' ? valor : null;
        } catch (erro) {
            return null;
        }
    }

    function salvarPreferencia(tema) {
        try {
            window.localStorage.setItem(CHAVE, tema);
        } catch (erro) {
            console.warn('Não foi possível salvar a preferência de tema.', erro);
        }
    }

    function temaDoSistema() {
        return midia && midia.matches ? 'dark' : 'light';
    }

    function temaAtual() {
        return lerPreferencia() || temaDoSistema();
    }

    function rotulo(tema) {
        return tema === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro';
    }

    function garantirIcone(botao, escuro) {
        var holder = botao.querySelector('.theme-toggle-icon');

        if (!holder) {
            holder = document.createElement('span');
            holder.className = 'theme-toggle-icon';
            botao.prepend(holder);
        }

        var nome = escuro ? 'sun' : 'moon';

        if (holder.getAttribute('data-icon-name') === nome) {
            return;
        }

        holder.setAttribute('data-icon-name', nome);
        holder.replaceChildren();

        if (window.OrganizaIcons) {
            holder.appendChild(window.OrganizaIcons.criar(nome));
        }
    }

    function atualizarBotao(botao, tema) {
        var escuro = tema === 'dark';
        garantirIcone(botao, escuro);

        var label = botao.querySelector('.theme-toggle-label');

        if (!label) {
            label = document.createElement('span');
            label.className = 'theme-toggle-label';
            botao.appendChild(label);
        }

        label.textContent = escuro ? 'Claro' : 'Escuro';
        botao.setAttribute('aria-label', rotulo(tema));
        botao.setAttribute('title', rotulo(tema));
        botao.setAttribute('aria-pressed', escuro ? 'true' : 'false');
    }

    function atualizarBotoes(tema) {
        document.querySelectorAll('[data-theme-toggle]').forEach(function (botao) {
            atualizarBotao(botao, tema);
        });
    }

    function aplicarTema(tema, persistir) {
        var raiz = document.documentElement;

        raiz.setAttribute('data-theme', tema);
        raiz.style.colorScheme = tema;

        if (persistir) {
            salvarPreferencia(tema);
        }

        atualizarBotoes(tema);
    }

    function alternarTema() {
        aplicarTema(temaAtual() === 'dark' ? 'light' : 'dark', true);
    }

    function criarBotao(container, classeExtra) {
        var botao = document.createElement('button');
        botao.type = 'button';
        botao.className = 'theme-toggle' + (classeExtra ? ' ' + classeExtra : '');
        botao.setAttribute('data-theme-toggle', '');

        var tema = temaAtual();
        var holder = document.createElement('span');
        holder.className = 'theme-toggle-icon';
        botao.appendChild(holder);

        var label = document.createElement('span');
        label.className = 'theme-toggle-label';
        botao.appendChild(label);

        botao.setAttribute('aria-label', rotulo(tema));
        botao.setAttribute('title', rotulo(tema));
        botao.setAttribute('aria-pressed', tema === 'dark' ? 'true' : 'false');

        botao.addEventListener('click', alternarTema);
        container.appendChild(botao);
        atualizarBotao(botao, temaAtual());
        return botao;
    }

    function montarBotao(container, classeExtra) {
        if (!container) {
            return null;
        }

        var existente = container.querySelector('[data-theme-toggle]');

        if (existente) {
            if (classeExtra) {
                existente.classList.add(classeExtra);
            }

            atualizarBotao(existente, temaAtual());
            return existente;
        }

        return criarBotao(container, classeExtra);
    }

    function montarBotaoFlutuante() {
        if (document.querySelector('[data-theme-toggle]')) {
            return;
        }

        var botao = criarBotao(document.body, 'theme-toggle-floating');
        botao.id = 'themeToggle';
    }

    aplicarTema(temaAtual(), false);

    if (midia) {
        var aoMudarSistema = function () {
            if (!lerPreferencia()) {
                aplicarTema(temaDoSistema(), false);
            }
        };

        if (typeof midia.addEventListener === 'function') {
            midia.addEventListener('change', aoMudarSistema);
        } else if (typeof midia.addListener === 'function') {
            midia.addListener(aoMudarSistema);
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        if (document.body.classList.contains('auth-body')) {
            montarBotaoFlutuante();
        }

        atualizarBotoes(temaAtual());
    });

    window.OrganizaTema = {
        aplicar: function (tema) {
            aplicarTema(tema === 'dark' ? 'dark' : 'light', true);
        },
        alternar: alternarTema,
        atual: temaAtual,
        montarBotao: montarBotao,
        montarBotaoFlutuante: montarBotaoFlutuante
    };
})();
