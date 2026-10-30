var PRIORIDADES_VALIDAS = ['nenhuma', 'alta', 'média', 'baixa'];
var PRIORIDADE_PESO = { alta: 0, 'média': 1, baixa: 2, nenhuma: 3 };
var filtroAtual = 'todas';
var animacoesReordenacao = new WeakMap();
var tarefaInput;
var botaoAdicionar;

function gerarId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
    }

    var bytes = new Uint8Array(16);

    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
        window.crypto.getRandomValues(bytes);
    } else {
        for (var i = 0; i < bytes.length; i++) {
            bytes[i] = Math.floor(Math.random() * 256);
        }
    }

    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    var hex = Array.prototype.map.call(bytes, function (byte) {
        return byte.toString(16).padStart(2, '0');
    }).join('');

    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
}

function paraBancoPrioridade(prioridade) {
    if (prioridade === 'média') {
        return 'media';
    }

    return PRIORIDADES_VALIDAS.indexOf(prioridade) !== -1 ? prioridade : 'nenhuma';
}

function daBancoPrioridade(prioridade) {
    if (prioridade === 'media') {
        return 'média';
    }

    return PRIORIDADES_VALIDAS.indexOf(prioridade) !== -1 ? prioridade : 'nenhuma';
}

function mapearTarefa(registro) {
    return {
        id: registro.id,
        texto: registro.texto,
        concluida: registro.concluida === true,
        prioridade: daBancoPrioridade(registro.prioridade)
    };
}

function atualizarContador() {
    var contador = document.querySelectorAll("#listaTarefas li").length;
    document.getElementById('count').innerText = 'Tarefas: ' + contador;
}

async function salvarTarefa(tarefaTexto, id) {
    var perfil = Auth.usuarioAtual();

    if (!perfil) {
        return false;
    }

    var resposta = await window.sb.from('tasks').insert({
        id: id,
        user_id: perfil.id,
        texto: tarefaTexto,
        concluida: false,
        prioridade: 'nenhuma',
        ordem: Math.floor(Date.now() / 1000)
    });

    if (resposta.error) {
        console.warn('Não foi possível salvar a tarefa.', resposta.error);
        return false;
    }

    return true;
}

async function adicionarTarefa() {
    var tarefaTexto = tarefaInput.value.trim();

    if (tarefaTexto === '') {
        alert('Por favor, insira uma tarefa.');
        return;
    }

    var id = gerarId();
    var salvou = await salvarTarefa(tarefaTexto, id);

    if (!salvou) {
        alert('Não foi possível salvar a tarefa.');
        return;
    }

    adicionarTarefaExistente(tarefaTexto, false, 'nenhuma', id);
    tarefaInput.value = '';
    botaoAdicionar.disabled = true;
    reordenarTarefas();
    filtrarTarefas(filtroAtual);
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
    botaoRemover.type = 'button';
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
    botaoConcluir.type = 'button';
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
    var opcoes = [
        { valor: 'nenhuma', rotulo: 'Nenhuma' },
        { valor: 'alta', rotulo: 'Alta' },
        { valor: 'média', rotulo: 'Média' },
        { valor: 'baixa', rotulo: 'Baixa' }
    ];

    opcoes.forEach(function (opcaoDados) {
        var opcao = document.createElement('option');
        opcao.value = opcaoDados.valor;
        opcao.innerText = opcaoDados.rotulo;
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

async function atualizarTarefa(id, concluida, prioridade) {
    var perfil = Auth.usuarioAtual();

    if (!perfil) {
        return;
    }

    var estaConcluida = concluida === true || concluida === 'true';
    var resposta = await window.sb
        .from('tasks')
        .update({
            concluida: estaConcluida,
            prioridade: paraBancoPrioridade(prioridade)
        })
        .eq('id', id)
        .eq('user_id', perfil.id);

    if (resposta.error) {
        console.warn('Não foi possível atualizar a tarefa.', resposta.error);
    }
}

async function removerTarefa(id) {
    var perfil = Auth.usuarioAtual();

    if (!perfil) {
        return;
    }

    var resposta = await window.sb
        .from('tasks')
        .delete()
        .eq('id', id)
        .eq('user_id', perfil.id);

    if (resposta.error) {
        console.warn('Não foi possível remover a tarefa.', resposta.error);
    }

    atualizarContador();
}

async function migrarTarefasLocais() {
    var perfil = Auth.usuarioAtual();

    if (!perfil) {
        return;
    }

    var chave = 'organizaai.migrado.tarefas.' + perfil.id;

    try {
        if (localStorage.getItem(chave)) {
            return;
        }
    } catch (erro) {
        return;
    }

    var bruto = null;

    try {
        bruto = localStorage.getItem('tarefasSalvas');
    } catch (erro) {
        bruto = null;
    }

    if (!bruto) {
        try {
            localStorage.setItem(chave, '1');
        } catch (erro) {
            console.warn('Não foi possível marcar a migração.', erro);
        }
        return;
    }

    try {
        var lista = JSON.parse(bruto);

        if (Array.isArray(lista) && lista.length > 0) {
            var registros = lista
                .filter(function (tarefa) {
                    return tarefa && typeof tarefa.texto === 'string' && tarefa.texto.trim() !== '';
                })
                .map(function (tarefa, indice) {
                    return {
                        id: gerarId(),
                        user_id: perfil.id,
                        texto: tarefa.texto,
                        concluida: tarefa.concluida === true || tarefa.concluida === 'true',
                        prioridade: paraBancoPrioridade(tarefa.prioridade),
                        ordem: indice
                    };
                });

            if (registros.length > 0) {
                var resposta = await window.sb.from('tasks').insert(registros);

                if (resposta.error) {
                    throw resposta.error;
                }
            }
        }

        localStorage.setItem('tarefasSalvas.legacy', bruto);
        localStorage.removeItem('tarefasSalvas');
        localStorage.setItem(chave, '1');
    } catch (erro) {
        console.warn('Não foi possível migrar as tarefas locais.', erro);
    }
}

async function carregarTarefas() {
    await migrarTarefasLocais();

    var resposta = await window.sb
        .from('tasks')
        .select('*')
        .order('ordem', { ascending: true })
        .order('created_at', { ascending: true });

    if (resposta.error) {
        console.warn('Não foi possível carregar as tarefas.', resposta.error);
        return;
    }

    var tarefas = ordenarPorPrioridade((resposta.data || []).map(mapearTarefa));
    document.getElementById('listaTarefas').replaceChildren();

    tarefas.forEach(function (tarefa) {
        adicionarTarefaExistente(tarefa.texto, tarefa.concluida, tarefa.prioridade, tarefa.id);
    });

    reordenarTarefas();
    atualizarContador();
}

async function limparTarefas() {
    var perfil = Auth.usuarioAtual();

    if (!perfil) {
        return;
    }

    var resposta = await window.sb
        .from('tasks')
        .delete()
        .eq('user_id', perfil.id);

    if (resposta.error) {
        console.warn('Não foi possível limpar as tarefas.', resposta.error);
        return;
    }

    document.getElementById('listaTarefas').replaceChildren();
    atualizarContador();
}

function montarAcoes() {
    var divLimpar = document.getElementById('divLimpar');
    var btnLimpar = document.createElement('button');
    btnLimpar.id = 'btnLimpar';
    btnLimpar.type = 'button';
    btnLimpar.textContent = 'Limpar lista';
    btnLimpar.addEventListener('click', limparTarefas);
    divLimpar.replaceChildren(btnLimpar);

    var divFiltros = document.getElementById('divFiltros');
    var filtros = [
        { id: 'btnTodas', rotulo: 'Todas', valor: 'todas', ativo: true },
        { id: 'btnConcluidas', rotulo: 'Concluídas', valor: 'concluidas', ativo: false },
        { id: 'btnNaoConcluidas', rotulo: 'Não Concluídas', valor: 'naoConcluidas', ativo: false }
    ];

    divFiltros.replaceChildren();

    filtros.forEach(function (dados) {
        var botao = document.createElement('button');
        botao.id = dados.id;
        botao.type = 'button';
        botao.className = 'filter-chip' + (dados.ativo ? ' active' : '');
        botao.dataset.filtro = dados.valor;
        botao.textContent = dados.rotulo;
        botao.addEventListener('click', function () {
            filtrarTarefas(dados.valor);
        });
        divFiltros.appendChild(botao);
    });
}

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

function iniciarTarefas() {
    tarefaInput = document.getElementById('tarefaInput');
    botaoAdicionar = document.getElementById('addBtn');

    botaoAdicionar.disabled = true;

    tarefaInput.addEventListener('input', function () {
        botaoAdicionar.disabled = tarefaInput.value.trim() === "";
    });

    tarefaInput.addEventListener('keypress', function (evento) {
        if (evento.key === 'Enter') {
            evento.preventDefault();
            adicionarTarefa();
        }
    });

    botaoAdicionar.addEventListener('click', adicionarTarefa);
    montarAcoes();
    carregarTarefas();
}

document.addEventListener('DOMContentLoaded', function () {
    var pronto = window.AUTH_READY || Auth.proteger({
        login: 'login.html',
        fallback: 'index.html'
    });

    pronto.then(function (perfil) {
        if (perfil) {
            iniciarTarefas();
        }
    });
});
