# Agenda das Faculdades

Aplicativo de desktop (Windows) para organizar tarefas, trabalhos, provas e lembretes de uma ou mais faculdades, com calendário. Funciona **100% offline**, com os dados salvos localmente em SQLite. Tem tema Claro/Noite/Sistema e um chat opcional com o Claude (via Claude Code), com suporte a imagens.

Tela **Projetos** (para o trabalho): **Projeto** (status trabalhando, futuro ou finalizado, com cor própria) → **RICEs** (status em progresso, concluído ou block, com comentário) → **tarefas** com data de entrega, que aparecem no calendário.

> A versão só com as faculdades (sem Projetos) está na branch [`only-facul-version`](../../tree/only-facul-version), com o instalador 1.0.0 na release v1.0.0.

## Qual arquivo é o instalador?

**`Instalador Agenda das Faculdades 1.1.0.exe`** (cerca de 121 MB).

Ele **não fica no código do repositório** (a pasta `dist/` é ignorada pelo `.gitignore`, e o GitHub não aceita arquivos acima de 100 MB). Ele está disponível na aba **Releases** do repositório. Baixe, execute e siga o instalador.

<img width="1884" height="986" alt="image" src="https://github.com/user-attachments/assets/450b06b8-b740-46b1-8add-984960653cbf" />


> Na primeira execução o Windows pode mostrar "O Windows protegeu seu computador", porque o instalador não tem assinatura digital paga. Clique em **Mais informações → Executar assim mesmo**.

Se preferir gerar o instalador você mesmo, veja [Recriando os arquivos ignorados](#recriando-os-arquivos-ignorados).

## Chat com o Claude (opcional)

O chat usa o **Claude Code** instalado no computador e a conta Claude de quem fez o login nele (consome o plano Pro/Max dessa pessoa). Sem ele, o resto do app funciona normalmente. O passo a passo de instalação está dentro do app: aba **Chats com o Claude → botão "Como configurar"**.

## Arquivos importantes

| Arquivo / pasta | Para que serve |
| --- | --- |
| `package.json` | Dados do projeto, scripts (`npm start`, `npm run instalador`) e configuração do instalador (bloco `build`) |
| `package-lock.json` | Versões exatas das dependências |
| `src/main.js` | Processo principal do Electron: cria a janela, acessa o banco, chama o Claude Code e salva as imagens do chat |
| `src/preload.js` | Ponte segura entre a janela e o processo principal |
| `src/db.js` | Banco de dados SQLite (tabelas, validações e consultas) |
| `src/renderer/index.html` | Estrutura da tela |
| `src/renderer/app.js` | Toda a interface: calendário, próximas atividades, faculdades, lembretes e chats |
| `src/renderer/style.css` | Visual, incluindo o tema escuro |
| `src/renderer/guia-chat.js` | Texto do passo a passo mostrado no botão "Como configurar" |
| `src/icone.png` | Ícone da janela |
| `build/icon.png` | Ícone usado pelo instalador |
| `Iniciar Agenda.vbs` | Abre o app em modo de desenvolvimento sem janela de terminal |
| `.gitignore` | Lista do que não vai para o GitHub |

## Rodando pelo código

Precisa do [Node.js](https://nodejs.org) (versão LTS).

```bash
npm install
npm start
```

Os dados ficam em `%APPDATA%\agenda-faculdades\agenda.db`, **fora** da pasta do projeto.

## Recriando os arquivos ignorados

O `.gitignore` deixa de fora três coisas. Nenhuma delas é necessária no repositório, e todas se recriam:

| Ignorado | O que é | Como recriar |
| --- | --- | --- |
| `node_modules/` | Dependências (Electron e electron-builder) | Na pasta do projeto, rode `npm install` |
| `dist/` | Instalador e app empacotado | Depois do `npm install`, rode `npm run instalador`. O arquivo sai em `dist\Instalador Agenda das Faculdades 1.1.0.exe` (a 1ª vez baixa o Electron e o NSIS, leva alguns minutos) |
| `*.log` | Arquivos de log | Não precisa recriar; são gerados sozinhos |

O banco de dados (`agenda.db`) e as imagens do chat **nunca** estão no projeto: são criados no `%APPDATA%` (no seu computador) na primeira vez que o app abre, já com Unicid (4 semestres) e Univesp (8 semestres) cadastradas.

## Tecnologias

Electron, `node:sqlite` (SQLite embutido no Node, sem módulos nativos para compilar), HTML/CSS/JavaScript puro, electron-builder (instalador NSIS).
