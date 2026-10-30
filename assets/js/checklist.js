'use strict';

var cliente = null;
var usuarioAtual = null;
var perfilAtual = null;
var ehGestor = false;
var nomesMapa = {};

var maquinas = [];
var maquinasPorId = new Map();
var dias = {};
var dataSelecionada = '';
var faseAtiva = 'inicio';
var maquinaEmEdicaoId = null;

var salvarTimers = new Map();
var salvarFilas = new Map();
var salvarErros = new Set();
var camposPendentes = new Map();
var mensagemMaquinaTimer = null;
var mensagemExportTimer = null;

var menuToggle;
var menuBadge;
var machinesMenu;
var machineCount;
var closeMachinesBtn;
var machineForm;
var machineCode;
var machineSubmitBtn;
var cancelMachineBtn;
var machineFormMessage;
var manageCount;
var machinesEmpty;
var machinesList;
var openMachinesBtn;

var dateLabel;
var datePicker;
var prevDayBtn;
var nextDayBtn;
var todayBtn;
var openExportBtn;
var saveStatus;

var setupEmpty;
var dayEmpty;
var dayEmptyText;
var createDayBtn;
var dayContent;

var statTotal;
var statStart;
var statEnd;
var statPending;

var startTab;
var endTab;
var startTabCount;
var endTabCount;
var phaseHint;
var machineSearch;
var checklistList;
var listEmpty;

var exportDialog;
var closeExportBtn;
var exportAllBtn;
var exportForm;
var exportStart;
var exportEnd;
var exportMessage;

function pad2(valor) {
    return String(valor).padStart(2, '0');
}

function dataParaISO(data) {
    return data.getFullYear() + '-' + pad2(data.getMonth() + 1) + '-' + pad2(data.getDate());
}

function isoParaData(iso) {
    var partes = iso.split('-');
    return new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
}

function hojeISO() {
    return dataParaISO(new Date());
}

function dataValidaISO(iso) {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        return false;
    }

    var data = isoParaData(iso);

    return !isNaN(data.getTime()) && dataParaISO(data) === iso;
}

function somarDias(iso, quantidade) {
    var data = isoParaData(iso);
    data.setDate(data.getDate() + quantidade);
    return dataParaISO(data);
}

function formatarDataBR(iso) {
    var partes = iso.split('-');
    return partes[2] + '/' + partes[1] + '/' + partes[0];
}

function formatarDataLonga(iso) {
    var texto = isoParaData(iso).toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    });

    return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function normalizarTimestamp(valor) {
    if (typeof valor === 'number' && isFinite(valor)) {
        return valor;
    }

    if (typeof valor === 'string' && valor !== '') {
        var timestamp = Date.parse(valor);
        return isNaN(timestamp) ? null : timestamp;
    }

    return null;
}

function formatarHora(valor) {
    var timestamp = normalizarTimestamp(valor);

    if (!timestamp) {
        return '';
    }

    var data = new Date(timestamp);
    return pad2(data.getHours()) + ':' + pad2(data.getMinutes());
}

function formatarDataHora(valor) {
    var timestamp = normalizarTimestamp(valor);

    if (!timestamp) {
        return '';
    }

    var data = new Date(timestamp);
    return pad2(data.getDate()) + '/' + pad2(data.getMonth() + 1) + '/' + data.getFullYear() +
        ' ' + pad2(data.getHours()) + ':' + pad2(data.getMinutes());
}

function compararCodigos(a, b) {
    return String(a.codigo || '').localeCompare(String(b.codigo || ''), 'pt-BR', {
        numeric: true,
        sensitivity: 'base'
    });
}

function nomePorId(id) {
    var perfil = id ? nomesMapa[id] : null;

    if (!perfil) {
        return '';
    }

    return perfil.nome_completo || perfil.username || '';
}

function descreverAutoria(entrada, fase) {
    var marcado = fase === 'inicio' ? entrada.inicio : entrada.fim;

    if (!marcado) {
        return '';
    }

    var nome = nomePorId(fase === 'inicio' ? entrada.inicioPor : entrada.fimPor);
    var hora = formatarHora(fase === 'inicio' ? entrada.inicioEm : entrada.fimEm);
    var partes = [];

    if (nome) {
        partes.push(nome);
    }

    if (hora) {
        partes.push(hora);
    }

    return partes.join(' · ');
}

function normalizarMaquina(bruto) {
    if (!bruto || typeof bruto !== 'object') {
        return null;
    }

    var codigo = typeof bruto.codigo === 'string' ? bruto.codigo.trim() : '';

    if (codigo === '' || !bruto.id) {
        return null;
    }

    return {
        id: bruto.id,
        codigo: codigo,
        ativo: bruto.ativo !== false,
        criadoEm: normalizarTimestamp(bruto.created_at) || Date.now()
    };
}

function indexarMaquinas() {
    maquinasPorId = new Map();

    maquinas.forEach(function (maquina) {
        maquinasPorId.set(maquina.id, maquina);
    });
}

function maquinasAtivas() {
    return maquinas.filter(function (maquina) {
        return maquina.ativo === true;
    });
}

function criarEntradaLocal(maquina) {
    return {
        id: maquina.id,
        codigo: maquina.codigo,
        inicio: false,
        fim: false,
        local: '',
        observacao: '',
        inicioEm: null,
        inicioPor: null,
        fimEm: null,
        fimPor: null
    };
}

function criarDiaLocal(dataISO, ativas) {
    var lista = (ativas || maquinasAtivas()).map(criarEntradaLocal);
    lista.sort(compararCodigos);

    return {
        data: dataISO,
        criadoEm: Date.now(),
        atualizadoEm: Date.now(),
        maquinas: lista
    };
}

async function buscarPaginado(tabela, colunas, colunaOrdem) {
    var acumulado = [];
    var inicio = 0;
    var passo = 1000;

    while (true) {
        var resposta = await cliente
            .from(tabela)
            .select(colunas)
            .order(colunaOrdem, { ascending: true })
            .range(inicio, inicio + passo - 1);

        if (resposta.error) {
            throw resposta.error;
        }

        var dados = resposta.data || [];
        acumulado = acumulado.concat(dados);

        if (dados.length < passo) {
            break;
        }

        inicio += passo;
    }

    return acumulado;
}

async function carregarMaquinas() {
    var dados = await buscarPaginado('machines', 'id, codigo, ativo, created_at', 'id');

    maquinas = dados.map(normalizarMaquina).filter(Boolean);
    maquinas.sort(compararCodigos);
    indexarMaquinas();
}

async function carregarDias() {
    var diasBrutos = await buscarPaginado('checklist_days', 'dia, created_at', 'dia');
    var entradasBrutas = await buscarPaginado(
        'checklist_entries',
        'id, dia, machine_id, inicio, fim, local, observacao, inicio_em, inicio_por, fim_em, fim_por, updated_at',
        'id'
    );

    dias = {};

    diasBrutos.forEach(function (bruto) {
        if (!dataValidaISO(bruto.dia)) {
            return;
        }

        dias[bruto.dia] = {
            data: bruto.dia,
            criadoEm: normalizarTimestamp(bruto.created_at) || Date.now(),
            atualizadoEm: normalizarTimestamp(bruto.created_at) || Date.now(),
            maquinas: []
        };
    });

    entradasBrutas.forEach(function (bruto) {
        var dia = dias[bruto.dia];

        if (!dia || !bruto.machine_id) {
            return;
        }

        var maquina = maquinasPorId.get(bruto.machine_id);

        dia.maquinas.push({
            id: bruto.machine_id,
            codigo: maquina ? maquina.codigo : 'Máquina removida',
            inicio: bruto.inicio === true,
            fim: bruto.fim === true,
            local: typeof bruto.local === 'string' ? bruto.local : '',
            observacao: typeof bruto.observacao === 'string' ? bruto.observacao : '',
            inicioEm: normalizarTimestamp(bruto.inicio_em),
            inicioPor: bruto.inicio_por || null,
            fimEm: normalizarTimestamp(bruto.fim_em),
            fimPor: bruto.fim_por || null
        });
    });

    Object.keys(dias).forEach(function (dataISO) {
        dias[dataISO].maquinas.sort(compararCodigos);
    });
}

async function inserirEntradas(dataISO, ativas) {
    if (!ativas || ativas.length === 0) {
        return;
    }

    var linhas = ativas.map(function (maquina) {
        return {
            dia: dataISO,
            machine_id: maquina.id
        };
    });

    var resposta = await cliente
        .from('checklist_entries')
        .upsert(linhas, { onConflict: 'dia,machine_id', ignoreDuplicates: true });

    if (resposta.error) {
        throw resposta.error;
    }
}

async function criarDiaNoBanco(dataISO, ativas) {
    var resposta = await cliente
        .from('checklist_days')
        .upsert(
            { dia: dataISO, created_by: usuarioAtual.id },
            { onConflict: 'dia', ignoreDuplicates: true }
        );

    if (resposta.error) {
        throw resposta.error;
    }

    await inserirEntradas(dataISO, ativas);
}

async function sincronizarDiaHoje() {
    var hoje = hojeISO();
    var ativas = maquinasAtivas();

    if (ativas.length === 0) {
        return false;
    }

    var dia = dias[hoje];

    if (!dia) {
        await criarDiaNoBanco(hoje, ativas);
        dias[hoje] = criarDiaLocal(hoje, ativas);
        return true;
    }

    var existentes = new Set(dia.maquinas.map(function (entrada) {
        return entrada.id;
    }));

    var faltantes = ativas.filter(function (maquina) {
        return !existentes.has(maquina.id);
    });

    if (faltantes.length > 0) {
        await inserirEntradas(hoje, faltantes);
        faltantes.forEach(function (maquina) {
            dia.maquinas.push(criarEntradaLocal(maquina));
        });
    }

    var alterou = faltantes.length > 0;

    dia.maquinas.forEach(function (entrada) {
        var maquina = maquinasPorId.get(entrada.id);

        if (maquina && entrada.codigo !== maquina.codigo) {
            entrada.codigo = maquina.codigo;
            alterou = true;
        }
    });

    if (alterou) {
        dia.maquinas.sort(compararCodigos);
        dia.atualizadoEm = Date.now();
    }

    return alterou;
}

function definirStatusSalvamento(texto, tipo) {
    if (!saveStatus) {
        return;
    }

    saveStatus.textContent = texto;
    saveStatus.className = 'save-status' + (tipo ? ' ' + tipo : '');
}

function chaveEntrada(diaISO, machineId) {
    return diaISO + '|' + machineId;
}

function atualizarStatusGlobal() {
    if (salvarTimers.size > 0 || salvarFilas.size > 0) {
        return;
    }

    if (salvarErros.size > 0) {
        definirStatusSalvamento('Não foi possível salvar', 'erro');
        return;
    }

    definirStatusSalvamento('Salvo às ' + formatarHora(Date.now()), 'salvo');
}

async function salvarEntrada(diaISO, machineId) {
    var dia = dias[diaISO];

    if (!dia) {
        return false;
    }

    var entrada = dia.maquinas.find(function (item) {
        return item.id === machineId;
    });

    if (!entrada) {
        return false;
    }

    var chave = chaveEntrada(diaISO, machineId);
    var campos = camposPendentes.get(chave);

    if (!campos || campos.size === 0) {
        return true;
    }

    var pendentes = Array.from(campos);
    camposPendentes.delete(chave);

    var linha = {
        dia: diaISO,
        machine_id: machineId
    };

    if (pendentes.indexOf('inicio') !== -1) {
        linha.inicio = entrada.inicio === true;
    }

    if (pendentes.indexOf('fim') !== -1) {
        linha.fim = entrada.fim === true;
    }

    if (pendentes.indexOf('local') !== -1) {
        linha.local = entrada.local || '';
    }

    if (pendentes.indexOf('observacao') !== -1) {
        linha.observacao = entrada.observacao || '';
    }

    try {
        var resposta = await cliente
            .from('checklist_entries')
            .upsert(linha, { onConflict: 'dia,machine_id' });

        if (resposta.error) {
            throw resposta.error;
        }

        salvarErros.delete(chave);
        return true;
    } catch (erro) {
        console.error('Não foi possível salvar o checklist.', erro);

        var restantes = camposPendentes.get(chave);

        if (!restantes) {
            restantes = new Set();
            camposPendentes.set(chave, restantes);
        }

        pendentes.forEach(function (campo) {
            restantes.add(campo);
        });

        salvarErros.add(chave);
        return false;
    }
}

function executarSalvamento(diaISO, machineId) {
    var chave = chaveEntrada(diaISO, machineId);
    var anterior = salvarFilas.get(chave) || Promise.resolve();

    var proxima = anterior
        .catch(function () {
            return false;
        })
        .then(function () {
            return salvarEntrada(diaISO, machineId);
        });

    salvarFilas.set(chave, proxima);

    proxima.then(function () {
        if (salvarFilas.get(chave) === proxima) {
            salvarFilas.delete(chave);
        }

        atualizarStatusGlobal();
    });
}

function agendarSalvamento(diaISO, machineId, campo) {
    var chave = chaveEntrada(diaISO, machineId);
    var campos = camposPendentes.get(chave);

    if (!campos) {
        campos = new Set();
        camposPendentes.set(chave, campos);
    }

    if (campo) {
        campos.add(campo);
    }

    salvarErros.delete(chave);
    definirStatusSalvamento('Salvando...', 'salvando');

    if (salvarTimers.has(chave)) {
        window.clearTimeout(salvarTimers.get(chave));
    }

    salvarTimers.set(chave, window.setTimeout(function () {
        salvarTimers.delete(chave);
        executarSalvamento(diaISO, machineId);
    }, 450));
}

function flushSalvamentos() {
    var pendentes = Array.from(salvarTimers.keys());

    pendentes.forEach(function (chave) {
        var timer = salvarTimers.get(chave);
        window.clearTimeout(timer);
        salvarTimers.delete(chave);

        var partes = chave.split('|');
        executarSalvamento(partes[0], partes[1]);
    });
}

function registrarAuditoria(acao, entidade, entidadeId, detalhe) {
    if (!cliente) {
        return;
    }

    cliente
        .rpc('registrar_auditoria', {
            p_acao: acao,
            p_entidade: entidade || null,
            p_entidade_id: entidadeId === null || typeof entidadeId === 'undefined' ? null : String(entidadeId),
            p_detalhe: detalhe || {}
        })
        .then(function (resposta) {
            if (resposta.error) {
                console.warn('Não foi possível registrar a auditoria.', resposta.error);
            }
        })
        .catch(function (erro) {
            console.warn('Não foi possível registrar a auditoria.', erro);
        });
}

function aplicarMensagem(elemento, texto, tipo) {
    elemento.textContent = texto;
    elemento.className = 'form-message' + (tipo ? ' ' + tipo : '');
}

function mostrarMensagemMaquina(texto, tipo) {
    aplicarMensagem(machineFormMessage, texto, tipo);

    if (mensagemMaquinaTimer) {
        window.clearTimeout(mensagemMaquinaTimer);
        mensagemMaquinaTimer = null;
    }

    if (tipo === 'sucesso') {
        mensagemMaquinaTimer = window.setTimeout(function () {
            limparMensagemMaquina();
        }, 3500);
    }
}

function limparMensagemMaquina() {
    aplicarMensagem(machineFormMessage, '', '');

    if (mensagemMaquinaTimer) {
        window.clearTimeout(mensagemMaquinaTimer);
        mensagemMaquinaTimer = null;
    }
}

function mostrarMensagemExportacao(texto, tipo) {
    aplicarMensagem(exportMessage, texto, tipo);

    if (mensagemExportTimer) {
        window.clearTimeout(mensagemExportTimer);
        mensagemExportTimer = null;
    }

    if (tipo === 'sucesso') {
        mensagemExportTimer = window.setTimeout(function () {
            limparMensagemExportacao();
        }, 5000);
    }
}

function limparMensagemExportacao() {
    aplicarMensagem(exportMessage, '', '');

    if (mensagemExportTimer) {
        window.clearTimeout(mensagemExportTimer);
        mensagemExportTimer = null;
    }
}

function configurarSetupVazio() {
    var titulo = setupEmpty.querySelector('h3');
    var texto = setupEmpty.querySelector('p');

    if (ehGestor) {
        if (titulo) {
            titulo.textContent = 'Cadastre as máquinas da empresa';
        }
        if (texto) {
            texto.textContent = 'Adicione os códigos internos para gerar automaticamente o checklist de cada dia.';
        }
        openMachinesBtn.hidden = false;
        return;
    }

    if (titulo) {
        titulo.textContent = 'Nenhuma máquina cadastrada';
    }
    if (texto) {
        texto.textContent = 'Peça a um gestor para cadastrar as máquinas da empresa.';
    }
    openMachinesBtn.hidden = true;
}

function renderizarMaquinas() {
    var ativas = maquinasAtivas();
    var total = ativas.length;
    var rotulo = total === 1 ? '1 máquina' : total + ' máquinas';

    machineCount.textContent = rotulo;
    manageCount.textContent = String(total);
    menuBadge.textContent = String(total);
    menuBadge.hidden = total === 0;
    menuToggle.hidden = !ehGestor;
    menuToggle.setAttribute(
        'aria-label',
        total === 0
            ? 'Abrir cadastro de máquinas, nenhuma máquina ativa'
            : 'Abrir cadastro de máquinas, ' + rotulo
    );

    machinesList.replaceChildren();
    machinesEmpty.hidden = total > 0;
    machinesEmpty.textContent = maquinas.length > 0
        ? 'Nenhuma máquina ativa no momento.'
        : 'Nenhuma máquina cadastrada ainda.';

    var fragmento = document.createDocumentFragment();

    ativas.forEach(function (maquina) {
        var item = document.createElement('div');
        item.className = 'manage-item';

        if (maquina.id === maquinaEmEdicaoId) {
            item.classList.add('is-editing');
        }

        var codigo = document.createElement('span');
        codigo.className = 'manage-code';
        codigo.textContent = maquina.codigo;

        var acoes = document.createElement('div');
        acoes.className = 'manage-actions';

        var editar = document.createElement('button');
        editar.type = 'button';
        editar.className = 'btn-small';
        editar.textContent = 'Editar';
        editar.setAttribute('aria-label', 'Editar a máquina ' + maquina.codigo);
        editar.addEventListener('click', function () {
            iniciarEdicaoMaquina(maquina.id);
        });

        var desativar = document.createElement('button');
        desativar.type = 'button';
        desativar.className = 'icon-btn';
        desativar.textContent = '×';
        desativar.title = 'Desativar máquina';
        desativar.setAttribute('aria-label', 'Desativar a máquina ' + maquina.codigo);
        desativar.addEventListener('click', function () {
            void desativarMaquina(maquina.id);
        });

        acoes.appendChild(editar);
        acoes.appendChild(desativar);
        item.appendChild(codigo);
        item.appendChild(acoes);
        fragmento.appendChild(item);
    });

    machinesList.appendChild(fragmento);
}

function resetarFormularioMaquina() {
    maquinaEmEdicaoId = null;
    machineCode.value = '';
    machineCode.removeAttribute('aria-invalid');
    machineSubmitBtn.textContent = 'Adicionar';
    cancelMachineBtn.hidden = true;
    limparMensagemMaquina();
}

function iniciarEdicaoMaquina(id) {
    var maquina = maquinas.find(function (item) {
        return item.id === id && item.ativo === true;
    });

    if (!maquina) {
        return;
    }

    maquinaEmEdicaoId = id;
    machineCode.value = maquina.codigo;
    machineCode.removeAttribute('aria-invalid');
    machineSubmitBtn.textContent = 'Salvar';
    cancelMachineBtn.hidden = false;
    limparMensagemMaquina();
    renderizarMaquinas();
    machineCode.focus();
    machineCode.select();
}

function cancelarEdicaoMaquina() {
    resetarFormularioMaquina();
    renderizarMaquinas();
    machineCode.focus();
}

function atualizarCodigosNosDias() {
    Object.keys(dias).forEach(function (dataISO) {
        dias[dataISO].maquinas.forEach(function (entrada) {
            var maquina = maquinasPorId.get(entrada.id);

            if (maquina) {
                entrada.codigo = maquina.codigo;
            }
        });
    });
}

async function enviarMaquina(evento) {
    evento.preventDefault();

    if (!ehGestor) {
        return;
    }

    var codigo = machineCode.value.trim();

    if (codigo === '') {
        machineCode.setAttribute('aria-invalid', 'true');
        machineCode.focus();
        mostrarMensagemMaquina('Informe o código da máquina.', 'erro');
        return;
    }

    var duplicada = maquinas.some(function (maquina) {
        return maquina.id !== maquinaEmEdicaoId &&
            maquina.codigo.toLowerCase() === codigo.toLowerCase();
    });

    if (duplicada) {
        machineCode.setAttribute('aria-invalid', 'true');
        machineCode.focus();
        mostrarMensagemMaquina('Esse código já está cadastrado.', 'erro');
        return;
    }

    var editando = maquinaEmEdicaoId !== null;
    var mensagem = editando ? 'Código atualizado.' : 'Máquina adicionada.';
    var aviso = '';

    machineSubmitBtn.disabled = true;

    try {
        if (editando) {
            var atual = maquinas.find(function (item) {
                return item.id === maquinaEmEdicaoId;
            });

            var respostaEdicao = await cliente
                .from('machines')
                .update({ codigo: codigo })
                .eq('id', maquinaEmEdicaoId);

            if (respostaEdicao.error) {
                throw respostaEdicao.error;
            }

            if (atual) {
                atual.codigo = codigo;
            }

            indexarMaquinas();
            atualizarCodigosNosDias();
            registrarAuditoria('editar_maquina', 'machines', maquinaEmEdicaoId, { codigo: codigo });
        } else {
            var respostaInsercao = await cliente
                .from('machines')
                .insert({ codigo: codigo, created_by: usuarioAtual.id })
                .select('id, codigo, ativo, created_at')
                .single();

            if (respostaInsercao.error) {
                throw respostaInsercao.error;
            }

            var nova = normalizarMaquina(respostaInsercao.data);

            if (nova) {
                maquinas.push(nova);
                maquinas.sort(compararCodigos);
                indexarMaquinas();
                registrarAuditoria('criar_maquina', 'machines', nova.id, { codigo: nova.codigo });
            }
        }

        try {
            await sincronizarDiaHoje();
        } catch (erroSincronizacao) {
            console.error('Não foi possível atualizar o checklist de hoje.', erroSincronizacao);
            aviso = 'Máquina salva, mas não foi possível atualizar o checklist de hoje.';
        }

        resetarFormularioMaquina();
        renderizarMaquinas();
        renderizarDia();
        mostrarMensagemMaquina(aviso || mensagem, aviso ? 'erro' : 'sucesso');
        machineCode.focus();
    } catch (erro) {
        console.error('Não foi possível salvar a máquina.', erro);

        if (erro && erro.code === '23505') {
            mostrarMensagemMaquina('Esse código já está cadastrado.', 'erro');
        } else {
            mostrarMensagemMaquina('Não foi possível salvar a máquina. Tente novamente.', 'erro');
        }
    } finally {
        machineSubmitBtn.disabled = false;
    }
}

async function desativarMaquina(id) {
    if (!ehGestor) {
        return;
    }

    var maquina = maquinas.find(function (item) {
        return item.id === id;
    });

    if (!maquina) {
        return;
    }

    if (!window.confirm('Desativar a máquina "' + maquina.codigo + '"? O histórico anterior será mantido.')) {
        return;
    }

    try {
        var resposta = await cliente
            .from('machines')
            .update({ ativo: false })
            .eq('id', id);

        if (resposta.error) {
            throw resposta.error;
        }

        maquina.ativo = false;
        indexarMaquinas();

        if (maquinaEmEdicaoId === id) {
            resetarFormularioMaquina();
        }

        registrarAuditoria('desativar_maquina', 'machines', id, { codigo: maquina.codigo });

        renderizarMaquinas();
        renderizarDia();
        mostrarMensagemMaquina('Máquina desativada. O histórico anterior foi mantido.', 'sucesso');
    } catch (erro) {
        console.error('Não foi possível desativar a máquina.', erro);
        mostrarMensagemMaquina('Não foi possível desativar a máquina. Tente novamente.', 'erro');
    }
}

function atualizarResumo(dia) {
    var total = dia.maquinas.length;
    var inicio = 0;
    var fim = 0;
    var pendentes = 0;

    dia.maquinas.forEach(function (entrada) {
        if (entrada.inicio) {
            inicio++;
        }

        if (entrada.fim) {
            fim++;
        }

        if (!entrada.inicio || !entrada.fim) {
            pendentes++;
        }
    });

    statTotal.textContent = String(total);
    statStart.textContent = inicio + '/' + total;
    statEnd.textContent = fim + '/' + total;
    statPending.textContent = String(pendentes);
    startTabCount.textContent = inicio + '/' + total;
    endTabCount.textContent = fim + '/' + total;
}

function renderizarAbas(dia) {
    var inicioAtivo = faseAtiva === 'inicio';

    startTab.classList.toggle('is-active', inicioAtivo);
    endTab.classList.toggle('is-active', !inicioAtivo);
    startTab.setAttribute('aria-selected', inicioAtivo ? 'true' : 'false');
    endTab.setAttribute('aria-selected', inicioAtivo ? 'false' : 'true');
    startTab.tabIndex = inicioAtivo ? 0 : -1;
    endTab.tabIndex = inicioAtivo ? -1 : 0;
    checklistList.setAttribute('aria-labelledby', inicioAtivo ? 'startTab' : 'endTab');

    if (inicioAtivo) {
        phaseHint.textContent = 'Marque as máquinas conferidas no início do dia. Local e observação podem ser preenchidos a qualquer momento.';
    } else {
        phaseHint.textContent = 'Marque as máquinas conferidas no fim do dia. Local e observação são compartilhados com o checklist de início.';
    }

    atualizarResumo(dia);
}

function criarLinhaMaquina(dia, entrada, fase) {
    var marcado = fase === 'inicio' ? entrada.inicio : entrada.fim;
    var linha = document.createElement('div');
    linha.className = 'machine-row';

    if (marcado) {
        linha.classList.add('is-checked');
    }

    var principal = document.createElement('div');
    principal.className = 'machine-row-main';

    var rotulo = document.createElement('label');
    rotulo.className = 'machine-check';

    var checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = marcado;
    checkbox.setAttribute(
        'aria-label',
        'Conferir ' + entrada.codigo + ' no ' + (fase === 'inicio' ? 'início' : 'fim') + ' do dia'
    );

    var caixa = document.createElement('span');
    caixa.className = 'check-box';
    caixa.setAttribute('aria-hidden', 'true');

    var codigo = document.createElement('span');
    codigo.className = 'machine-code';
    codigo.textContent = entrada.codigo;

    rotulo.appendChild(checkbox);
    rotulo.appendChild(caixa);
    rotulo.appendChild(codigo);

    var statusWrap = document.createElement('div');
    statusWrap.className = 'machine-status-wrap';

    var status = document.createElement('span');
    status.className = 'machine-status';

    var autor = document.createElement('span');
    autor.className = 'machine-author';

    statusWrap.appendChild(status);
    statusWrap.appendChild(autor);

    function atualizarLinha() {
        var conferido = fase === 'inicio' ? entrada.inicio : entrada.fim;
        var textoAutor = descreverAutoria(entrada, fase);

        linha.classList.toggle('is-checked', conferido);
        status.textContent = conferido ? 'Conferido' : 'Pendente';
        autor.textContent = textoAutor;
        autor.hidden = textoAutor === '';
        autor.title = textoAutor;
    }

    atualizarLinha();

    checkbox.addEventListener('change', function (evento) {
        var conferido = evento.target.checked;

        entrada[fase] = conferido;
        entrada[fase + 'Em'] = conferido ? Date.now() : null;
        entrada[fase + 'Por'] = conferido ? usuarioAtual.id : null;

        atualizarLinha();
        atualizarResumo(dia);
        agendarSalvamento(dia.data, entrada.id, fase);
    });

    principal.appendChild(rotulo);
    principal.appendChild(statusWrap);

    var detalhes = document.createElement('div');
    detalhes.className = 'machine-details';

    var campoLocal = document.createElement('label');
    campoLocal.className = 'machine-field';

    var rotuloLocal = document.createElement('span');
    rotuloLocal.textContent = 'Local / destino';

    var inputLocal = document.createElement('input');
    inputLocal.type = 'text';
    inputLocal.className = 'local-input';
    inputLocal.value = entrada.local;
    inputLocal.placeholder = 'Para onde a máquina foi?';
    inputLocal.maxLength = 120;
    inputLocal.autocomplete = 'off';
    inputLocal.setAttribute('aria-label', 'Local ou destino da máquina ' + entrada.codigo);

    inputLocal.addEventListener('input', function (evento) {
        entrada.local = evento.target.value;
        agendarSalvamento(dia.data, entrada.id, 'local');
    });

    campoLocal.appendChild(rotuloLocal);
    campoLocal.appendChild(inputLocal);

    var campoObservacao = document.createElement('label');
    campoObservacao.className = 'machine-field';

    var rotuloObservacao = document.createElement('span');
    rotuloObservacao.textContent = 'Observação';

    var inputObservacao = document.createElement('input');
    inputObservacao.type = 'text';
    inputObservacao.className = 'observation-input';
    inputObservacao.value = entrada.observacao;
    inputObservacao.placeholder = 'Alguma observação?';
    inputObservacao.maxLength = 200;
    inputObservacao.autocomplete = 'off';
    inputObservacao.setAttribute('aria-label', 'Observação da máquina ' + entrada.codigo);

    inputObservacao.addEventListener('input', function (evento) {
        entrada.observacao = evento.target.value;
        agendarSalvamento(dia.data, entrada.id, 'observacao');
    });

    campoObservacao.appendChild(rotuloObservacao);
    campoObservacao.appendChild(inputObservacao);

    detalhes.appendChild(campoLocal);
    detalhes.appendChild(campoObservacao);
    linha.appendChild(principal);
    linha.appendChild(detalhes);

    return linha;
}

function renderizarLista(dia) {
    var termo = machineSearch.value.trim().toLowerCase();
    var lista = dia.maquinas.slice().sort(compararCodigos).filter(function (entrada) {
        return termo === '' || entrada.codigo.toLowerCase().indexOf(termo) !== -1;
    });

    checklistList.replaceChildren();

    if (lista.length === 0) {
        checklistList.hidden = true;
        listEmpty.hidden = false;
        listEmpty.textContent = dia.maquinas.length === 0
            ? 'Nenhuma máquina neste checklist.'
            : 'Nenhuma máquina encontrada com esse código.';
        return;
    }

    checklistList.hidden = false;
    listEmpty.hidden = true;

    var fragmento = document.createDocumentFragment();

    lista.forEach(function (entrada) {
        fragmento.appendChild(criarLinhaMaquina(dia, entrada, faseAtiva));
    });

    checklistList.appendChild(fragmento);
}

function renderizarDia() {
    var hoje = hojeISO();
    var dia = dias[dataSelecionada];
    var ativas = maquinasAtivas();

    dateLabel.textContent = formatarDataLonga(dataSelecionada);
    datePicker.value = dataSelecionada;
    datePicker.max = hoje;
    nextDayBtn.disabled = dataSelecionada >= hoje;
    todayBtn.disabled = dataSelecionada === hoje;

    if (!dia && ativas.length === 0) {
        setupEmpty.hidden = false;
        dayEmpty.hidden = true;
        dayContent.hidden = true;
        saveStatus.hidden = true;
        configurarSetupVazio();
        return;
    }

    if (!dia) {
        setupEmpty.hidden = true;
        dayEmpty.hidden = false;
        dayContent.hidden = true;
        saveStatus.hidden = true;
        createDayBtn.hidden = ativas.length === 0;

        if (ativas.length === 0) {
            dayEmptyText.textContent = 'Nenhuma máquina ativa. Peça a um gestor para cadastrar ou reativar máquinas.';
        } else {
            dayEmptyText.textContent = 'Nenhum checklist registrado em ' + formatarDataBR(dataSelecionada) + '.';
        }

        return;
    }

    setupEmpty.hidden = true;
    dayEmpty.hidden = true;
    dayContent.hidden = false;
    saveStatus.hidden = false;
    renderizarAbas(dia);
    renderizarLista(dia);
}

function selecionarFase(fase) {
    if (fase !== 'inicio' && fase !== 'fim') {
        return;
    }

    faseAtiva = fase;

    var dia = dias[dataSelecionada];

    if (!dia) {
        return;
    }

    renderizarAbas(dia);
    renderizarLista(dia);
}

function mudarData(novaData) {
    if (!dataValidaISO(novaData)) {
        return;
    }

    var hoje = hojeISO();

    if (novaData > hoje) {
        novaData = hoje;
    }

    flushSalvamentos();
    dataSelecionada = novaData;
    machineSearch.value = '';
    renderizarDia();
}

async function criarChecklistDoDia() {
    var ativas = maquinasAtivas();

    if (dias[dataSelecionada]) {
        renderizarDia();
        return;
    }

    if (ativas.length === 0) {
        renderizarDia();
        return;
    }

    createDayBtn.disabled = true;
    dayEmptyText.textContent = 'Criando checklist...';

    try {
        await criarDiaNoBanco(dataSelecionada, ativas);
        dias[dataSelecionada] = criarDiaLocal(dataSelecionada, ativas);
        renderizarDia();
        definirStatusSalvamento('Checklist criado.', 'salvo');
    } catch (erro) {
        console.error('Não foi possível criar o checklist.', erro);
        dayEmptyText.textContent = 'Não foi possível criar o checklist. Tente novamente.';
    } finally {
        createDayBtn.disabled = false;
    }
}

function obterDiasParaExportacao(inicio, fim) {
    return Object.keys(dias)
        .filter(function (dataISO) {
            return dataISO >= inicio && dataISO <= fim && dias[dataISO].maquinas.length > 0;
        })
        .sort()
        .map(function (dataISO) {
            return dias[dataISO];
        });
}

function escaparCSV(valor) {
    var texto = valor === null || typeof valor === 'undefined' ? '' : String(valor);

    if (/[";\r\n]/.test(texto)) {
        return '"' + texto.replace(/"/g, '""') + '"';
    }

    return texto;
}

function gerarCSV(registros) {
    var linhas = [[
        'Data',
        'Código da máquina',
        'Início',
        'Início por',
        'Início em',
        'Fim',
        'Fim por',
        'Fim em',
        'Local',
        'Observação'
    ]];

    registros.forEach(function (dia) {
        dia.maquinas.slice().sort(compararCodigos).forEach(function (entrada) {
            linhas.push([
                formatarDataBR(dia.data),
                entrada.codigo,
                entrada.inicio ? 'Conferido' : 'Pendente',
                nomePorId(entrada.inicioPor),
                formatarDataHora(entrada.inicioEm),
                entrada.fim ? 'Conferido' : 'Pendente',
                nomePorId(entrada.fimPor),
                formatarDataHora(entrada.fimEm),
                entrada.local,
                entrada.observacao
            ]);
        });
    });

    return {
        conteudo: '\uFEFF' + linhas.map(function (linha) {
            return linha.map(escaparCSV).join(';');
        }).join('\r\n'),
        total: linhas.length - 1
    };
}

function baixarCSV(conteudo, nomeArquivo) {
    var blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');

    link.href = url;
    link.download = nomeArquivo;
    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(function () {
        URL.revokeObjectURL(url);
    }, 1000);
}

function exportarTudo() {
    var registros = obterDiasParaExportacao('0000-01-01', '9999-12-31');

    if (registros.length === 0) {
        mostrarMensagemExportacao('Nenhum checklist registrado para exportar.', 'erro');
        return;
    }

    var csv = gerarCSV(registros);

    baixarCSV(csv.conteudo, 'checklist-maquinas-completo-' + hojeISO() + '.csv');
    mostrarMensagemExportacao(
        'CSV gerado com ' + csv.total + (csv.total === 1 ? ' registro.' : ' registros.'),
        'sucesso'
    );
    registrarAuditoria('exportar_checklist', 'checklist', null, {
        inicio: 'todos',
        fim: hojeISO(),
        registros: csv.total
    });
}

function exportarIntervalo(evento) {
    evento.preventDefault();

    var inicio = exportStart.value;
    var fim = exportEnd.value;

    if (!dataValidaISO(inicio) || !dataValidaISO(fim)) {
        mostrarMensagemExportacao('Informe a data inicial e a data final.', 'erro');
        return;
    }

    if (inicio > fim) {
        mostrarMensagemExportacao('A data inicial não pode ser posterior à data final.', 'erro');
        return;
    }

    if (inicio > hojeISO() || fim > hojeISO()) {
        mostrarMensagemExportacao('Escolha datas até hoje.', 'erro');
        return;
    }

    var registros = obterDiasParaExportacao(inicio, fim);

    if (registros.length === 0) {
        mostrarMensagemExportacao('Nenhum checklist encontrado nesse intervalo.', 'erro');
        return;
    }

    var csv = gerarCSV(registros);

    baixarCSV(csv.conteudo, 'checklist-maquinas-' + inicio + '-a-' + fim + '.csv');
    mostrarMensagemExportacao(
        'CSV gerado com ' + csv.total + (csv.total === 1 ? ' registro.' : ' registros.'),
        'sucesso'
    );
    registrarAuditoria('exportar_checklist', 'checklist', null, {
        inicio: inicio,
        fim: fim,
        registros: csv.total
    });
}

function abrirDialogo(dialogo) {
    if (dialogo.open) {
        return;
    }

    dialogo.showModal();
    document.body.classList.add('dialog-open');
}

function fecharDialogo(dialogo, foco) {
    if (dialogo.open) {
        dialogo.close();
    }

    document.body.classList.remove('dialog-open');

    if (foco) {
        window.setTimeout(function () {
            foco.focus();
        }, 0);
    }
}

function abrirCadastroMaquinas() {
    if (!ehGestor) {
        return;
    }

    abrirDialogo(machinesMenu);
    menuToggle.setAttribute('aria-expanded', 'true');
}

function fecharCadastroMaquinas() {
    fecharDialogo(machinesMenu, menuToggle);
    menuToggle.setAttribute('aria-expanded', 'false');
}

function abrirExportacao() {
    var hoje = hojeISO();

    exportStart.max = hoje;
    exportEnd.max = hoje;

    if (exportStart.value === '') {
        exportStart.value = somarDias(hoje, -6);
    }

    if (exportEnd.value === '') {
        exportEnd.value = hoje;
    }

    limparMensagemExportacao();
    abrirDialogo(exportDialog);
    openExportBtn.setAttribute('aria-expanded', 'true');
}

function fecharExportacao() {
    fecharDialogo(exportDialog, openExportBtn);
    openExportBtn.setAttribute('aria-expanded', 'false');
}

function tratarTecladoAbas(evento) {
    if (evento.key !== 'ArrowLeft' && evento.key !== 'ArrowRight') {
        return;
    }

    evento.preventDefault();

    var novaFase = faseAtiva === 'inicio' ? 'fim' : 'inicio';
    selecionarFase(novaFase);

    if (novaFase === 'inicio') {
        startTab.focus();
    } else {
        endTab.focus();
    }
}

function atribuirElementos() {
    menuToggle = document.getElementById('menuToggle');
    menuBadge = document.getElementById('menuBadge');
    machinesMenu = document.getElementById('machinesMenu');
    machineCount = document.getElementById('machineCount');
    closeMachinesBtn = document.getElementById('closeMachinesBtn');
    machineForm = document.getElementById('machineForm');
    machineCode = document.getElementById('machineCode');
    machineSubmitBtn = document.getElementById('machineSubmitBtn');
    cancelMachineBtn = document.getElementById('cancelMachineBtn');
    machineFormMessage = document.getElementById('machineFormMessage');
    manageCount = document.getElementById('manageCount');
    machinesEmpty = document.getElementById('machinesEmpty');
    machinesList = document.getElementById('machinesList');

    dateLabel = document.getElementById('dateLabel');
    datePicker = document.getElementById('datePicker');
    prevDayBtn = document.getElementById('prevDayBtn');
    nextDayBtn = document.getElementById('nextDayBtn');
    todayBtn = document.getElementById('todayBtn');
    openExportBtn = document.getElementById('openExportBtn');
    saveStatus = document.getElementById('saveStatus');

    setupEmpty = document.getElementById('setupEmpty');
    openMachinesBtn = document.getElementById('openMachinesBtn');
    dayEmpty = document.getElementById('dayEmpty');
    dayEmptyText = document.getElementById('dayEmptyText');
    createDayBtn = document.getElementById('createDayBtn');
    dayContent = document.getElementById('dayContent');

    statTotal = document.getElementById('statTotal');
    statStart = document.getElementById('statStart');
    statEnd = document.getElementById('statEnd');
    statPending = document.getElementById('statPending');

    startTab = document.getElementById('startTab');
    endTab = document.getElementById('endTab');
    startTabCount = document.getElementById('startTabCount');
    endTabCount = document.getElementById('endTabCount');
    phaseHint = document.getElementById('phaseHint');
    machineSearch = document.getElementById('machineSearch');
    checklistList = document.getElementById('checklistList');
    listEmpty = document.getElementById('listEmpty');

    exportDialog = document.getElementById('exportDialog');
    closeExportBtn = document.getElementById('closeExportBtn');
    exportAllBtn = document.getElementById('exportAllBtn');
    exportForm = document.getElementById('exportForm');
    exportStart = document.getElementById('exportStart');
    exportEnd = document.getElementById('exportEnd');
    exportMessage = document.getElementById('exportMessage');
}

function ligarEventos() {
    menuToggle.addEventListener('click', abrirCadastroMaquinas);
    openMachinesBtn.addEventListener('click', abrirCadastroMaquinas);
    closeMachinesBtn.addEventListener('click', fecharCadastroMaquinas);
    machineForm.addEventListener('submit', function (evento) {
        void enviarMaquina(evento);
    });
    cancelMachineBtn.addEventListener('click', cancelarEdicaoMaquina);

    machineCode.addEventListener('input', function () {
        machineCode.removeAttribute('aria-invalid');
        limparMensagemMaquina();
    });

    machineCode.addEventListener('keydown', function (evento) {
        if (evento.key === 'Escape' && maquinaEmEdicaoId !== null) {
            evento.preventDefault();
            cancelarEdicaoMaquina();
        }
    });

    prevDayBtn.addEventListener('click', function () {
        mudarData(somarDias(dataSelecionada, -1));
    });

    nextDayBtn.addEventListener('click', function () {
        mudarData(somarDias(dataSelecionada, 1));
    });

    todayBtn.addEventListener('click', function () {
        mudarData(hojeISO());
    });

    datePicker.addEventListener('change', function () {
        if (datePicker.value === '') {
            datePicker.value = dataSelecionada;
            return;
        }

        mudarData(datePicker.value);
    });

    createDayBtn.addEventListener('click', function () {
        void criarChecklistDoDia();
    });

    startTab.addEventListener('click', function () {
        selecionarFase('inicio');
    });

    endTab.addEventListener('click', function () {
        selecionarFase('fim');
    });

    startTab.addEventListener('keydown', tratarTecladoAbas);
    endTab.addEventListener('keydown', tratarTecladoAbas);

    machineSearch.addEventListener('input', function () {
        var dia = dias[dataSelecionada];

        if (dia) {
            renderizarLista(dia);
        }
    });

    openExportBtn.addEventListener('click', abrirExportacao);
    closeExportBtn.addEventListener('click', fecharExportacao);
    exportAllBtn.addEventListener('click', exportarTudo);
    exportForm.addEventListener('submit', exportarIntervalo);

    machinesMenu.addEventListener('cancel', function (evento) {
        evento.preventDefault();
        fecharCadastroMaquinas();
    });

    machinesMenu.addEventListener('close', function () {
        document.body.classList.remove('dialog-open');
        menuToggle.setAttribute('aria-expanded', 'false');
    });

    machinesMenu.addEventListener('click', function (evento) {
        if (evento.target === machinesMenu) {
            fecharCadastroMaquinas();
        }
    });

    exportDialog.addEventListener('cancel', function (evento) {
        evento.preventDefault();
        fecharExportacao();
    });

    exportDialog.addEventListener('close', function () {
        document.body.classList.remove('dialog-open');
        openExportBtn.setAttribute('aria-expanded', 'false');
    });

    exportDialog.addEventListener('click', function (evento) {
        if (evento.target === exportDialog) {
            fecharExportacao();
        }
    });

    exportStart.addEventListener('input', limparMensagemExportacao);
    exportEnd.addEventListener('input', limparMensagemExportacao);

    window.addEventListener('beforeunload', flushSalvamentos);

    document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
            flushSalvamentos();
        }
    });
}

async function iniciarChecklist() {
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
    perfilAtual = contexto.profile;
    ehGestor = perfilAtual.role === 'gestor';

    atribuirElementos();

    document.body.classList.add('has-user-menu', 'checklist-page');
    window.OrganizaAuth.renderUserMenu(perfilAtual);

    dataSelecionada = hojeISO();

    var hoje = hojeISO();
    datePicker.max = hoje;
    exportStart.max = hoje;
    exportEnd.max = hoje;
    exportEnd.value = hoje;
    exportStart.value = somarDias(hoje, -6);

    definirStatusSalvamento('Carregando dados...', 'salvando');

    try {
        nomesMapa = await window.OrganizaAuth.carregarNomes();
        await carregarMaquinas();
        await carregarDias();
        await sincronizarDiaHoje();
    } catch (erro) {
        console.error('Não foi possível carregar os dados do checklist.', erro);
        loading.textContent = 'Não foi possível carregar os dados. Recarregue a página.';
        return;
    }

    menuToggle.hidden = !ehGestor;
    openMachinesBtn.hidden = !ehGestor;
    renderizarMaquinas();
    renderizarDia();
    ligarEventos();

    document.querySelector('header.brand').hidden = false;
    document.querySelector('main.app-container').hidden = false;
    document.getElementById('userMenu').hidden = false;
    loading.hidden = true;
}

document.addEventListener('DOMContentLoaded', function () {
    void iniciarChecklist();
});
