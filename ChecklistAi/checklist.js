var STORAGE_MAQUINAS = 'maquinasChecklist';
var STORAGE_DIAS = 'diasChecklist';

var maquinas = [];
var dias = {};
var dataSelecionada = '';
var faseAtiva = 'inicio';
var maquinaEmEdicaoId = null;
var salvarTimer = null;
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

var dateLabel;
var datePicker;
var prevDayBtn;
var nextDayBtn;
var todayBtn;
var openExportBtn;
var saveStatus;

var setupEmpty;
var openMachinesBtn;
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

function gerarId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
    }
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
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

function formatarHora(timestamp) {
    var data = new Date(timestamp);
    return pad2(data.getHours()) + ':' + pad2(data.getMinutes());
}

function compararCodigos(a, b) {
    return a.codigo.localeCompare(b.codigo, 'pt-BR', {
        numeric: true,
        sensitivity: 'base'
    });
}

function normalizarTimestamp(valor) {
    return typeof valor === 'number' && isFinite(valor) ? valor : null;
}

function normalizarMaquina(bruto, idsUsados) {
    if (!bruto || typeof bruto !== 'object') {
        return null;
    }

    var codigo = typeof bruto.codigo === 'string' ? bruto.codigo.trim() : '';

    if (codigo === '') {
        return null;
    }

    var id = typeof bruto.id === 'string' && bruto.id !== '' ? bruto.id : gerarId();

    while (idsUsados.has(id)) {
        id = gerarId();
    }

    idsUsados.add(id);

    return {
        id: id,
        codigo: codigo,
        criadoEm: normalizarTimestamp(bruto.criadoEm) || Date.now()
    };
}

function normalizarMaquinaDoDia(bruto, idsUsados) {
    if (!bruto || typeof bruto !== 'object') {
        return null;
    }

    var codigo = typeof bruto.codigo === 'string' ? bruto.codigo.trim() : '';

    if (codigo === '') {
        return null;
    }

    var id = typeof bruto.id === 'string' && bruto.id !== '' ? bruto.id : gerarId();

    while (idsUsados.has(id)) {
        id = gerarId();
    }

    idsUsados.add(id);

    return {
        id: id,
        codigo: codigo,
        inicio: bruto.inicio === true,
        fim: bruto.fim === true,
        local: typeof bruto.local === 'string' ? bruto.local.trim() : '',
        observacao: typeof bruto.observacao === 'string' ? bruto.observacao.trim() : '',
        inicioEm: normalizarTimestamp(bruto.inicioEm),
        fimEm: normalizarTimestamp(bruto.fimEm)
    };
}

function normalizarDia(bruto, dataISO) {
    if (!bruto || typeof bruto !== 'object' || !Array.isArray(bruto.maquinas)) {
        return null;
    }

    var idsUsados = new Set();
    var lista = [];

    bruto.maquinas.forEach(function (item) {
        var maquina = normalizarMaquinaDoDia(item, idsUsados);

        if (maquina) {
            lista.push(maquina);
        }
    });

    if (lista.length === 0) {
        return null;
    }

    lista.sort(compararCodigos);

    return {
        data: dataISO,
        criadoEm: normalizarTimestamp(bruto.criadoEm) || Date.now(),
        atualizadoEm: normalizarTimestamp(bruto.atualizadoEm) || Date.now(),
        maquinas: lista
    };
}

function lerMaquinas() {
    try {
        var salvos = JSON.parse(localStorage.getItem(STORAGE_MAQUINAS) || '[]');

        if (!Array.isArray(salvos)) {
            return [];
        }

        var idsUsados = new Set();
        var codigosUsados = new Set();
        var lista = [];

        salvos.forEach(function (bruto) {
            var maquina = normalizarMaquina(bruto, idsUsados);

            if (!maquina) {
                return;
            }

            var chave = maquina.codigo.toLowerCase();

            if (codigosUsados.has(chave)) {
                return;
            }

            codigosUsados.add(chave);
            lista.push(maquina);
        });

        lista.sort(compararCodigos);
        return lista;
    } catch (erro) {
        console.warn('Não foi possível ler as máquinas cadastradas.', erro);
        return [];
    }
}

function lerDias() {
    try {
        var bruto = JSON.parse(localStorage.getItem(STORAGE_DIAS) || '{}');

        if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) {
            return {};
        }

        var resultado = {};

        Object.keys(bruto).forEach(function (dataISO) {
            if (!dataValidaISO(dataISO)) {
                return;
            }

            var dia = normalizarDia(bruto[dataISO], dataISO);

            if (dia) {
                resultado[dataISO] = dia;
            }
        });

        return resultado;
    } catch (erro) {
        console.warn('Não foi possível ler os checklists salvos.', erro);
        return {};
    }
}

function salvarMaquinas() {
    try {
        localStorage.setItem(STORAGE_MAQUINAS, JSON.stringify(maquinas));
        return true;
    } catch (erro) {
        console.warn('Não foi possível salvar as máquinas.', erro);
        return false;
    }
}

function salvarDias() {
    try {
        localStorage.setItem(STORAGE_DIAS, JSON.stringify(dias));
        return true;
    } catch (erro) {
        console.warn('Não foi possível salvar os checklists.', erro);
        return false;
    }
}

function definirStatusSalvamento(texto, tipo) {
    saveStatus.textContent = texto;
    saveStatus.className = 'save-status' + (tipo ? ' ' + tipo : '');
}

function agendarSalvamento() {
    definirStatusSalvamento('Salvando...', 'salvando');

    if (salvarTimer) {
        window.clearTimeout(salvarTimer);
        salvarTimer = null;
    }

    salvarTimer = window.setTimeout(function () {
        salvarTimer = null;
        salvarDiasAgora();
    }, 250);
}

function salvarDiasAgora() {
    if (salvarTimer) {
        window.clearTimeout(salvarTimer);
        salvarTimer = null;
    }

    var salvou = salvarDias();

    if (salvou) {
        definirStatusSalvamento('Salvo às ' + formatarHora(Date.now()), 'salvo');
    } else {
        definirStatusSalvamento('Não foi possível salvar', 'erro');
    }

    return salvou;
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

function criarMaquinaDoDia(maquina) {
    return {
        id: maquina.id,
        codigo: maquina.codigo,
        inicio: false,
        fim: false,
        local: '',
        observacao: '',
        inicioEm: null,
        fimEm: null
    };
}

function criarDiaChecklist(dataISO) {
    return {
        data: dataISO,
        criadoEm: Date.now(),
        atualizadoEm: Date.now(),
        maquinas: maquinas.map(criarMaquinaDoDia)
    };
}

function sincronizarDiaHoje() {
    var hoje = hojeISO();
    var dia = dias[hoje];

    if (maquinas.length === 0) {
        if (dia) {
            delete dias[hoje];
            return true;
        }

        return false;
    }

    if (!dia) {
        dias[hoje] = criarDiaChecklist(hoje);
        return true;
    }

    var porId = new Map();

    maquinas.forEach(function (maquina) {
        porId.set(maquina.id, maquina);
    });

    var alterou = false;
    var listaAtualizada = [];

    dia.maquinas.forEach(function (entrada) {
        var maquina = porId.get(entrada.id);

        if (!maquina) {
            alterou = true;
            return;
        }

        if (entrada.codigo !== maquina.codigo) {
            entrada.codigo = maquina.codigo;
            alterou = true;
        }

        listaAtualizada.push(entrada);
    });

    maquinas.forEach(function (maquina) {
        var existe = listaAtualizada.some(function (entrada) {
            return entrada.id === maquina.id;
        });

        if (!existe) {
            listaAtualizada.push(criarMaquinaDoDia(maquina));
            alterou = true;
        }
    });

    if (alterou) {
        listaAtualizada.sort(compararCodigos);
        dia.maquinas = listaAtualizada;
        dia.atualizadoEm = Date.now();
    }

    return alterou;
}

function obterDiaAtual() {
    return dias[dataSelecionada] || null;
}

function encontrarMaquinaNoDia(dia, id) {
    return dia.maquinas.find(function (entrada) {
        return entrada.id === id;
    }) || null;
}

function renderizarMaquinas() {
    var total = maquinas.length;
    var rotulo = total === 1 ? '1 máquina' : total + ' máquinas';

    machineCount.textContent = rotulo;
    manageCount.textContent = String(total);
    menuBadge.textContent = String(total);
    menuBadge.hidden = total === 0;
    menuToggle.setAttribute(
        'aria-label',
        total === 0
            ? 'Abrir cadastro de máquinas, nenhuma máquina cadastrada'
            : 'Abrir cadastro de máquinas, ' + rotulo
    );

    machinesList.replaceChildren();
    machinesEmpty.hidden = total > 0;

    var fragmento = document.createDocumentFragment();

    maquinas.forEach(function (maquina) {
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

        var excluir = document.createElement('button');
        excluir.type = 'button';
        excluir.className = 'icon-btn';
        excluir.textContent = '×';
        excluir.title = 'Excluir máquina';
        excluir.setAttribute('aria-label', 'Excluir a máquina ' + maquina.codigo);
        excluir.addEventListener('click', function () {
            excluirMaquina(maquina.id);
        });

        acoes.appendChild(editar);
        acoes.appendChild(excluir);
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
        return item.id === id;
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

function enviarMaquina(evento) {
    evento.preventDefault();

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
    var mensagem = 'Máquina adicionada.';
    var salvouMaquinas;

    if (editando) {
        var maquina = maquinas.find(function (item) {
            return item.id === maquinaEmEdicaoId;
        });

        if (!maquina) {
            resetarFormularioMaquina();
            renderizarMaquinas();
            return;
        }

        maquina.codigo = codigo;
        mensagem = 'Código atualizado.';
    } else {
        maquinas.push({
            id: gerarId(),
            codigo: codigo,
            criadoEm: Date.now()
        });
    }

    maquinas.sort(compararCodigos);
    salvouMaquinas = salvarMaquinas();

    if (sincronizarDiaHoje()) {
        salvarDiasAgora();
    }

    resetarFormularioMaquina();
    renderizarMaquinas();
    renderizarDia();

    if (salvouMaquinas) {
        mostrarMensagemMaquina(mensagem, 'sucesso');
    } else {
        mostrarMensagemMaquina('Alteração feita, mas não foi possível salvar no navegador.', 'erro');
    }

    machineCode.focus();
}

function excluirMaquina(id) {
    var maquina = maquinas.find(function (item) {
        return item.id === id;
    });

    if (!maquina) {
        return;
    }

    if (!window.confirm('Excluir a máquina "' + maquina.codigo + '"? O histórico anterior será mantido.')) {
        return;
    }

    maquinas = maquinas.filter(function (item) {
        return item.id !== id;
    });

    var salvouMaquinas = salvarMaquinas();

    if (sincronizarDiaHoje()) {
        salvarDiasAgora();
    }

    if (maquinaEmEdicaoId === id) {
        resetarFormularioMaquina();
    }

    renderizarMaquinas();
    renderizarDia();

    if (salvouMaquinas) {
        mostrarMensagemMaquina('Máquina excluída. O histórico anterior foi mantido.', 'sucesso');
    } else {
        mostrarMensagemMaquina('Máquina excluída, mas não foi possível salvar no navegador.', 'erro');
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

    var status = document.createElement('span');
    status.className = 'machine-status';
    status.textContent = marcado ? 'Conferido' : 'Pendente';

    checkbox.addEventListener('change', function (evento) {
        var entradaAtual = encontrarMaquinaNoDia(dia, entrada.id);

        if (!entradaAtual) {
            return;
        }

        var conferido = evento.target.checked;
        entradaAtual[fase] = conferido;
        entradaAtual[fase + 'Em'] = conferido ? Date.now() : null;

        linha.classList.toggle('is-checked', conferido);
        status.textContent = conferido ? 'Conferido' : 'Pendente';
        atualizarResumo(dia);
        agendarSalvamento();
    });

    principal.appendChild(rotulo);
    principal.appendChild(status);

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
        var entradaAtual = encontrarMaquinaNoDia(dia, entrada.id);

        if (!entradaAtual) {
            return;
        }

        entradaAtual.local = evento.target.value;
        agendarSalvamento();
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
        var entradaAtual = encontrarMaquinaNoDia(dia, entrada.id);

        if (!entradaAtual) {
            return;
        }

        entradaAtual.observacao = evento.target.value;
        agendarSalvamento();
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
    var dia = obterDiaAtual();

    dateLabel.textContent = formatarDataLonga(dataSelecionada);
    datePicker.value = dataSelecionada;
    datePicker.max = hoje;
    nextDayBtn.disabled = dataSelecionada >= hoje;
    todayBtn.disabled = dataSelecionada === hoje;

    if (maquinas.length === 0) {
        setupEmpty.hidden = false;
        dayEmpty.hidden = true;
        dayContent.hidden = true;
        saveStatus.hidden = true;
        return;
    }

    if (!dia) {
        setupEmpty.hidden = true;
        dayEmpty.hidden = false;
        dayContent.hidden = true;
        saveStatus.hidden = true;
        dayEmptyText.textContent = 'Nenhum checklist registrado em ' + formatarDataBR(dataSelecionada) + '.';
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

    var dia = obterDiaAtual();

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

    if (salvarTimer) {
        salvarDiasAgora();
    }

    dataSelecionada = novaData;
    machineSearch.value = '';

    if (dataSelecionada === hoje && sincronizarDiaHoje()) {
        salvarDiasAgora();
    }

    renderizarDia();
}

function criarChecklistDoDia() {
    if (maquinas.length === 0) {
        abrirCadastroMaquinas();
        return;
    }

    if (dias[dataSelecionada]) {
        renderizarDia();
        return;
    }

    dias[dataSelecionada] = criarDiaChecklist(dataSelecionada);
    salvarDiasAgora();
    renderizarDia();
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
    var linhas = [['Data', 'Código da máquina', 'Início', 'Fim', 'Local', 'Observação']];

    registros.forEach(function (dia) {
        dia.maquinas.slice().sort(compararCodigos).forEach(function (entrada) {
            linhas.push([
                formatarDataBR(dia.data),
                entrada.codigo,
                entrada.inicio ? 'Conferido' : 'Pendente',
                entrada.fim ? 'Conferido' : 'Pendente',
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

function iniciar() {
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

    maquinas = lerMaquinas();
    dias = lerDias();
    dataSelecionada = hojeISO();

    var hoje = hojeISO();
    datePicker.max = hoje;
    exportStart.max = hoje;
    exportEnd.max = hoje;
    exportEnd.value = hoje;
    exportStart.value = somarDias(hoje, -6);

    if (sincronizarDiaHoje()) {
        salvarDias();
    }

    renderizarMaquinas();
    renderizarDia();

    menuToggle.addEventListener('click', abrirCadastroMaquinas);
    openMachinesBtn.addEventListener('click', abrirCadastroMaquinas);
    closeMachinesBtn.addEventListener('click', fecharCadastroMaquinas);
    machineForm.addEventListener('submit', enviarMaquina);
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

    createDayBtn.addEventListener('click', criarChecklistDoDia);

    startTab.addEventListener('click', function () {
        selecionarFase('inicio');
    });

    endTab.addEventListener('click', function () {
        selecionarFase('fim');
    });

    startTab.addEventListener('keydown', tratarTecladoAbas);
    endTab.addEventListener('keydown', tratarTecladoAbas);

    machineSearch.addEventListener('input', function () {
        var dia = obterDiaAtual();

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

    window.addEventListener('beforeunload', function () {
        if (salvarTimer) {
            salvarDias();
        }
    });

    document.addEventListener('visibilitychange', function () {
        if (document.hidden && salvarTimer) {
            salvarDias();
        }
    });
}

iniciar();
