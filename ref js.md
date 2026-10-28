	# Instruções para a Apostila de Exercícios DOM

Bem-vindo(a) à apostila de exercícios de DOM! Aqui você vai praticar a manipulação de elementos de uma página web utilizando apenas JavaScript. A ideia é entender como interagir com o DOM de maneira prática e eficiente, sem recorrer a frameworks externos.

### Objetivo

Você será desafiado a realizar uma série de tarefas usando o DOM em uma página de lista de tarefas (todo list). As tarefas devem ser resolvidas diretamente no console do navegador. Evite usar código JS dentro da própria página HTML, sempre faça suas alterações pelo console.

### O que você vai aprender

- Acessar e modificar elementos HTML.
- Adicionar, remover e alterar classes.
- Criar novos elementos e manipulá-los.
- Trabalhar com eventos e interações do usuário.

### Como Funciona

- Abra a página HTML no seu navegador.
- Abra o console do navegador (normalmente pressionando `F12` ou clicando com o botão direito e selecionando "Inspecionar" > "Console").
- Realize os exercícios interagindo diretamente com os elementos da página.

### Requisitos

- Ter conhecimentos básicos de HTML, CSS e JavaScript.
- Usar os métodos do DOM para interagir com a página.
- Realizar cada tarefa no console do navegador, verificando o resultado ao vivo.

Boa prática!

## **Referência Básica de JavaScript para os Desafios**

### **1️⃣ Declaração de Variáveis**

Em JavaScript, podemos declarar variáveis de três formas:

#### **Com `var` (não recomendado para novos projetos):**

```js
var nome = 'Produto';
var preco = 50;
```

#### **Com `let` (preferido para variáveis mutáveis):**

```js
let nome = 'Produto';
let preco = 50;
```

#### **Com `const` (para valores constantes):**

```js
const nome = 'Produto';
const preco = 50;
```

---

### **2️⃣ Estruturas de Controle**

#### **Estrutura `if`**

A estrutura `if` permite que você execute código com base em uma condição.

```js
let nome = 'Produto';
if (nome === 'Produto') {
	console.log('Produto encontrado!');
}
```

#### **Estrutura `else`**

Você pode usar `else` para executar código quando a condição não for verdadeira.

```js
let nome = 'Produto';
if (nome === 'Produto') {
	console.log('Produto encontrado!');
} else {
	console.log('Produto não encontrado!');
}
```

#### **Estrutura `else if`**

Você pode adicionar várias condições com `else if`.

```js
let preco = 100;
if (preco < 50) {
	console.log('Preço baixo!');
} else if (preco >= 50 && preco <= 100) {
	console.log('Preço médio!');
} else {
	console.log('Preço alto!');
}
```

---

### **3️⃣ Manipulação do DOM**

#### **Selecionar Elementos**

Você pode selecionar um elemento usando `getElementById` ou `querySelector`.

```js
let nomeProduto = document.getElementById('nomeProduto');
let listaProdutos = document.querySelector('#listaProdutos');
```

#### **Alterar Conteúdo de Elementos**

Você pode modificar o conteúdo de um elemento com `innerText` ou `innerHTML`.

```js
document.getElementById('titulo').innerText = 'Minha Lista de Produtos';
```

#### **Criar e Adicionar Elementos ao DOM**

Você pode criar um novo elemento com `createElement` e adicioná-lo à página com `appendChild`.

```js
let novoItem = document.createElement('li');
novoItem.innerText = 'Produto - R$ 100';
document.getElementById('listaProdutos').appendChild(novoItem);
```

#### **Remover Elementos do DOM**

Você pode remover um elemento com `removeChild` ou `remove()`.

```js
let item = document.getElementById('itemRemover');
item.remove(); // Remove o próprio item
```

#### **Adicionar Evento a um Elemento**

Você pode adicionar eventos aos elementos com `addEventListener`.

```js
document
	.getElementById('adicionarProduto')
	.addEventListener('click', function () {
		alert('Produto Adicionado!');
	});
```

---

### **4️⃣ Funções**

#### **Função Básica**

Funções permitem agrupar código que pode ser reutilizado.

```js
function adicionarProduto(nome, preco) {
	let novoItem = document.createElement('li');
	novoItem.innerHTML = `${nome} - R$ ${preco}`;
	document.getElementById('listaProdutos').appendChild(novoItem);
}
```

#### **Função com Parâmetros**

Funções podem receber dados através de parâmetros.

```js
function exibirAlerta(mensagem) {
	alert(mensagem);
}

exibirAlerta('Produto adicionado com sucesso!');
```

---

### **5️⃣ Manipulação de Strings**

Você pode manipular strings facilmente em JavaScript.

#### **Concatenar Strings**

```js
let nome = 'Produto';
let preco = 100;
let mensagem = nome + ' - R$ ' + preco;
```

#### **Dividir uma String**

```js
let produtoTexto = 'Produto - R$ 100';
let partes = produtoTexto.split(' - R$ ');
let nomeProduto = partes[0];
let precoProduto = partes[1];
```

---

### **6️⃣ Validação de Formulários e Campos**

Você pode verificar se os campos estão vazios para validar entradas.

```js
let nome = document.getElementById('nomeProduto').value;
let preco = document.getElementById('precoProduto').value;

if (nome === '' || preco === '') {
	alert('Preencha todos os campos!');
}
```

---

### **7️⃣ Manipulação de Botões e Eventos**

Você pode adicionar eventos a botões e executar ações com base nas interações do usuário.

#### **Adicionar Evento de Clique a um Botão**

```js
document
	.getElementById('adicionarProduto')
	.addEventListener('click', function () {
		let nome = document.getElementById('nomeProduto').value;
		let preco = document.getElementById('precoProduto').value;

		if (nome && preco) {
			let novoItem = document.createElement('li');
			novoItem.innerText = nome + ' - R$ ' + preco;
			document.getElementById('listaProdutos').appendChild(novoItem);
		}
	});
```

#### **Remover Produto da Lista**

```js
document
	.getElementById('listaProdutos')
	.addEventListener('click', function (event) {
		if (event.target.classList.contains('remover')) {
			event.target.parentElement.remove();
			alert('Produto removido com sucesso!');
		}
	});
```
