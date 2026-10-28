var STORAGE_KEY = 'tarefasSalvas';
var PRIORIDADES_VALIDAS = ['nenhuma', 'alta', 'média', 'baixa'];

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

        return tarefasSalvas.filter(function (tarefa) {
            return tarefa && typeof tarefa.texto === 'string' && tarefa.texto.trim() !== '';
        });
    } catch (erro) {
        console.warn('Não foi possível ler as tarefas salvas.', erro);
        return [];
    }
}

function salvarTarefas(tarefas) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tarefas));
    } catch (erro) {
        console.warn('Não foi possível salvar as tarefas.', erro);
    }
}

function atualizarContador() {
    var contador = document.querySelectorAll("#listaTarefas li").length;
    console.log("Contador atualizado:", contador);
    document.getElementById('count').innerText = 'Tarefas: ' + contador; }

document.addEventListener("DOMContentLoaded", function () {
    carregarTarefas();

    let botaoAdicionar = document.getElementById("addBtn");
    let tarefaInput = document.getElementById("tarefaInput");

    botaoAdicionar.disabled = true;
    botaoAdicionar.style.backgroundColor = "gray";
    botaoAdicionar.style.cursor = "not-allowed";

    tarefaInput.addEventListener("input", function () {
        if (tarefaInput.value.trim() !== "") {
            botaoAdicionar.disabled = false;
            botaoAdicionar.style.backgroundColor = "#0f0f0f";
            botaoAdicionar.style.cursor = "pointer";
        } else {
            botaoAdicionar.disabled = true;
            botaoAdicionar.style.backgroundColor = "gray";
            botaoAdicionar.style.cursor = "not-allowed";
        }
    });
});

function adicionarTarefa() {
    var tarefaTexto = document.getElementById('tarefaInput').value;

    if (tarefaTexto.trim() !== '') {
        var id = gerarId();
        adicionarTarefaExistente(tarefaTexto, false, "nenhuma", id);
        salvarTarefa(tarefaTexto, id);
        document.getElementById('tarefaInput').value = ''; 
    } else {
        alert('Por favor, insira uma tarefa.');
    }
}

function adicionarTarefaExistente(tarefaTexto, concluida = false, prioridade = "nenhuma", id = null) {
    id = id || gerarId();

    var estaConcluida = concluida === true || concluida === 'true';
    var novaTarefa = document.createElement('li');
    novaTarefa.innerText = tarefaTexto;
    novaTarefa.style.opacity = "0";
    novaTarefa.dataset.id = id;
    novaTarefa.dataset.concluida = estaConcluida ? 'true' : 'false';

    setTimeout(() => {
        novaTarefa.style.transition = "opacity 1s"; 
        novaTarefa.style.opacity = "1";
    }, 1);

    var botaoRemover = document.createElement('button');
    botaoRemover.innerText = 'Remover';

    botaoRemover.addEventListener('click', function () {
        removerTarefa(id);
        novaTarefa.style.transition = "opacity 1s"; 
        novaTarefa.style.opacity = "0";
        setTimeout(() => {
            novaTarefa.remove();
            atualizarContador()
        }, 1000);
    });

    var botaoConcluir = document.createElement('button');
    botaoConcluir.innerText = estaConcluida ? 'Concluída' : 'Concluir';

    botaoConcluir.addEventListener('click', function () {
        if (novaTarefa.dataset.concluida === "true") {
            botaoConcluir.style.backgroundColor = "#0f0f0f";
            botaoConcluir.style.color = "#05cdff";
            novaTarefa.dataset.concluida = "false";
            botaoConcluir.innerText = 'Concluir';
        } else {
            botaoConcluir.style.backgroundColor = "#05ff5d";
            botaoConcluir.style.color = "black";
            novaTarefa.dataset.concluida = "true";
            botaoConcluir.innerText = 'Concluída';
        }
        atualizarTarefa(id, novaTarefa.dataset.concluida, prioridade);
    });

    var dropdownPrioridade = document.createElement('select');
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
        prioridade = dropdownPrioridade.value;
        aplicarEstiloPrioridade(novaTarefa, prioridade);
        atualizarTarefa(id, novaTarefa.dataset.concluida, prioridade);
    });

    novaTarefa.appendChild(dropdownPrioridade);
    novaTarefa.appendChild(botaoRemover);
    novaTarefa.appendChild(botaoConcluir);
    document.getElementById('listaTarefas').appendChild(novaTarefa);
}

function aplicarEstiloPrioridade(tarefa, prioridade) {
    switch (prioridade) {
        case 'nenhuma':
            tarefa.style.backgroundColor = "black";
            tarefa.style.color = "#05cdff";
            break;
        case 'alta':
            tarefa.style.backgroundColor = "#f34040";
            tarefa.style.color = "black";
            break;
        case 'média':
            tarefa.style.backgroundColor = "#fca33d";
            tarefa.style.color = "black";
            break;
        case 'baixa':
            tarefa.style.backgroundColor = "#59fc61";
            tarefa.style.color = "black";
            break;
    }
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

document.getElementById('divLimpar').innerHTML += '<button id="btnLimpar" onclick="limparTarefas();">Limpar</button>';
document.getElementById('btnLimpar').style.width = "100%";

document.getElementById('divFiltros').innerHTML = `
    <button id="btnTodas" onclick="filtrarTarefas('todas');">Todas</button>
    <button id="btnConcluidas" onclick="filtrarTarefas('concluidas');">Concluídas</button>
    <button id="btnNaoConcluidas" onclick="filtrarTarefas('naoConcluidas');">Não Concluídas</button>
`;

document.getElementById('divFiltros').style.display = 'grid';
document.getElementById('divFiltros').style.gridTemplateColumns = '34% 34% 35%';
document.getElementById('divFiltros').style.alignItems = 'center';

function filtrarTarefas(filtro) {
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

