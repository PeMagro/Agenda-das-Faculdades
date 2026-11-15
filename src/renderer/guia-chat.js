// Mesmo texto do .txt de passo a passo, mostrado pelo botão de ajuda na tela de chats.
const GUIA_CHAT = `COMO CONFIGURAR O CHAT COM O CLAUDE - AGENDA DAS FACULDADES
============================================================

O chat do app usa o "Claude Code" instalado no computador e a conta Claude
de quem fizer o login nele. Ou seja: as mensagens gastam o limite do plano
(Pro ou Max) da SUA conta, não da conta de outra pessoa.

Se você não quiser usar o chat, pode pular tudo isso: calendário, atividades
e lembretes funcionam sem internet e sem instalar mais nada.

O que você precisa:
  - Windows 10 ou 11
  - Uma conta Claude com plano Pro ou Max (https://claude.ai)
  - Internet (só para instalar e na hora de conversar no chat)


PASSO 1 - Instalar o Git para Windows
-------------------------------------
O Claude Code precisa dele no Windows.
  1. Acesse https://git-scm.com/downloads/win
  2. Baixe o instalador e vá clicando em "Next" até o fim (as opções padrão servem).


PASSO 2 - Instalar o Claude Code
--------------------------------
  1. Clique no menu Iniciar, digite "PowerShell" e abra o "Windows PowerShell".
  2. Copie e cole o comando abaixo e aperte Enter:

       winget install Anthropic.ClaudeCode

  3. Espere terminar e FECHE o PowerShell.

  (Se o comando "winget" não for reconhecido, use este no lugar:
       irm https://claude.ai/install.ps1 | iex )


PASSO 3 - Fazer login com a sua conta Claude
--------------------------------------------
  1. Abra o PowerShell de novo.
  2. Digite o comando abaixo e aperte Enter:

       claude

  3. Escolha o login com a conta Claude (assinatura Pro/Max).
     O navegador vai abrir: entre na sua conta e autorize.
  4. Quando aparecer a tela do Claude Code pronta para conversar, digite /exit
     e aperte Enter para sair. Pode fechar o PowerShell.


PASSO 4 - Conferir
------------------
  1. Abra o PowerShell e digite:

       claude --version

     Se aparecer um número de versão, está tudo certo.
  2. Abra (ou feche e abra de novo) o app "Agenda das Faculdades" e vá em
     "Chats com o Claude". Lá embaixo deve aparecer a versão do Claude Code,
     e o aviso de "Claude Code não disponível" não aparece mais.


USANDO O CHAT
-------------
  - "+ Novo chat": informe um tema e uma descrição. Isso vira o contexto do
    agente especialista. Dá para mudar depois em "Editar contexto".
  - Escolha o modelo: Opus (mais inteligente, gasta mais limite),
    Sonnet (equilibrado) ou Haiku (mais rápido e econômico).
  - Imagens: clique no clipe (📎), cole com Ctrl+V ou arraste a imagem para o
    chat. Até 5 imagens por mensagem, 5 MB cada (PNG, JPG, GIF ou WEBP).
  - As respostas levam alguns segundos para chegar.


PROBLEMAS COMUNS
----------------
  - "Claude Code não encontrado": feche e abra o app de novo depois de instalar.
    Se continuar, reinicie o computador.
  - Erro de login ou de limite: rode "claude" no PowerShell e veja a mensagem;
    pode ser preciso entrar de novo na conta ou esperar o limite do plano renovar.
`;
