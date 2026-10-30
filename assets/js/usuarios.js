'use strict';

var SENHA_PADRAO = 'Login@123';

var auth = null;
var cliente = null;
var usuarioAtual = null;
var perfilAtual = null;
var usuarios = [];
var editandoId = null;
var statusTimer = null;

var loading;
var userMenu;
var main;
var adminNotice;
var adminStatus;
var usersList;
var usersEmpty;
var userCount;
var userSearch;
var newUserBtn;

var userDialog;
var userDialogTitle;
var closeUserDialog;
var userForm;
var userName;
var userEmail;
var userRole;
var userFormHint;
var userFormMessage;
var saveUserBtn;
var cancelUserBtn;

function mostrarStatus(texto, tipo) {
    if (!adminStatus) {
        return;
    }

    adminStatus.textContent = texto || '';
    adminStatus.className = 'form-message' + (tipo ? ' ' + tipo : '');

    if (statusTimer) {
        window.clearTimeout(statusTimer);
        statusTimer = null;
    }

    if (texto && tipo !== 'error') {
        statusTimer = window.setTimeout(function () {
            adminStatus.textContent = '';
            adminStatus.className = 'form-message';
        }, 5000);
    }
}

function mostrarAviso(texto, tipo) {
    if (!adminNotice) {
        return;
    }

    adminNotice.textContent = texto || '';
    adminNotice.className = 'notice' + (tipo ? ' ' + tipo : '');
    adminNotice.hidden = !texto;
}

function limparAviso() {
    mostrarAviso('', '');
}

function formatarDataHora(valor) {
    if (!valor) {
        return 'Nunca acessou';
    }

    var data = new Date(valor);

    if (isNaN(data.getTime())) {
        return 'Nunca acessou';
    }

    return data.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function rotuloRole(role) {
    return role === 'gestor' ? 'Gestor' : 'Operador';
}

function ehMesmoUsuario(usuario) {
    return !!usuario && !!usuarioAtual && usuario.id === usuarioAtual.id;
}

function nomeExibicao(usuario) {
    return usuario.nome_completo || usuario.username || usuario.email || 'Usuário';
}

function baseUsername(email, nome) {
    var fonte = String(email || '').split('@')[0] || String(nome || '');
    var base = fonte
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '.')
        .replace(/^[._-]+|[._-]+$/g, '')
        .slice(0, 40);

    if (base.length < 3) {
        base = ('usuario.' + base).slice(0, 40);
    }

    return base.length >= 3 ? base : 'usuario';
}

function gerarUsernameUnico(email, nome) {
    var base = baseUsername(email, nome);
    var usados = new Set(usuarios.map(function (usuario) {
        return String(usuario.username || '').toLowerCase();
    }));
    var candidato = base;
    var sufixo = 1;

    while (usados.has(candidato)) {
        var numero = String(sufixo++);
        candidato = base.slice(0, 40 - numero.length) + numero;
    }

    return candidato;
}

async function extrairMensagemErro(erro) {
    if (erro && erro.context && typeof erro.context.json === 'function') {
        try {
            var corpo = await erro.context.json();

            if (corpo && typeof corpo.error === 'string' && corpo.error) {
                return corpo.error;
            }
        } catch (falha) {
            console.warn('Não foi possível ler o erro da função.', falha);
        }
    }

    if (erro && typeof erro.message === 'string' && erro.message) {
        return erro.message;
    }

    return 'Não foi possível concluir a operação.';
}

function mensagemAmigavel(mensagem) {
    if (!mensagem) {
        return 'Não foi possível concluir a operação.';
    }

    if (/duplicate key|unique|já está cadastrado|já existe/i.test(mensagem)) {
        return 'Já existe um usuário com esse email ou nome de usuário.';
    }

    if (/already registered|already been registered/i.test(mensagem)) {
        return 'Este email já está cadastrado.';
    }

    if (/acesso negado/i.test(mensagem)) {
        return 'Seu acesso de gestor não foi reconhecido. Entre novamente.';
    }

    if (/sessão inválida|jwt|token/i.test(mensagem)) {
        return 'Sua sessão expirou. Entre novamente.';
    }

    if (/failed to fetch|network/i.test(mensagem)) {
        return 'Falha de conexão. Verifique sua internet e tente novamente.';
    }

    return mensagem;
}

async function invocarAdmin(payload) {
    var resposta = await cliente.functions.invoke('admin-users', { body: payload });

    if (resposta.error) {
        throw new Error(mensagemAmigavel(await extrairMensagemErro(resposta.error)));
    }

    if (resposta.data && typeof resposta.data.error === 'string' && resposta.data.error) {
        throw new Error(mensagemAmigavel(resposta.data.error));
    }

    return resposta.data;
}

async function carregarUsuarios() {
    var resposta = await cliente
        .from('profiles')
        .select('id, nome_completo, username, email, role, ativo, must_change_password, created_at, last_login_at')
        .order('nome_completo', { ascending: true });

    if (resposta.error) {
        throw resposta.error;
    }

    usuarios = resposta.data || [];
}

function criarBotao(texto, classe, aoClicar, desabilitado, titulo) {
    var botao = document.createElement('button');
    botao.type = 'button';
    botao.className = classe;
    botao.textContent = texto;
    botao.disabled = desabilitado === true;

    if (titulo) {
        botao.title = titulo;
    }

    botao.addEventListener('click', aoClicar);
    return botao;
}

function criarLinha(usuario) {
    var eu = ehMesmoUsuario(usuario);
    var linha = document.createElement('div');
    linha.className = 'admin-row' + (eu ? ' is-self' : '');

    var principal = document.createElement('div');
    principal.className = 'admin-row-main';

    var nome = document.createElement('strong');
    nome.textContent = nomeExibicao(usuario);

    var meta = document.createElement('small');
    var partesMeta = ['@' + (usuario.username || 'sem-usuario')];

    if (eu) {
        partesMeta.push('você');
    }

    partesMeta.push(formatarDataHora(usuario.last_login_at));
    meta.textContent = partesMeta.join(' · ');

    principal.appendChild(nome);
    principal.appendChild(meta);

    var email = document.createElement('span');
    email.className = 'admin-email';
    email.textContent = usuario.email || 'Sem email';

    var role = document.createElement('span');
    role.className = 'badge' + (usuario.role === 'gestor' ? ' role-gestor' : '');
    role.textContent = rotuloRole(usuario.role);

    var status = document.createElement('div');
    status.className = 'admin-row-status';

    var badgeStatus = document.createElement('span');
    badgeStatus.className = 'badge ' + (usuario.ativo ? 'status-ativo' : 'status-inativo');
    badgeStatus.textContent = usuario.ativo ? 'Ativo' : 'Inativo';
    status.appendChild(badgeStatus);

    if (usuario.must_change_password) {
        var badgeSenha = document.createElement('span');
        badgeSenha.className = 'badge status-pendente';
        badgeSenha.textContent = 'Senha provisória';
        badgeSenha.title = 'O usuário deverá trocar a senha no próximo acesso.';
        status.appendChild(badgeSenha);
    }

    var acoes = document.createElement('div');
    acoes.className = 'admin-row-actions';

    acoes.appendChild(criarBotao('Editar', 'btn-small', function () {
        abrirDialogo(usuario);
    }));

    acoes.appendChild(criarBotao(
        'Redefinir',
        'btn-small',
        function () {
            void redefinirSenha(usuario);
        },
        eu,
        eu ? 'Use a tela de login para alterar sua própria senha.' : 'Redefinir a senha do usuário'
    ));

    if (usuario.ativo) {
        acoes.appendChild(criarBotao(
            'Desativar',
            'btn-small danger',
            function () {
                void alternarAtivo(usuario);
            },
            eu,
            eu ? 'Você não pode desativar seu próprio usuário.' : 'Desativar o acesso do usuário'
        ));
    } else {
        acoes.appendChild(criarBotao('Reativar', 'btn-small', function () {
            void alternarAtivo(usuario);
        }));
    }

    linha.appendChild(principal);
    linha.appendChild(email);
    linha.appendChild(role);
    linha.appendChild(status);
    linha.appendChild(acoes);

    return linha;
}

function renderizar() {
    var termo = userSearch.value.trim().toLowerCase();
    var lista = usuarios.filter(function (usuario) {
        if (termo === '') {
            return true;
        }

        return [
            usuario.nome_completo || '',
            usuario.email || '',
            usuario.username || ''
        ].join(' ').toLowerCase().indexOf(termo) !== -1;
    });

    var total = lista.length;
    userCount.textContent = termo === ''
        ? total + (total === 1 ? ' usuário' : ' usuários')
        : total + ' de ' + usuarios.length + ' usuários';

    usersList.replaceChildren();
    usersEmpty.hidden = total > 0;
    usersEmpty.textContent = usuarios.length === 0
        ? 'Nenhum usuário cadastrado ainda.'
        : 'Nenhum usuário encontrado com essa busca.';

    var fragmento = document.createDocumentFragment();

    lista.forEach(function (usuario) {
        fragmento.appendChild(criarLinha(usuario));
    });

    usersList.appendChild(fragmento);
}

function abrirDialogo(usuario) {
    editandoId = usuario ? usuario.id : null;

    var eu = ehMesmoUsuario(usuario);
    userDialogTitle.textContent = usuario ? 'Editar usuário' : 'Novo usuário';
    saveUserBtn.textContent = usuario ? 'Salvar alterações' : 'Criar usuário';
    userName.value = usuario ? (usuario.nome_completo || '') : '';
    userEmail.value = usuario ? (usuario.email || '') : '';
    userRole.value = usuario ? usuario.role : 'operador';
    userRole.disabled = eu;
    userFormMessage.textContent = '';
    userFormMessage.className = 'form-message';

    if (usuario) {
        userFormHint.textContent = eu
            ? 'Você pode atualizar seu nome e email. Seu nível de acesso não pode ser alterado por aqui.'
            : 'Atualize nome, email ou nível de acesso. A senha é alterada somente pela opção Redefinir.';
    } else {
        userFormHint.textContent = 'O nome de usuário é gerado automaticamente a partir do email. A senha inicial será ' +
            SENHA_PADRAO + ' e deverá ser trocada no primeiro acesso.';
    }

    if (!userDialog.open) {
        userDialog.showModal();
    }

    document.body.classList.add('dialog-open');
    userName.focus();
}

function fecharDialogo() {
    if (userDialog.open) {
        userDialog.close();
    }

    document.body.classList.remove('dialog-open');
    editandoId = null;
    saveUserBtn.disabled = false;
}

function mensagemFormulario(texto, tipo) {
    userFormMessage.textContent = texto || '';
    userFormMessage.className = 'form-message' + (tipo ? ' ' + tipo : '');
}

async function salvarUsuario(evento) {
    evento.preventDefault();

    var nome = userName.value.trim();
    var email = userEmail.value.trim().toLowerCase();
    var role = userRole.value;

    if (nome === '') {
        mensagemFormulario('Informe o nome completo.', 'error');
        userName.focus();
        return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        mensagemFormulario('Informe um email válido.', 'error');
        userEmail.focus();
        return;
    }

    if (role !== 'gestor' && role !== 'operador') {
        mensagemFormulario('Selecione um nível de acesso válido.', 'error');
        userRole.focus();
        return;
    }

    var editando = editandoId !== null;
    var usuario = editando ? usuarios.find(function (item) {
        return item.id === editandoId;
    }) : null;

    if (editando && !usuario) {
        mensagemFormulario('Usuário não encontrado. Feche e tente novamente.', 'error');
        return;
    }

    var eu = ehMesmoUsuario(usuario);
    var payload;

    if (editando) {
        payload = {
            action: 'update',
            id: editandoId,
            nome_completo: nome,
            email: email,
            role: eu && usuario ? usuario.role : role
        };
    } else {
        payload = {
            action: 'create',
            nome_completo: nome,
            username: gerarUsernameUnico(email, nome),
            email: email,
            password: SENHA_PADRAO,
            role: role
        };
    }

    saveUserBtn.disabled = true;
    mensagemFormulario('Salvando...', 'info');

    try {
        await invocarAdmin(payload);
        fecharDialogo();
        await carregarUsuarios();
        renderizar();
        limparAviso();
        mostrarAviso(
            editando
                ? 'Usuário atualizado com sucesso.'
                : 'Usuário criado. A senha temporária é ' + SENHA_PADRAO +
                    '; ele deverá trocá-la no primeiro acesso.',
            'success'
        );
        mostrarStatus(editando ? 'Usuário atualizado.' : 'Usuário criado.', 'success');
    } catch (erro) {
        console.error('Não foi possível salvar o usuário.', erro);
        mensagemFormulario(erro.message || 'Não foi possível salvar o usuário.', 'error');
    } finally {
        saveUserBtn.disabled = false;
    }
}

async function redefinirSenha(usuario) {
    if (ehMesmoUsuario(usuario)) {
        return;
    }

    var novaSenha = window.prompt(
        'Nova senha para ' + nomeExibicao(usuario) + '. A senha padrão é ' + SENHA_PADRAO + ':',
        SENHA_PADRAO
    );

    if (novaSenha === null) {
        return;
    }

    if (novaSenha.length < 8) {
        mostrarStatus('A senha deve ter pelo menos 8 caracteres.', 'error');
        return;
    }

    mostrarStatus('Redefinindo senha...', 'info');
    limparAviso();

    try {
        await invocarAdmin({
            action: 'reset-password',
            id: usuario.id,
            password: novaSenha
        });

        await carregarUsuarios();
        renderizar();
        mostrarAviso(
            'Senha de ' + nomeExibicao(usuario) + ' redefinida. Ele deverá criar uma nova senha no próximo acesso.',
            'success'
        );
        mostrarStatus('Senha redefinida.', 'success');
    } catch (erro) {
        console.error('Não foi possível redefinir a senha.', erro);
        mostrarStatus(erro.message || 'Não foi possível redefinir a senha.', 'error');
    }
}

async function alternarAtivo(usuario) {
    if (ehMesmoUsuario(usuario)) {
        return;
    }

    var ativando = usuario.ativo !== true;
    var mensagem = ativando
        ? 'Reativar o acesso de "' + nomeExibicao(usuario) + '"?'
        : 'Desativar o acesso de "' + nomeExibicao(usuario) + '"? O histórico será mantido.';

    if (!window.confirm(mensagem)) {
        return;
    }

    mostrarStatus(ativando ? 'Reativando usuário...' : 'Desativando usuário...', 'info');
    limparAviso();

    try {
        await invocarAdmin({
            action: ativando ? 'reactivate' : 'deactivate',
            id: usuario.id
        });

        await carregarUsuarios();
        renderizar();
        mostrarAviso(
            ativando
                ? 'Usuário reativado com sucesso.'
                : 'Usuário desativado. Ele não conseguirá mais entrar no sistema.',
            'success'
        );
        mostrarStatus(ativando ? 'Usuário reativado.' : 'Usuário desativado.', 'success');
    } catch (erro) {
        console.error('Não foi possível alterar o acesso do usuário.', erro);
        mostrarStatus(erro.message || 'Não foi possível alterar o acesso do usuário.', 'error');
    }
}

function atribuirElementos() {
    loading = document.getElementById('authLoading');
    userMenu = document.getElementById('userMenu');
    main = document.querySelector('main.admin-container');
    adminNotice = document.getElementById('adminNotice');
    adminStatus = document.getElementById('adminStatus');
    usersList = document.getElementById('usersList');
    usersEmpty = document.getElementById('usersEmpty');
    userCount = document.getElementById('userCount');
    userSearch = document.getElementById('userSearch');
    newUserBtn = document.getElementById('newUserBtn');

    userDialog = document.getElementById('userDialog');
    userDialogTitle = document.getElementById('userDialogTitle');
    closeUserDialog = document.getElementById('closeUserDialog');
    userForm = document.getElementById('userForm');
    userName = document.getElementById('userName');
    userEmail = document.getElementById('userEmail');
    userRole = document.getElementById('userRole');
    userFormHint = document.getElementById('userFormHint');
    userFormMessage = document.getElementById('userFormMessage');
    saveUserBtn = document.getElementById('saveUserBtn');
    cancelUserBtn = document.getElementById('cancelUserBtn');
}

function ligarEventos() {
    newUserBtn.addEventListener('click', function () {
        abrirDialogo(null);
    });

    closeUserDialog.addEventListener('click', fecharDialogo);
    cancelUserBtn.addEventListener('click', fecharDialogo);
    userForm.addEventListener('submit', function (evento) {
        void salvarUsuario(evento);
    });

    userDialog.addEventListener('cancel', function (evento) {
        evento.preventDefault();
        fecharDialogo();
    });

    userDialog.addEventListener('close', function () {
        document.body.classList.remove('dialog-open');
        editandoId = null;
    });

    userDialog.addEventListener('click', function (evento) {
        if (evento.target === userDialog) {
            fecharDialogo();
        }
    });

    userSearch.addEventListener('input', renderizar);

    userName.addEventListener('input', function () {
        mensagemFormulario('', '');
    });

    userEmail.addEventListener('input', function () {
        mensagemFormulario('', '');
    });

    userRole.addEventListener('change', function () {
        mensagemFormulario('', '');
    });
}

async function iniciarUsuarios() {
    atribuirElementos();
    auth = window.OrganizaAuth;
    cliente = window.organizaaiClient;

    if (!cliente || !auth) {
        loading.textContent = 'Não foi possível conectar ao serviço. Recarregue a página.';
        return;
    }

    var contexto = null;

    try {
        contexto = await auth.requireAuth();
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

    if (perfilAtual.role !== 'gestor') {
        window.location.replace(auth.indexUrl);
        return;
    }

    document.body.classList.add('has-user-menu');
    auth.renderUserMenu(perfilAtual);
    ligarEventos();

    try {
        await carregarUsuarios();
        renderizar();
    } catch (erro) {
        console.error('Não foi possível carregar os usuários.', erro);
        mostrarStatus('Não foi possível carregar os usuários. Recarregue a página.', 'error');
        renderizar();
    }

    document.querySelector('header.brand').hidden = false;
    main.hidden = false;
    userMenu.hidden = false;
    loading.hidden = true;
}

document.addEventListener('DOMContentLoaded', function () {
    void iniciarUsuarios();
});
