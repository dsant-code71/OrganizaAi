'use strict';

var PRIORIDADES_VALIDAS = ['nenhuma', 'alta', 'média', 'baixa'];
var PRIORIDADE_PESO = { alta: 0, 'média': 1, baixa: 2, nenhuma: 3 };
var filtroAtual = 'todas';
var animacoesReordenacao = new WeakMap();

var cliente = null;
var usuarioAtual = null;
var tarefas = [];
var statusTimer = null;

function gerarId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
    }
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function prioridadeDoBanco(valor) {
    if (valor === 'media') {
        return 'média';
    }

    return PRIORIDADES_VALIDAS.indexOf(valor) !== -1 ? valor : 'nenhuma';
}

function prioridadeParaBanco(valor) {
    return valor === 'média' ? 'media' : valor;
}

function normalizarTarefa(bruto) {
    return {
        id: typeof bruto.id === 'string' && bruto.id !== '' ? bruto.id : gerarId(),
        texto: bruto.texto,
        concluida: bruto.concluida === true,
        prioridade: prioridadeDoBanco(bruto.prioridade),
        ordem: typeof bruto.ordem === 'number' ? bruto.ordem : 0,
        criadoEm: bruto.created_at ? Date.parse(bruto.created_at) : Date.now()
    };
}

function mostrarStatus(texto, tipo) {
    var elemento = document.getElementById('statusTarefas');

    if (!elemento) {
        return;
    }

    elemento.textContent = texto || '';
    elemento.className = 'form-message' + (tipo ? ' ' + tipo : '');

    if (statusTimer) {
        window.clearTimeout(statusTimer);
        statusTimer = null;
    }

    if (texto && tipo !== 'error') {
        statusTimer = window.setTimeout(function () {
            elemento.textContent = '';
            elemento.className = 'form-message';
        }, 4000);
    }
}

function atualizarContador() {
    var contador = document.querySelectorAll('#listaTarefas li').length;
    document.getElementById('count').innerText = 'Tarefas: ' + contador;
}

function aplicarEstiloPrioridade(tarefa, prioridade) {
    tarefa.dataset.prioridade = PRIORIDADES_VALIDAS.indexOf(prioridade) !== -1 ? prioridade : 'nenhuma';
}

function obterPesoPrioridade(prioridade) {
    return Object.prototype.hasOwnProperty.call(PRIORIDADE_PESO, prioridade)
        ? PRIORIDADE_PESO[prioridade]
        : PRIORIDADE_PESO.nenhuma;
}

function ordenarPorPrioridade(lista) {
    return lista
        .map(function (tarefa, indice) {
            return { tarefa: tarefa, indice: indice };
        })
        .sort(function (a, b) {
            var diferenca = obterPesoPrioridade(a.tarefa.prioridade) - obterPesoPrioridade(b.tarefa.prioridade);

            if (diferenca !== 0) {
                return diferenca;
            }

            var ordem = (a.tarefa.ordem || 0) - (b.tarefa.ordem || 0);

            if (ordem !== 0) {
                return ordem;
            }

            return (a.tarefa.criadoEm || 0) - (b.tarefa.criadoEm || 0);
        })
        .map(function (item) {
            return item.tarefa;
        });
}

function reordenarTarefas(opcoes) {
    var lista = document.getElementById('listaTarefas');
    var animar = !!(opcoes && opcoes.animar);
    var destaque = (opcoes && opcoes.destaque) || null;
    var prefereMenosMovimento = window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    animar = animar && !prefereMenosMovimento;

    Array.prototype.forEach.call(lista.children, function (tarefa) {
        if (animacoesReordenacao.has(tarefa)) {
            animacoesReordenacao.get(tarefa).cancel();
            animacoesReordenacao.delete(tarefa);
        }
        if (tarefa._removerDestaque) {
            window.clearTimeout(tarefa._removerDestaque);
            tarefa._removerDestaque = null;
        }
        tarefa.classList.remove('reordering');
    });

    var itens = Array.prototype.map.call(lista.children, function (tarefa, indice) {
        return {
            elemento: tarefa,
            indice: indice,
            topoAnterior: animar ? tarefa.getBoundingClientRect().top : 0
        };
    });

    itens.sort(function (a, b) {
        var diferenca = obterPesoPrioridade(a.elemento.dataset.prioridade) - obterPesoPrioridade(b.elemento.dataset.prioridade);
        return diferenca !== 0 ? diferenca : a.indice - b.indice;
    });

    itens.forEach(function (item) {
        lista.appendChild(item.elemento);
    });

    if (!animar) {
        return;
    }

    var duracao = 420;
    var movimentos = [];

    itens.forEach(function (item) {
        var topoAtual = item.elemento.getBoundingClientRect().top;
        var deslocamento = item.topoAnterior - topoAtual;

        if (Math.abs(deslocamento) >= 1) {
            movimentos.push({ elemento: item.elemento, deslocamento: deslocamento });
        }
    });

    var destaqueMoveu = movimentos.some(function (movimento) {
        return movimento.elemento === destaque;
    });

    if (destaque && destaqueMoveu) {
        destaque.classList.add('reordering');
        destaque._removerDestaque = window.setTimeout(function () {
            destaque.classList.remove('reordering');
            destaque._removerDestaque = null;
        }, duracao + 60);
    }

    movimentos.forEach(function (movimento) {
        var animacao = movimento.elemento.animate(
            [
                { transform: 'translateY(' + movimento.deslocamento + 'px)' },
                { transform: 'translateY(0)' }
            ],
            {
                duration: duracao,
                easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
            }
        );

        animacoesReordenacao.set(movimento.elemento, animacao);
    });
}

function adicionarTarefaExistente(tarefa) {
    var novaTarefa = document.createElement('li');
    novaTarefa.className = tarefa.concluida ? 'task-item completed' : 'task-item';
    novaTarefa.style.opacity = '0';
    novaTarefa.dataset.id = tarefa.id;
    novaTarefa.dataset.concluida = tarefa.concluida ? 'true' : 'false';

    var textoTarefa = document.createElement('span');
    textoTarefa.className = 'task-text';
    textoTarefa.innerText = tarefa.texto;

    window.setTimeout(function () {
        novaTarefa.style.opacity = '1';
    }, 1);

    var botaoRemover = document.createElement('button');
    botaoRemover.className = 'remove-btn';
    botaoRemover.innerText = 'Remover';
    botaoRemover.setAttribute('aria-label', 'Remover tarefa');
    botaoRemover.setAttribute('title', 'Remover tarefa');

    botaoRemover.addEventListener('click', async function () {
        botaoRemover.disabled = true;

        var removeu = await removerTarefa(tarefa.id);

        if (!removeu) {
            botaoRemover.disabled = false;
            return;
        }

        novaTarefa.style.opacity = '0';
        window.setTimeout(function () {
            novaTarefa.remove();
            atualizarContador();
        }, 350);
    });

    var botaoConcluir = document.createElement('button');
    botaoConcluir.className = 'complete-btn';
    botaoConcluir.innerText = tarefa.concluida ? 'Concluída' : 'Concluir';
    botaoConcluir.setAttribute('aria-label', tarefa.concluida ? 'Marcar como pendente' : 'Marcar como concluída');
    botaoConcluir.setAttribute('title', tarefa.concluida ? 'Marcar como pendente' : 'Marcar como concluída');

    botaoConcluir.addEventListener('click', async function () {
        var anterior = tarefa.concluida;
        var novo = !anterior;

        tarefa.concluida = novo;
        novaTarefa.classList.toggle('completed', novo);
        novaTarefa.dataset.concluida = novo ? 'true' : 'false';
        botaoConcluir.innerText = novo ? 'Concluída' : 'Concluir';
        botaoConcluir.setAttribute('aria-label', novo ? 'Marcar como pendente' : 'Marcar como concluída');
        botaoConcluir.setAttribute('title', novo ? 'Marcar como pendente' : 'Marcar como concluída');

        var atualizou = await atualizarTarefa(tarefa.id, novo, tarefa.prioridade);

        if (!atualizou) {
            tarefa.concluida = anterior;
            novaTarefa.classList.toggle('completed', anterior);
            novaTarefa.dataset.concluida = anterior ? 'true' : 'false';
            botaoConcluir.innerText = anterior ? 'Concluída' : 'Concluir';
            botaoConcluir.setAttribute('aria-label', anterior ? 'Marcar como pendente' : 'Marcar como concluída');
            botaoConcluir.setAttribute('title', anterior ? 'Marcar como pendente' : 'Marcar como concluída');
        }

        filtrarTarefas(filtroAtual);
    });

    var dropdownPrioridade = document.createElement('select');
    dropdownPrioridade.className = 'priority-select';
    dropdownPrioridade.setAttribute('aria-label', 'Prioridade da tarefa');
    var opcoes = ['Nenhuma', 'Alta', 'Média', 'Baixa'];

    opcoes.forEach(function (prioridadeOp) {
        var opcao = document.createElement('option');
        opcao.value = prioridadeOp.toLowerCase();
        opcao.innerText = prioridadeOp;
        dropdownPrioridade.appendChild(opcao);
    });

    dropdownPrioridade.value = tarefa.prioridade;
    aplicarEstiloPrioridade(novaTarefa, tarefa.prioridade);

    dropdownPrioridade.addEventListener('change', async function () {
        var anterior = tarefa.prioridade;
        var nova = dropdownPrioridade.value;

        tarefa.prioridade = nova;
        aplicarEstiloPrioridade(novaTarefa, nova);

        var subiuPrioridade = obterPesoPrioridade(nova) < obterPesoPrioridade(anterior);

        reordenarTarefas({
            animar: true,
            destaque: subiuPrioridade ? novaTarefa : null
        });

        var atualizou = await atualizarTarefa(tarefa.id, tarefa.concluida, nova);

        if (!atualizou) {
            tarefa.prioridade = anterior;
            dropdownPrioridade.value = anterior;
            aplicarEstiloPrioridade(novaTarefa, anterior);
            reordenarTarefas({ animar: true });
            return;
        }

        filtrarTarefas(filtroAtual);
    });

    novaTarefa.appendChild(textoTarefa);
    novaTarefa.appendChild(dropdownPrioridade);
    novaTarefa.appendChild(botaoRemover);
    novaTarefa.appendChild(botaoConcluir);
    document.getElementById('listaTarefas').appendChild(novaTarefa);
}

function renderizarTarefas() {
    document.getElementById('listaTarefas').innerHTML = '';

    ordenarPorPrioridade(tarefas).forEach(function (tarefa) {
        adicionarTarefaExistente(tarefa);
    });

    reordenarTarefas();
    atualizarContador();
    filtrarTarefas(filtroAtual);
}

async function obterProximaOrdem() {
    var resposta = await cliente
        .from('tasks')
        .select('ordem')
        .order('ordem', { ascending: false })
        .limit(1);

    if (resposta.error) {
        throw resposta.error;
    }

    var maior = resposta.data && resposta.data[0] ? Number(resposta.data[0].ordem) : 0;

    return (isFinite(maior) ? maior : 0) + 1;
}

async function carregarTarefas() {
    mostrarStatus('Carregando tarefas...', 'info');

    try {
        var resposta = await cliente
            .from('tasks')
            .select('id, texto, concluida, prioridade, ordem, created_at')
            .order('ordem', { ascending: true })
            .order('created_at', { ascending: true });

        if (resposta.error) {
            throw resposta.error;
        }

        tarefas = (resposta.data || []).map(normalizarTarefa);
        renderizarTarefas();
        mostrarStatus('', '');
    } catch (erro) {
        console.error('Não foi possível carregar as tarefas.', erro);
        mostrarStatus('Não foi possível carregar as tarefas. Recarregue a página.', 'error');
    }
}

async function adicionarTarefa() {
    var tarefaInput = document.getElementById('tarefaInput');
    var botaoAdicionar = document.getElementById('addBtn');
    var tarefaTexto = tarefaInput.value.trim();

    if (tarefaTexto === '') {
        alert('Por favor, insira uma tarefa.');
        return;
    }

    botaoAdicionar.disabled = true;
    mostrarStatus('Salvando tarefa...', 'info');

    try {
        var ordem = await obterProximaOrdem();
        var resposta = await cliente
            .from('tasks')
            .insert({
                user_id: usuarioAtual.id,
                texto: tarefaTexto,
                concluida: false,
                prioridade: 'nenhuma',
                ordem: ordem
            })
            .select('id, texto, concluida, prioridade, ordem, created_at')
            .single();

        if (resposta.error) {
            throw resposta.error;
        }

        tarefas.push(normalizarTarefa(resposta.data));
        tarefaInput.value = '';
        tarefaInput.focus();
        renderizarTarefas();
        mostrarStatus('Tarefa adicionada.', 'success');
    } catch (erro) {
        console.error('Não foi possível adicionar a tarefa.', erro);
        mostrarStatus('Não foi possível adicionar a tarefa. Tente novamente.', 'error');
    } finally {
        botaoAdicionar.disabled = tarefaInput.value.trim() === '';
    }
}

async function atualizarTarefa(id, concluida, prioridade) {
    try {
        var resposta = await cliente
            .from('tasks')
            .update({
                concluida: concluida === true,
                prioridade: prioridadeParaBanco(prioridade)
            })
            .eq('id', id);

        if (resposta.error) {
            throw resposta.error;
        }

        return true;
    } catch (erro) {
        console.error('Não foi possível atualizar a tarefa.', erro);
        mostrarStatus('Não foi possível atualizar a tarefa.', 'error');
        return false;
    }
}

async function removerTarefa(id) {
    try {
        var resposta = await cliente.from('tasks').delete().eq('id', id);

        if (resposta.error) {
            throw resposta.error;
        }

        tarefas = tarefas.filter(function (tarefa) {
            return tarefa.id !== id;
        });

        return true;
    } catch (erro) {
        console.error('Não foi possível remover a tarefa.', erro);
        mostrarStatus('Não foi possível remover a tarefa.', 'error');
        return false;
    }
}

async function limparTarefas() {
    if (!usuarioAtual) {
        return;
    }

    mostrarStatus('Limpando lista...', 'info');

    try {
        var resposta = await cliente.from('tasks').delete().eq('user_id', usuarioAtual.id);

        if (resposta.error) {
            throw resposta.error;
        }

        tarefas = [];
        renderizarTarefas();
        mostrarStatus('Lista limpa.', 'success');
    } catch (erro) {
        console.error('Não foi possível limpar as tarefas.', erro);
        mostrarStatus('Não foi possível limpar a lista.', 'error');
    }
}

function filtrarTarefas(filtro) {
    filtroAtual = filtro;

    document.querySelectorAll('#divFiltros button').forEach(function (botao) {
        botao.classList.toggle('active', botao.dataset.filtro === filtro);
    });

    var itens = document.querySelectorAll('#listaTarefas li');

    itens.forEach(function (tarefa) {
        switch (filtro) {
            case 'todas':
                tarefa.style.display = '';
                break;
            case 'concluidas':
                tarefa.style.display = tarefa.dataset.concluida === 'true' ? '' : 'none';
                break;
            case 'naoConcluidas':
                tarefa.style.display = tarefa.dataset.concluida !== 'true' ? '' : 'none';
                break;
        }
    });
}

function montarControles() {
    var divLimpar = document.getElementById('divLimpar');
    var btnLimpar = document.createElement('button');
    btnLimpar.id = 'btnLimpar';
    btnLimpar.type = 'button';
    btnLimpar.textContent = 'Limpar lista';
    btnLimpar.addEventListener('click', limparTarefas);
    divLimpar.replaceChildren(btnLimpar);

    var divFiltros = document.getElementById('divFiltros');
    var filtros = [
        { id: 'btnTodas', filtro: 'todas', texto: 'Todas' },
        { id: 'btnConcluidas', filtro: 'concluidas', texto: 'Concluídas' },
        { id: 'btnNaoConcluidas', filtro: 'naoConcluidas', texto: 'Não Concluídas' }
    ];

    divFiltros.replaceChildren();

    filtros.forEach(function (item) {
        var botao = document.createElement('button');
        botao.id = item.id;
        botao.type = 'button';
        botao.className = 'filter-chip' + (item.filtro === filtroAtual ? ' active' : '');
        botao.dataset.filtro = item.filtro;
        botao.textContent = item.texto;
        botao.addEventListener('click', function () {
            filtrarTarefas(item.filtro);
        });
        divFiltros.appendChild(botao);
    });
}

function ligarEventos() {
    var botaoAdicionar = document.getElementById('addBtn');
    var tarefaInput = document.getElementById('tarefaInput');

    botaoAdicionar.disabled = true;

    tarefaInput.addEventListener('input', function () {
        botaoAdicionar.disabled = tarefaInput.value.trim() === '';
    });

    tarefaInput.addEventListener('keydown', function (evento) {
        if (evento.key === 'Enter') {
            evento.preventDefault();
            void adicionarTarefa();
        }
    });
}

async function iniciarTarefas() {
    var loading = document.getElementById('authLoading');

    cliente = window.organizaaiClient;

    if (!cliente || !window.OrganizaAuth) {
        loading.textContent = 'Não foi possível conectar ao serviço. Recarregue a página.';
        return;
    }

    var contexto = null;

    try {
        contexto = await window.OrganizaAuth.requireAuth();
    } catch (erro) {
        console.error('Falha ao validar a sessão.', erro);
        loading.textContent = 'Não foi possível validar sua sessão. Recarregue a página.';
        return;
    }

    if (!contexto) {
        return;
    }

    usuarioAtual = contexto.user;

    window.OrganizaAuth.renderUserMenu(contexto.profile);

    document.querySelector('header.brand').hidden = false;
    document.querySelector('main.todo-container').hidden = false;
    document.getElementById('userMenu').hidden = false;
    loading.hidden = true;

    montarControles();
    ligarEventos();

    await carregarTarefas();
}

document.addEventListener('DOMContentLoaded', function () {
    void iniciarTarefas();
});
