(function () {
    'use strict';

    var CHAVE = 'organizaai-tema';
    var CHAVE_COR = 'organizaai-cor-destaque';
    var COR_PADRAO = '#0284c7';
    var COR_PADRAO_ESCURA = '#38bdf8';
    var VARIAVEIS_COR = [
        '--accent',
        '--accent-strong',
        '--accent-contrast',
        '--accent-soft',
        '--gradient',
        '--gradient-strong',
        '--gradient-text',
        '--bg-glow-1',
        '--bg-glow-2',
        '--shadow-accent',
        '--focus-ring'
    ];
    var PRESETS_COR = [
        { nome: 'Azul (padrão)', cor: '#0284c7' },
        { nome: 'Índigo', cor: '#4f46e5' },
        { nome: 'Roxo', cor: '#7c3aed' },
        { nome: 'Rosa', cor: '#db2777' },
        { nome: 'Vermelho', cor: '#dc2626' },
        { nome: 'Laranja', cor: '#ea580c' },
        { nome: 'Verde', cor: '#16a34a' },
        { nome: 'Turquesa', cor: '#0d9488' }
    ];
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

    function normalizarHex(valor) {
        if (typeof valor !== 'string') {
            return null;
        }

        var cor = valor.trim().toLowerCase();

        if (/^#[0-9a-f]{3}$/.test(cor)) {
            cor = '#' + cor[1] + cor[1] + cor[2] + cor[2] + cor[3] + cor[3];
        }

        return /^#[0-9a-f]{6}$/.test(cor) ? cor : null;
    }

    function hexParaRgb(hex) {
        var cor = normalizarHex(hex) || COR_PADRAO;

        return {
            r: parseInt(cor.slice(1, 3), 16),
            g: parseInt(cor.slice(3, 5), 16),
            b: parseInt(cor.slice(5, 7), 16)
        };
    }

    function rgbParaHex(r, g, b) {
        function canal(valor) {
            return Math.max(0, Math.min(255, Math.round(valor)))
                .toString(16)
                .padStart(2, '0');
        }

        return '#' + canal(r) + canal(g) + canal(b);
    }

    function rgbParaHsl(rgb) {
        var r = rgb.r / 255;
        var g = rgb.g / 255;
        var b = rgb.b / 255;
        var maior = Math.max(r, g, b);
        var menor = Math.min(r, g, b);
        var delta = maior - menor;
        var h = 0;
        var s = 0;
        var l = (maior + menor) / 2;

        if (delta !== 0) {
            s = l > 0.5 ? delta / (2 - maior - menor) : delta / (maior + menor);

            if (maior === r) {
                h = (g - b) / delta + (g < b ? 6 : 0);
            } else if (maior === g) {
                h = (b - r) / delta + 2;
            } else {
                h = (r - g) / delta + 4;
            }

            h *= 60;
        }

        return { h: h, s: s * 100, l: l * 100 };
    }

    function hslParaHex(h, s, l) {
        var matiz = ((h % 360) + 360) % 360;
        var saturacao = Math.max(0, Math.min(100, s)) / 100;
        var luz = Math.max(0, Math.min(100, l)) / 100;
        var c = (1 - Math.abs(2 * luz - 1)) * saturacao;
        var x = c * (1 - Math.abs(((matiz / 60) % 2) - 1));
        var m = luz - c / 2;
        var r = 0;
        var g = 0;
        var b = 0;

        if (matiz < 60) {
            r = c;
            g = x;
        } else if (matiz < 120) {
            r = x;
            g = c;
        } else if (matiz < 180) {
            g = c;
            b = x;
        } else if (matiz < 240) {
            g = x;
            b = c;
        } else if (matiz < 300) {
            r = x;
            b = c;
        } else {
            r = c;
            b = x;
        }

        return rgbParaHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
    }

    function saturar(hex, delta) {
        var hsl = rgbParaHsl(hexParaRgb(hex));
        return hslParaHex(hsl.h, hsl.s + delta, hsl.l);
    }

    function comAlfa(hex, alfa) {
        var rgb = hexParaRgb(hex);
        return 'rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', ' + alfa + ')';
    }

    function canalLinear(valor) {
        var c = valor / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }

    function luminancia(hex) {
        var rgb = hexParaRgb(hex);
        return 0.2126 * canalLinear(rgb.r)
            + 0.7152 * canalLinear(rgb.g)
            + 0.0722 * canalLinear(rgb.b);
    }

    function razaoContraste(l1, l2) {
        var claro = Math.max(l1, l2);
        var escuro = Math.min(l1, l2);
        return (claro + 0.05) / (escuro + 0.05);
    }

    function corContraste(hex) {
        var luz = luminancia(hex);
        var contrasteBranco = razaoContraste(luz, 1);
        var contrasteEscuro = razaoContraste(luz, luminancia('#04121f'));

        return contrasteEscuro >= contrasteBranco ? '#04121f' : '#ffffff';
    }

    function lerCorPreferida() {
        try {
            return normalizarHex(window.localStorage.getItem(CHAVE_COR));
        } catch (erro) {
            return null;
        }
    }

    function salvarCor(cor) {
        try {
            if (cor) {
                window.localStorage.setItem(CHAVE_COR, cor);
            } else {
                window.localStorage.removeItem(CHAVE_COR);
            }
        } catch (erro) {
            console.warn('Não foi possível salvar a cor dos detalhes.', erro);
        }
    }

    function corPadraoTema(tema) {
        return tema === 'dark' ? COR_PADRAO_ESCURA : COR_PADRAO;
    }

    function gerarVariaveisCor(cor, tema) {
        var escuro = tema === 'dark';
        var hsl = rgbParaHsl(hexParaRgb(cor));
        var base = normalizarHex(cor);

        if (!escuro && hsl.l > 60) {
            base = hslParaHex(hsl.h, hsl.s, 55);
        } else if (escuro && hsl.l < 52) {
            base = hslParaHex(hsl.h, Math.min(100, hsl.s + 6), 62);
        }

        var hslBase = rgbParaHsl(hexParaRgb(base));
        var forte = hslParaHex(hslBase.h, hslBase.s, Math.max(18, hslBase.l - (escuro ? 10 : 14)));
        var claro = hslParaHex(hslBase.h, hslBase.s, Math.min(76, hslBase.l + 18));
        var inicio = hslParaHex(hslBase.h, hslBase.s, Math.max(16, hslBase.l - (escuro ? 30 : 28)));
        var meio = hslParaHex(hslBase.h, hslBase.s, Math.max(22, hslBase.l - 14));
        var textoInicio = hslParaHex(hslBase.h, hslBase.s, Math.max(20, hslBase.l - 18));

        return {
            '--accent': base,
            '--accent-strong': forte,
            '--accent-contrast': corContraste(forte),
            '--accent-soft': comAlfa(base, escuro ? 0.12 : 0.1),
            '--gradient': 'linear-gradient(45deg, ' + inicio + ' 0%, ' + meio + ' 30%, '
                + base + ' 60%, ' + claro + ' 100%)',
            '--gradient-strong': 'linear-gradient(45deg, ' + inicio + ' 0%, ' + meio + ' 55%, '
                + claro + ' 100%)',
            '--gradient-text': 'linear-gradient(45deg, ' + textoInicio + ' 0%, '
                + base + ' 50%, ' + claro + ' 100%)',
            '--bg-glow-1': comAlfa(base, escuro ? 0.12 : 0.14),
            '--bg-glow-2': comAlfa(saturar(forte, 8), escuro ? 0.12 : 0.1),
            '--shadow-accent': '0 6px 18px ' + comAlfa(forte, escuro ? 0.25 : 0.28),
            '--focus-ring': '0 0 0 3px ' + comAlfa(base, escuro ? 0.28 : 0.25)
        };
    }

    function limparVariaveisCor() {
        var raiz = document.documentElement;

        VARIAVEIS_COR.forEach(function (nome) {
            raiz.style.removeProperty(nome);
        });
    }

    function atualizarControlesCor(cor) {
        var ativo = normalizarHex(cor);

        document.querySelectorAll('[data-accent-value]').forEach(function (botao) {
            var valor = normalizarHex(botao.getAttribute('data-accent-value'));
            var selecionado = ativo ? valor === ativo : !valor;

            botao.setAttribute('aria-pressed', selecionado ? 'true' : 'false');
            botao.classList.toggle('is-active', selecionado);
        });

        document.querySelectorAll('[data-accent-input]').forEach(function (entrada) {
            entrada.value = ativo || corPadraoTema(temaAtual());
        });

        document.querySelectorAll('[data-accent-preview]').forEach(function (preview) {
            preview.style.setProperty('--accent-preview', ativo || corPadraoTema(temaAtual()));
        });

        document.querySelectorAll('[data-accent-reset]').forEach(function (botao) {
            botao.disabled = !ativo;
        });
    }

    function aplicarCor(cor, persistir) {
        var vazia = cor === null || cor === undefined || cor === '';
        var hex = vazia ? null : normalizarHex(cor);

        if (!vazia && !hex) {
            return;
        }

        if (!hex || hex === COR_PADRAO) {
            limparVariaveisCor();

            if (persistir) {
                salvarCor(null);
            }

            atualizarControlesCor(null);
            return;
        }

        var variaveis = gerarVariaveisCor(hex, temaAtual());
        var raiz = document.documentElement;

        Object.keys(variaveis).forEach(function (nome) {
            raiz.style.setProperty(nome, variaveis[nome]);
        });

        if (persistir) {
            salvarCor(hex);
        }

        atualizarControlesCor(hex);
    }

    function reaplicarCor() {
        aplicarCor(lerCorPreferida(), false);
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

        reaplicarCor();
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

    function ligarFechamentoCor(detalhes) {
        document.addEventListener('click', function (evento) {
            if (detalhes.open && !detalhes.contains(evento.target)) {
                detalhes.open = false;
            }
        });

        detalhes.addEventListener('keydown', function (evento) {
            if (evento.key === 'Escape') {
                detalhes.open = false;
                var resumo = detalhes.querySelector('summary');

                if (resumo) {
                    resumo.focus();
                }
            }
        });
    }

    function criarSeletorCor(classeExtra) {
        var wrapper = document.createElement('div');
        wrapper.className = 'accent-control' + (classeExtra ? ' ' + classeExtra : '');

        var detalhes = document.createElement('details');
        detalhes.className = 'accent-picker';

        var resumo = document.createElement('summary');
        resumo.className = 'accent-toggle';
        resumo.setAttribute('aria-label', 'Cor dos detalhes');
        resumo.setAttribute('title', 'Cor dos detalhes');

        var holder = document.createElement('span');
        holder.className = 'accent-toggle-icon';

        if (window.OrganizaIcons) {
            holder.appendChild(window.OrganizaIcons.criar('palette'));
        }

        var label = document.createElement('span');
        label.className = 'accent-toggle-label';
        label.textContent = 'Cor dos detalhes';

        var preview = document.createElement('span');
        preview.className = 'accent-preview';
        preview.setAttribute('data-accent-preview', '');
        preview.setAttribute('aria-hidden', 'true');

        resumo.appendChild(holder);
        resumo.appendChild(label);
        resumo.appendChild(preview);
        detalhes.appendChild(resumo);

        var painel = document.createElement('div');
        painel.className = 'accent-panel';
        painel.setAttribute('role', 'dialog');
        painel.setAttribute('aria-label', 'Escolher a cor dos detalhes');

        var titulo = document.createElement('span');
        titulo.className = 'accent-panel-title';
        titulo.textContent = 'Cor dos detalhes';
        painel.appendChild(titulo);

        var grade = document.createElement('div');
        grade.className = 'accent-swatches';

        PRESETS_COR.forEach(function (preset) {
            var botao = document.createElement('button');
            botao.type = 'button';
            botao.className = 'accent-swatch';
            botao.style.setProperty('--swatch', preset.cor);
            botao.setAttribute('data-accent-value', normalizarHex(preset.cor) === COR_PADRAO ? '' : preset.cor);
            botao.setAttribute('aria-label', preset.nome);
            botao.setAttribute('title', preset.nome);

            botao.addEventListener('click', function () {
                aplicarCor(preset.cor, true);
            });

            grade.appendChild(botao);
        });

        painel.appendChild(grade);

        var personalizada = document.createElement('label');
        personalizada.className = 'accent-custom';

        var texto = document.createElement('span');
        texto.className = 'accent-custom-label';
        texto.textContent = 'Personalizada';

        var entrada = document.createElement('input');
        entrada.type = 'color';
        entrada.className = 'accent-color-input';
        entrada.setAttribute('data-accent-input', '');
        entrada.setAttribute('aria-label', 'Cor personalizada dos detalhes');

        entrada.addEventListener('input', function () {
            aplicarCor(entrada.value, true);
        });

        personalizada.appendChild(texto);
        personalizada.appendChild(entrada);
        painel.appendChild(personalizada);

        var resetar = document.createElement('button');
        resetar.type = 'button';
        resetar.className = 'accent-reset';
        resetar.setAttribute('data-accent-reset', '');
        resetar.textContent = 'Restaurar padrão';

        resetar.addEventListener('click', function () {
            aplicarCor(null, true);
        });

        painel.appendChild(resetar);
        detalhes.appendChild(painel);
        wrapper.appendChild(detalhes);

        ligarFechamentoCor(detalhes);

        return wrapper;
    }

    function montarCor(container, classeExtra) {
        if (!container) {
            return null;
        }

        var existente = container.querySelector('.accent-control');

        if (existente) {
            if (classeExtra) {
                existente.classList.add(classeExtra);
            }

            atualizarControlesCor(lerCorPreferida());
            return existente;
        }

        var seletor = criarSeletorCor(classeExtra);
        container.appendChild(seletor);
        atualizarControlesCor(lerCorPreferida());
        return seletor;
    }

    function montarCorFlutuante() {
        if (document.querySelector('[data-accent-floating]')) {
            return;
        }

        var seletor = montarCor(document.body, 'accent-floating');

        if (seletor) {
            seletor.setAttribute('data-accent-floating', '');
        }
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

    window.addEventListener('storage', function (evento) {
        if (evento.key === CHAVE_COR) {
            aplicarCor(lerCorPreferida(), false);
        }
    });

    document.addEventListener('DOMContentLoaded', function () {
        if (document.body.classList.contains('auth-body')) {
            montarBotaoFlutuante();
            montarCorFlutuante();
        }

        atualizarBotoes(temaAtual());
        atualizarControlesCor(lerCorPreferida());
    });

    window.OrganizaTema = {
        aplicar: function (tema) {
            aplicarTema(tema === 'dark' ? 'dark' : 'light', true);
        },
        aplicarCor: function (cor) {
            aplicarCor(cor, true);
        },
        alternar: alternarTema,
        atual: temaAtual,
        corAtual: lerCorPreferida,
        montarBotao: montarBotao,
        montarCor: montarCor,
        montarBotaoFlutuante: montarBotaoFlutuante,
        montarCorFlutuante: montarCorFlutuante
    };
})();
