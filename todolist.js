var STORAGE_KEY = 'tarefasSalvas';
var PRIORIDADES_VALIDAS = ['nenhuma', 'alta', 'média', 'baixa'];
var PRIORIDADE_PESO = { alta: 0, 'média': 1, baixa: 2, nenhuma: 3 };
var filtroAtual = 'todas';
var animacoesReordenacao = new WeakMap();

function gerarId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
    }
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function normalizarTarefa(tarefa) {
    return {
        id: typeof tarefa.id === 'string' && tarefa.id !== '' ? tarefa.id : gerarId(),
        texto: tarefa.texto,
        concluida: tarefa.concluida === true || tarefa.concluida === 'true',
        prioridade: PRIORIDADES_VALIDAS.indexOf(tarefa.prioridade) !== -1 ? tarefa.prioridade : 'nenhuma'
    };
}

function normalizarTarefas(tarefas) {
    var idsUsados = {};

    return tarefas.map(function (tarefa) {
        var normalizada = normalizarTarefa(tarefa);

        while (idsUsados[normalizada.id]) {
            normalizada.id = gerarId();
        }

        idsUsados[normalizada.id] = true;
        return normalizada;
    });
}

function lerTarefas() {
    try {
        var tarefasSalvas = JSON.parse(localStorage.getItem(STORAGE_KEY));

        if (!Array.isArray(tarefasSalvas)) {
            return [];
        }

        return ordenarPorPrioridade(tarefasSalvas.filter(function (tarefa) {
            return tarefa && typeof tarefa.texto === 'string' && tarefa.texto.trim() !== '';
        }));
    } catch (erro) {
        console.warn('Não foi possível ler as tarefas salvas.', erro);
        return [];
    }
}

function salvarTarefas(tarefas) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(ordenarPorPrioridade(tarefas)));
    } catch (erro) {
        console.warn('Não foi possível salvar as tarefas.', erro);
    }
}

function atualizarContador() {
    var contador = document.querySelectorAll("#listaTarefas li").length;
    document.getElementById('count').innerText = 'Tarefas: ' + contador;
}

document.addEventListener("DOMContentLoaded", function () {
    carregarTarefas();

    let botaoAdicionar = document.getElementById("addBtn");
    let tarefaInput = document.getElementById("tarefaInput");

    botaoAdicionar.disabled = true;

    tarefaInput.addEventListener("input", function () {
        botaoAdicionar.disabled = tarefaInput.value.trim() === "";
    });
});

function adicionarTarefa() {
    var tarefaTexto = document.getElementById('tarefaInput').value;

    if (tarefaTexto.trim() !== '') {
        var id = gerarId();
        adicionarTarefaExistente(tarefaTexto, false, "nenhuma", id);
        salvarTarefa(tarefaTexto, id);
        document.getElementById('tarefaInput').value = '';
        document.getElementById('addBtn').disabled = true;
        reordenarTarefas();
        filtrarTarefas(filtroAtual);
    } else {
        alert('Por favor, insira uma tarefa.');
    }
}

function adicionarTarefaExistente(tarefaTexto, concluida = false, prioridade = "nenhuma", id = null) {
    id = id || gerarId();

    var estaConcluida = concluida === true || concluida === 'true';
    var novaTarefa = document.createElement('li');
    novaTarefa.className = estaConcluida ? 'task-item completed' : 'task-item';
    novaTarefa.style.opacity = "0";
    novaTarefa.dataset.id = id;
    novaTarefa.dataset.concluida = estaConcluida ? 'true' : 'false';

    var textoTarefa = document.createElement('span');
    textoTarefa.className = 'task-text';
    textoTarefa.innerText = tarefaTexto;

    setTimeout(() => {
        novaTarefa.style.opacity = "1";
    }, 1);

    var botaoRemover = document.createElement('button');
    botaoRemover.className = 'remove-btn';
    botaoRemover.innerText = 'Remover';
    botaoRemover.setAttribute('aria-label', 'Remover tarefa');
    botaoRemover.setAttribute('title', 'Remover tarefa');

    botaoRemover.addEventListener('click', function () {
        removerTarefa(id);
        novaTarefa.style.opacity = "0";
        setTimeout(() => {
            novaTarefa.remove();
            atualizarContador();
        }, 350);
    });

    var botaoConcluir = document.createElement('button');
    botaoConcluir.className = 'complete-btn';
    botaoConcluir.innerText = estaConcluida ? 'Concluída' : 'Concluir';
    botaoConcluir.setAttribute('aria-label', estaConcluida ? 'Marcar como pendente' : 'Marcar como concluída');
    botaoConcluir.setAttribute('title', estaConcluida ? 'Marcar como pendente' : 'Marcar como concluída');

    botaoConcluir.addEventListener('click', function () {
        if (novaTarefa.dataset.concluida === "true") {
            novaTarefa.classList.remove('completed');
            novaTarefa.dataset.concluida = "false";
            botaoConcluir.innerText = 'Concluir';
            botaoConcluir.setAttribute('aria-label', 'Marcar como concluída');
            botaoConcluir.setAttribute('title', 'Marcar como concluída');
        } else {
            novaTarefa.classList.add('completed');
            novaTarefa.dataset.concluida = "true";
            botaoConcluir.innerText = 'Concluída';
            botaoConcluir.setAttribute('aria-label', 'Marcar como pendente');
            botaoConcluir.setAttribute('title', 'Marcar como pendente');
        }
        atualizarTarefa(id, novaTarefa.dataset.concluida, prioridade);
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

    dropdownPrioridade.value = prioridade;
    aplicarEstiloPrioridade(novaTarefa, prioridade);

    dropdownPrioridade.addEventListener('change', function () {
        var prioridadeAnterior = novaTarefa.dataset.prioridade;
        prioridade = dropdownPrioridade.value;
        aplicarEstiloPrioridade(novaTarefa, prioridade);
        atualizarTarefa(id, novaTarefa.dataset.concluida, prioridade);

        var subiuPrioridade = obterPesoPrioridade(prioridade) < obterPesoPrioridade(prioridadeAnterior);

        reordenarTarefas({
            animar: true,
            destaque: subiuPrioridade ? novaTarefa : null
        });
    });

    novaTarefa.appendChild(textoTarefa);
    novaTarefa.appendChild(dropdownPrioridade);
    novaTarefa.appendChild(botaoRemover);
    novaTarefa.appendChild(botaoConcluir);
    document.getElementById('listaTarefas').appendChild(novaTarefa);
}

function aplicarEstiloPrioridade(tarefa, prioridade) {
    tarefa.dataset.prioridade = PRIORIDADES_VALIDAS.indexOf(prioridade) !== -1 ? prioridade : 'nenhuma';
}

function obterPesoPrioridade(prioridade) {
    return Object.prototype.hasOwnProperty.call(PRIORIDADE_PESO, prioridade)
        ? PRIORIDADE_PESO[prioridade]
        : PRIORIDADE_PESO.nenhuma;
}

function ordenarPorPrioridade(tarefas) {
    return tarefas
        .map(function (tarefa, indice) {
            return { tarefa: tarefa, indice: indice };
        })
        .sort(function (a, b) {
            var diferenca = obterPesoPrioridade(a.tarefa.prioridade) - obterPesoPrioridade(b.tarefa.prioridade);
            return diferenca !== 0 ? diferenca : a.indice - b.indice;
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

    var tarefas = Array.prototype.map.call(lista.children, function (tarefa, indice) {
        return {
            elemento: tarefa,
            indice: indice,
            topoAnterior: animar ? tarefa.getBoundingClientRect().top : 0
        };
    });

    tarefas.sort(function (a, b) {
        var diferenca = obterPesoPrioridade(a.elemento.dataset.prioridade) - obterPesoPrioridade(b.elemento.dataset.prioridade);
        return diferenca !== 0 ? diferenca : a.indice - b.indice;
    });

    tarefas.forEach(function (item) {
        lista.appendChild(item.elemento);
    });

    if (!animar) {
        return;
    }

    var duracao = 420;
    var movimentos = [];

    tarefas.forEach(function (item) {
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

function salvarTarefa(tarefaTexto, id) {
    var tarefasSalvas = lerTarefas();
    tarefasSalvas.push({ id: id || gerarId(), texto: tarefaTexto, concluida: false, prioridade: "nenhuma" });
    salvarTarefas(tarefasSalvas);
}

function atualizarTarefa(id, concluida, prioridade) {
    var estaConcluida = concluida === true || concluida === 'true';
    var tarefasSalvas = lerTarefas();
    tarefasSalvas = tarefasSalvas.map(function (tarefa) {
        if (tarefa.id === id) {
            return { id: tarefa.id, texto: tarefa.texto, concluida: estaConcluida, prioridade: prioridade };
        }
        return tarefa;
    });
    salvarTarefas(tarefasSalvas);
}

function removerTarefa(id) {
    var tarefasSalvas = lerTarefas().filter(function (tarefa) {
        return tarefa.id !== id;
    });
    salvarTarefas(tarefasSalvas);
    atualizarContador();
}

function carregarTarefas() {
    var tarefasOriginais = lerTarefas();
    var tarefasSalvas = normalizarTarefas(tarefasOriginais);
    var precisaMigrar = tarefasSalvas.some(function (tarefa, indice) {
        var original = tarefasOriginais[indice];
        return tarefa.id !== original.id ||
            tarefa.concluida !== original.concluida ||
            tarefa.prioridade !== original.prioridade;
    });

    if (precisaMigrar) {
        salvarTarefas(tarefasSalvas);
    }

    tarefasSalvas.forEach(function (tarefa) {
        adicionarTarefaExistente(tarefa.texto, tarefa.concluida, tarefa.prioridade, tarefa.id);
    });
    reordenarTarefas();
    atualizarContador();
}

function limparTarefas() {
    document.getElementById('listaTarefas').innerHTML = '';
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (erro) {
        console.warn('Não foi possível limpar as tarefas salvas.', erro);
    }
    atualizarContador()
}

document.getElementById('tarefaInput').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        adicionarTarefa(document.getElementById('tarefaInput').value);
    }
});

document.getElementById('divLimpar').innerHTML += '<button id="btnLimpar" onclick="limparTarefas();">Limpar lista</button>';

document.getElementById('divFiltros').innerHTML = `
    <button id="btnTodas" class="filter-chip active" data-filtro="todas" onclick="filtrarTarefas('todas');">Todas</button>
    <button id="btnConcluidas" class="filter-chip" data-filtro="concluidas" onclick="filtrarTarefas('concluidas');">Concluídas</button>
    <button id="btnNaoConcluidas" class="filter-chip" data-filtro="naoConcluidas" onclick="filtrarTarefas('naoConcluidas');">Não Concluídas</button>
`;

function filtrarTarefas(filtro) {
    filtroAtual = filtro;

    document.querySelectorAll('#divFiltros button').forEach(function (botao) {
        botao.classList.toggle('active', botao.dataset.filtro === filtro);
    });

    var tarefas = document.querySelectorAll("#listaTarefas li");
    tarefas.forEach(function (tarefa) {
        switch (filtro) {
            case 'todas':
                tarefa.style.display = '';
                break;
            case 'concluidas':
                if (tarefa.dataset.concluida === "true") {
                    tarefa.style.display = '';
                } else {
                    tarefa.style.display = 'none';
                }
                break;
            case 'naoConcluidas':
                if (tarefa.dataset.concluida !== "true") {
                    tarefa.style.display = '';
                } else {
                    tarefa.style.display = 'none';
                }
                break;
        }
    });
}

