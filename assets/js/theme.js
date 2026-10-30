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

    function atualizarBotoes(tema) {
        var escuro = tema === 'dark';

        document.querySelectorAll('[data-theme-toggle]').forEach(function (botao) {
            botao.textContent = escuro ? 'Claro' : 'Escuro';
            botao.setAttribute('aria-label', rotulo(tema));
            botao.setAttribute('title', rotulo(tema));
            botao.setAttribute('aria-pressed', escuro ? 'true' : 'false');
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
        botao.addEventListener('click', alternarTema);
        container.appendChild(botao);
        atualizarBotoes(temaAtual());
        return botao;
    }

    function montarBotao(container) {
        if (!container) {
            return null;
        }

        var existente = container.querySelector('[data-theme-toggle]');

        if (existente) {
            atualizarBotoes(temaAtual());
            return existente;
        }

        return criarBotao(container);
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
