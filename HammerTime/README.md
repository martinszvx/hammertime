# Hammer Time local

Guia em português para entender o protótipo. A interface do site é em inglês; comentários no código e nos dados são em português.

## Visão geral

O projeto tem duas partes que rodam localmente:

1. O navegador carrega `index.html`, aplica `styles.css` e executa `app.js`.
2. `server.js` inicia uma API Node.js em `http://localhost:3001` e lê/grava contas e pedidos nos arquivos JSONC dentro de `data/`.

O Live Server serve os arquivos do navegador, mas não grava dados no disco. Por isso, a API precisa continuar rodando em outro terminal.

## Mapa dos arquivos

- `index.html`: estrutura das telas, campos, rótulos em inglês, identificadores usados pelo JavaScript e comentários em português.
- `styles.css`: cores, fontes, componentes, estados visuais, animações e regras responsivas.
- `app.js`: catálogo, eventos de clique e formulário, chamadas à API, prévia de pedido, login e renderização do histórico.
- `server.js`: API HTTP, validação, sessões, hash de senha, faixas de preço e persistência JSONC.
- `data/users.jsonc`: coleção de contas; os comentários descrevem os campos de autenticação.
- `data/requests.jsonc`: coleção de solicitações; os comentários descrevem os detalhes de cada pedido.
- `package.json`: metadados e comandos npm. O `jsonc-parser` é a dependência usada para editar JSONC.
- `package-lock.json`: versões exatas das dependências instaladas pelo npm.

## Fluxo de uso

1. Ao abrir a página, `app.js` verifica se há um token de sessão salvo no `localStorage` e consulta `GET /api/me`.
2. O formulário envia e-mail e senha para `POST /api/login`. O link alternador muda o envio para `POST /api/register`.
3. Com uma resposta válida, o navegador guarda o token e mostra o painel inicial.
4. A busca filtra o catálogo em memória. Escolher um cartão abre o formulário com aquela categoria pré-selecionada.
5. Enquanto os campos mudam, `updateRequestPreview()` atualiza a prévia e `getEstimate()` mostra a faixa daquela categoria.
6. Enviar o pedido chama `POST /api/requests`. O servidor valida os campos, associa o e-mail da sessão, calcula o preço de referência e grava o pedido.
7. A tela de histórico chama `GET /api/requests` e mostra os pedidos pertencentes à conta atual.
8. O botão de saída chama `POST /api/logout`, remove o token local e retorna à tela de acesso.

## Rotas da API

- `GET /api/health`: verifica se a API está ativa.
- `POST /api/register`: recebe `email` e `password`, cria uma conta e devolve um token.
- `POST /api/login`: verifica as credenciais e devolve um token.
- `GET /api/me`: verifica o token e devolve o e-mail da sessão.
- `POST /api/logout`: invalida o token atual enquanto a API estiver rodando.
- `GET /api/requests`: lista os pedidos da conta autenticada.
- `POST /api/requests`: valida e salva um novo pedido da conta autenticada.

## Campos armazenados

Em `users.jsonc`, `email` identifica a conta, `salt` é o valor aleatório usado no hash, `passwordHash` é o resultado protegido da senha e `createdAt` marca a criação. A senha original não é gravada.

Em `requests.jsonc`, `id` identifica o pedido e `email` identifica sua conta. `service`, `description`, `phone` e `address` descrevem serviço, tarefa e contato. `date` e `time` são a preferência de atendimento. `estimatedPrice` é uma faixa informativa calculada pela API. `createdAt` registra quando o pedido foi enviado.

Descrições digitadas pelo usuário são mantidas como foram escritas. A interface traduz rótulos e categorias conhecidas, mas não altera texto pessoal já salvo.

## Comentários e JSONC

JSON estrito não permite comentários. Os dados usam a extensão `.jsonc` para incluir explicações sem inventar campos de comentário. `jsonc-parser` interpreta os comentários; `modify()` e `applyEdits()` atualizam a coleção sem removê-los. `package.json` e `package-lock.json` permanecem JSON estrito porque o npm exige esse formato.

## Executar

1. No terminal, dentro desta pasta, execute `npm install` uma vez para instalar o parser.
2. Inicie a API com `npm start` e deixe esse terminal aberto.
3. Abra `index.html` no VS Code e clique em **Go Live**.
4. A interface servida pelo Live Server chama a API local na porta `3001`.

As sessões ficam em memória e terminam quando o processo Node reinicia. As contas e solicitações continuam nos arquivos JSONC. Este armazenamento serve para desenvolvimento local: use apenas dados de teste e não exponha a API na internet.