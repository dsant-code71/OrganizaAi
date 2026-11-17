(function () {
    'use strict';

    var ATRIBUTO = 'data-icon';
    var agendado = false;
    var observador = null;

    function pascalCase(valor) {
        return valor.replace(/(\w)(\w*)(_|-|\s*)/g, function (_, primeira, resto) {
            return primeira.toUpperCase() + resto.toLowerCase();
        });
    }

    function criar(nome, classe) {
        var placeholder = document.createElement('i');
        placeholder.setAttribute(ATRIBUTO, nome);
        placeholder.setAttribute('aria-hidden', 'true');

        if (classe) {
            placeholder.className = classe;
        }

        return placeholder;
    }

    function substituir(placeholder) {
        var nome = placeholder.getAttribute(ATRIBUTO);

        if (!nome || !window.lucide || !window.lucide.icons || !window.lucide.createElement) {
            return;
        }

        var definicao = window.lucide.icons[pascalCase(nome)];

        if (!definicao) {
            console.warn('Ícone não encontrado: ' + nome);
            return;
        }

        var atributos = {};

        for (var i = 0; i < placeholder.attributes.length; i += 1) {
            var atributo = placeholder.attributes[i];

            if (atributo.name !== ATRIBUTO && atributo.name !== 'class') {
                atributos[atributo.name] = atributo.value;
            }
        }

        var classes = ['lucide', 'lucide-' + nome];

        if (placeholder.className) {
            classes.push(placeholder.className);
        }

        atributos.class = classes.join(' ');
        atributos['data-lucide'] = nome;
        atributos.focusable = 'false';

        var svg = window.lucide.createElement([
            definicao[0],
            Object.assign({}, definicao[1], atributos),
            definicao[2]
        ]);

        placeholder.replaceWith(svg);
    }

    function renderizar() {
        document.querySelectorAll('[' + ATRIBUTO + ']').forEach(substituir);
    }

    function agendar() {
        if (agendado) {
            return;
        }

        agendado = true;
        window.requestAnimationFrame(function () {
            agendado = false;
            renderizar();
        });
    }

    function contemPlaceholder(no) {
        if (no.nodeType !== 1) {
            return false;
        }

        if (no.matches('[' + ATRIBUTO + ']')) {
            return true;
        }

        return !!no.querySelector('[' + ATRIBUTO + ']');
    }

    function observar() {
        if (!observador) {
            observador = new MutationObserver(function (mutacoes) {
                for (var i = 0; i < mutacoes.length; i += 1) {
                    var adicionados = mutacoes[i].addedNodes;

                    for (var j = 0; j < adicionados.length; j += 1) {
                        if (contemPlaceholder(adicionados[j])) {
                            agendar();
                            return;
                        }
                    }
                }
            });
        }

        observador.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    window.OrganizaIcons = {
        criar: criar,
        render: renderizar,
        agendar: agendar,
        atributo: ATRIBUTO
    };

    function iniciar() {
        renderizar();
        observar();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar, { once: true });
    } else {
        iniciar();
    }
})();
