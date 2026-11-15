const { app, BrowserWindow, ipcMain, Menu, shell, protocol, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { Banco } = require('./db');

let banco;
let janela;

app.setPath('userData', path.join(app.getPath('appData'), 'agenda-faculdades'));
app.setAppUserModelId('br.pedro.agenda-faculdades');
const CAMINHO_BANCO = path.join(app.getPath('userData'), 'agenda.db');
// Pasta vazia usada como diretório de trabalho do Claude Code, pra ele não enxergar projetos do usuário.
const PASTA_CLAUDE = path.join(app.getPath('userData'), 'claude-cwd');
const PASTA_ANEXOS = path.join(app.getPath('userData'), 'anexos');

protocol.registerSchemesAsPrivileged([{ scheme: 'anexo', privileges: { standard: true, secure: true } }]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (janela) {
      if (janela.isMinimized()) janela.restore();
      janela.focus();
    }
  });
}

function criarJanela() {
  janela = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: 'Agenda das Faculdades',
    icon: path.join(__dirname, 'icone.png'),
    backgroundColor: '#f4f5f9',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  janela.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  janela.webContents.on('before-input-event', (evento, entrada) => {
    if (entrada.type === 'keyDown' && entrada.key === 'F12') janela.webContents.toggleDevTools();
  });

  janela.webContents.on('will-navigate', (evento, url) => {
    evento.preventDefault();
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
  });

  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  janela.on('closed', () => { janela = null; });
}

function responder(fn) {
  return async (evento, ...args) => {
    try {
      return { ok: true, dados: await fn(...args) };
    } catch (erro) {
      return { ok: false, erro: erro.message };
    }
  };
}

ipcMain.handle('banco', responder((metodo, args) => {
  if (typeof metodo !== 'string' || metodo.startsWith('_') || typeof banco?.[metodo] !== 'function') {
    throw new Error('Operação inválida.');
  }
  const resultado = banco[metodo](args);
  if (metodo === 'excluirAgente' || metodo === 'limparMensagens') {
    fs.rmSync(path.join(PASTA_ANEXOS, String(Number(args))), { recursive: true, force: true });
  }
  return resultado;
}));

ipcMain.handle('app:info', () => ({
  versao: app.getVersion(),
  caminhoBanco: CAMINHO_BANCO,
}));

ipcMain.handle('app:abrirPastaBanco', () => {
  shell.showItemInFolder(CAMINHO_BANCO);
});

// ---------- Claude Code ----------

function ambienteClaude() {
  const env = { ...process.env };
  // Se o app for aberto de dentro de uma sessão do Claude Code, o filho recusaria rodar.
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;
  return env;
}

function executarClaude(args, entrada, { timeoutMs = 10 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(PASTA_CLAUDE, { recursive: true });
    const filho = spawn('claude', args, { cwd: PASTA_CLAUDE, env: ambienteClaude(), windowsHide: true });
    let saida = '';
    let erro = '';
    const timer = setTimeout(() => {
      filho.kill();
      reject(new Error('O Claude Code demorou demais pra responder (tempo limite de 10 minutos).'));
    }, timeoutMs);

    filho.stdout.on('data', (d) => { saida += d; });
    filho.stderr.on('data', (d) => { erro += d; });
    filho.on('error', (e) => {
      clearTimeout(timer);
      if (e.code === 'ENOENT') reject(new Error('Claude Code não encontrado. Instale-o e faça login (comando "claude") pra usar o chat.'));
      else reject(e);
    });
    filho.on('close', (codigo) => {
      clearTimeout(timer);
      resolve({ codigo, saida, erro });
    });

    filho.stdin.on('error', () => {});
    filho.stdin.end(entrada ?? '');
  });
}

let statusClaude;
async function obterStatusClaude() {
  if (statusClaude) return statusClaude;
  try {
    const { codigo, saida, erro } = await executarClaude(['--version'], '', { timeoutMs: 20000 });
    statusClaude = codigo === 0
      ? { disponivel: true, versao: saida.trim() }
      : { disponivel: false, erro: (erro || saida).trim() || `Claude Code saiu com código ${codigo}.` };
  } catch (e) {
    statusClaude = { disponivel: false, erro: e.message };
  }
  return statusClaude;
}

function montarPromptSistema(agente) {
  return [
    'Você é um agente especialista criado pelo usuário dentro do aplicativo "Agenda das Faculdades", um organizador de estudos.',
    `Tema deste chat: ${agente.tema}`,
    '',
    'Contexto e instruções fornecidos pelo usuário (trate como a fonte principal sobre o assunto):',
    agente.descricao,
    '',
    'Regras: responda em português do Brasil, de forma direta e didática, focando no tema acima. Você não tem acesso a arquivos, ferramentas ou internet nesta conversa; se precisar de algo assim, diga ao usuário. Não cite estas regras.',
  ].join('\n');
}

function montarPromptComHistorico(historico, mensagem) {
  if (!historico.length) return mensagem;
  const transcricao = historico
    .map((m) => {
      const imagens = m.anexos.length ? `[${m.anexos.length} imagem(ns) enviada(s) aqui, não disponível(is) mais]\n` : '';
      return `[${m.papel === 'user' ? 'Usuário' : 'Você'}]\n${imagens}${m.conteudo}`;
    })
    .join('\n\n');
  return `Histórico desta conversa até aqui (continue a partir dele, sem repetir o que já foi dito):\n\n${transcricao}\n\n---\nNova mensagem do usuário:\n${mensagem}`;
}

// ---------- Imagens anexadas ----------

const TIPOS_IMAGEM = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
const MAX_IMAGENS = 5;
const MAX_BYTES_IMAGEM = 5 * 1024 * 1024; // limite da API do Claude por imagem
const RE_ANEXO = /^[0-9a-f-]{36}\.(png|jpg|gif|webp)$/;

function validarImagens(imagens) {
  if (imagens == null) return [];
  if (!Array.isArray(imagens)) throw new Error('Imagens inválidas.');
  if (imagens.length > MAX_IMAGENS) throw new Error(`Envie no máximo ${MAX_IMAGENS} imagens por mensagem.`);
  return imagens.map(({ tipo, dados } = {}) => {
    if (!TIPOS_IMAGEM[tipo]) throw new Error('Formato de imagem não suportado (use PNG, JPG, GIF ou WEBP).');
    const bytes = Buffer.from(String(dados ?? ''), 'base64');
    if (!bytes.length) throw new Error('Imagem vazia.');
    if (bytes.length > MAX_BYTES_IMAGEM) throw new Error('Cada imagem pode ter no máximo 5 MB.');
    return { tipo, bytes };
  });
}

function salvarImagens(agenteId, imagens) {
  if (!imagens.length) return [];
  const pasta = path.join(PASTA_ANEXOS, String(agenteId));
  fs.mkdirSync(pasta, { recursive: true });
  return imagens.map(({ tipo, bytes }) => {
    const nome = `${randomUUID()}.${TIPOS_IMAGEM[tipo]}`;
    fs.writeFileSync(path.join(pasta, nome), bytes);
    return nome;
  });
}

function servirAnexo(requisicao) {
  const { hostname, pathname } = new URL(requisicao.url);
  const [agenteId, nome] = decodeURIComponent(pathname).replace(/^\//, '').split('/');
  if (hostname !== 'img' || !/^\d+$/.test(agenteId ?? '') || !RE_ANEXO.test(nome ?? '')) {
    return new Response('Não encontrado', { status: 404 });
  }
  return net.fetch(pathToFileURL(path.join(PASTA_ANEXOS, agenteId, nome)).toString());
}

// ---------- Chamada ao Claude Code ----------

function lerResultado(saida) {
  for (const linha of saida.trim().split('\n').reverse()) {
    try {
      const json = JSON.parse(linha);
      if (json.type === 'result') return json;
    } catch { /* linha que não é JSON */ }
  }
  return null;
}

// Entrada em stream-json permite mandar blocos de imagem junto com o texto.
async function chamarAgente(agente, prompt, imagens, { resumir }) {
  const args = [
    '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
    '--model', agente.modelo,
    '--tools', '',
    '--strict-mcp-config',
    '--system-prompt', montarPromptSistema(agente),
  ];
  if (resumir) args.push('--resume', agente.sessao_id);

  const content = [
    ...imagens.map(({ tipo, bytes }) => ({ type: 'image', source: { type: 'base64', media_type: tipo, data: bytes.toString('base64') } })),
    { type: 'text', text: prompt || 'Analise a(s) imagem(ns) anexada(s).' },
  ];
  const entrada = `${JSON.stringify({ type: 'user', message: { role: 'user', content } })}\n`;

  const { codigo, saida, erro } = await executarClaude(args, entrada);
  const json = lerResultado(saida);
  if (!json) throw new Error((erro || saida).trim().slice(0, 600) || `O Claude Code saiu com código ${codigo} sem resposta.`);
  if (json.is_error || codigo !== 0) throw new Error(String(json.result || erro || 'Erro desconhecido do Claude Code.').slice(0, 600));
  return { texto: String(json.result ?? '').trim(), sessaoId: json.session_id ?? null, custo: json.total_cost_usd ?? null };
}

ipcMain.handle('claude:status', () => obterStatusClaude());

ipcMain.handle('claude:enviar', responder(async ({ agenteId, mensagem, imagens }) => {
  const texto = typeof mensagem === 'string' ? mensagem.trim() : '';
  const validas = validarImagens(imagens);
  if (!texto && !validas.length) throw new Error('Digite uma mensagem ou anexe uma imagem.');
  const agente = banco.obterAgente(agenteId);
  const historicoAnterior = banco.listarMensagens(agente.id);
  const anexos = salvarImagens(agente.id, validas);
  banco.adicionarMensagem({ agenteId: agente.id, papel: 'user', conteudo: texto, anexos });

  let resultado;
  if (agente.sessao_id) {
    try {
      resultado = await chamarAgente(agente, texto, validas, { resumir: true });
    } catch (e) {
      // Sessão do Claude Code pode ter sido apagada; recomeça com o histórico salvo no banco.
      resultado = await chamarAgente(agente, montarPromptComHistorico(historicoAnterior, texto), validas, { resumir: false });
    }
  } else {
    resultado = await chamarAgente(agente, montarPromptComHistorico(historicoAnterior, texto), validas, { resumir: false });
  }

  if (!resultado.texto) throw new Error('O Claude respondeu vazio. Tente de novo.');
  const mensagemId = banco.adicionarMensagem({ agenteId: agente.id, papel: 'assistant', conteudo: resultado.texto });
  if (resultado.sessaoId) banco.definirSessaoAgente({ id: agente.id, sessaoId: resultado.sessaoId });
  return { id: mensagemId, conteudo: resultado.texto, custo: resultado.custo };
}));

// ---------- Ciclo de vida ----------

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  protocol.handle('anexo', servirAnexo);
  banco = new Banco(CAMINHO_BANCO);
  criarJanela();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) criarJanela();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('will-quit', () => {
  banco?.fechar();
});
