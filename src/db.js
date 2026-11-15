const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS faculdade (
  id    INTEGER PRIMARY KEY,
  nome  TEXT NOT NULL UNIQUE,
  cor   TEXT NOT NULL DEFAULT '#2563eb'
);

CREATE TABLE IF NOT EXISTS semestre (
  id            INTEGER PRIMARY KEY,
  faculdade_id  INTEGER NOT NULL REFERENCES faculdade(id) ON DELETE CASCADE,
  numero        INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pendente'
                CHECK (status IN ('pendente', 'cursando', 'concluido')),
  UNIQUE (faculdade_id, numero)
);

CREATE TABLE IF NOT EXISTS materia (
  id           INTEGER PRIMARY KEY,
  semestre_id  INTEGER NOT NULL REFERENCES semestre(id) ON DELETE CASCADE,
  nome         TEXT NOT NULL,
  professor    TEXT,
  status       TEXT NOT NULL DEFAULT 'cursando'
               CHECK (status IN ('pendente', 'cursando', 'concluido'))
);

CREATE TABLE IF NOT EXISTS atividade (
  id          INTEGER PRIMARY KEY,
  materia_id  INTEGER NOT NULL REFERENCES materia(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL CHECK (tipo IN ('tarefa', 'trabalho', 'prova')),
  titulo      TEXT NOT NULL,
  descricao   TEXT,
  data        TEXT NOT NULL,
  hora        TEXT,
  status      TEXT NOT NULL DEFAULT 'pendente'
              CHECK (status IN ('pendente', 'concluida')),
  criada_em   TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_atividade_data ON atividade(data);
CREATE INDEX IF NOT EXISTS idx_atividade_materia ON atividade(materia_id);

CREATE TABLE IF NOT EXISTS lembrete (
  id            INTEGER PRIMARY KEY,
  faculdade_id  INTEGER NOT NULL REFERENCES faculdade(id) ON DELETE CASCADE,
  materia_id    INTEGER REFERENCES materia(id) ON DELETE SET NULL,
  titulo        TEXT NOT NULL,
  descricao     TEXT,
  data          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pendente'
                CHECK (status IN ('pendente', 'concluida')),
  criado_em     TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_lembrete_data ON lembrete(data);

CREATE TABLE IF NOT EXISTS agente (
  id             INTEGER PRIMARY KEY,
  tema           TEXT NOT NULL,
  descricao      TEXT NOT NULL,
  modelo         TEXT NOT NULL DEFAULT 'opus',
  sessao_id      TEXT,
  criado_em      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  atualizado_em  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS mensagem (
  id         INTEGER PRIMARY KEY,
  agente_id  INTEGER NOT NULL REFERENCES agente(id) ON DELETE CASCADE,
  papel      TEXT NOT NULL CHECK (papel IN ('user', 'assistant')),
  conteudo   TEXT NOT NULL,
  criada_em  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_mensagem_agente ON mensagem(agente_id);
`;

const TIPOS = new Set(['tarefa', 'trabalho', 'prova']);
const STATUS_CURSO = new Set(['pendente', 'cursando', 'concluido']);
const STATUS_ATIVIDADE = new Set(['pendente', 'concluida']);
const MODELOS = new Set(['opus', 'sonnet', 'haiku']);
const PAPEIS = new Set(['user', 'assistant']);
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^\d{2}:\d{2}$/;
const RE_COR = /^#[0-9a-fA-F]{6}$/;

function texto(valor, campo, { obrigatorio = true, max = 200 } = {}) {
  const limpo = typeof valor === 'string' ? valor.trim() : '';
  if (!limpo && obrigatorio) throw new Error(`${campo} é obrigatório.`);
  if (limpo.length > max) throw new Error(`${campo} deve ter no máximo ${max} caracteres.`);
  return limpo || null;
}

function inteiro(valor, campo) {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${campo} inválido.`);
  return n;
}

function emConjunto(valor, conjunto, campo) {
  if (!conjunto.has(valor)) throw new Error(`${campo} inválido.`);
  return valor;
}

class Banco {
  constructor(caminho) {
    this.db = new DatabaseSync(caminho);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = ON');
    this.db.exec(SCHEMA);
    this._migrar();
    this._semear();
  }

  fechar() {
    this.db.close();
  }

  _transacao(fn) {
    this.db.exec('BEGIN');
    try {
      const resultado = fn();
      this.db.exec('COMMIT');
      return resultado;
    } catch (erro) {
      this.db.exec('ROLLBACK');
      throw erro;
    }
  }

  _migrar() {
    const colunas = this.db.prepare('PRAGMA table_info(mensagem)').all().map((c) => c.name);
    if (!colunas.includes('anexos')) this.db.exec('ALTER TABLE mensagem ADD COLUMN anexos TEXT');
  }

  _semear() {
    const { n } = this.db.prepare('SELECT COUNT(*) AS n FROM faculdade').get();
    if (n > 0) return;
    this.criarFaculdade({ nome: 'Unicid', cor: '#2563eb', qtdSemestres: 4 });
    this.criarFaculdade({ nome: 'Univesp', cor: '#059669', qtdSemestres: 8 });
  }

  // ---------- Faculdades ----------

  listarEstrutura() {
    const faculdades = this.db.prepare('SELECT * FROM faculdade ORDER BY nome').all();
    const semestres = this.db.prepare('SELECT * FROM semestre ORDER BY numero').all();
    const materias = this.db.prepare(`
      SELECT m.*, COUNT(a.id) AS qtd_atividades,
             SUM(CASE WHEN a.status = 'pendente' THEN 1 ELSE 0 END) AS qtd_pendentes
      FROM materia m
      LEFT JOIN atividade a ON a.materia_id = m.id
      GROUP BY m.id
      ORDER BY m.nome COLLATE NOCASE
    `).all();

    const materiasPorSemestre = new Map();
    for (const m of materias) {
      if (!materiasPorSemestre.has(m.semestre_id)) materiasPorSemestre.set(m.semestre_id, []);
      materiasPorSemestre.get(m.semestre_id).push(m);
    }
    const semestresPorFaculdade = new Map();
    for (const s of semestres) {
      s.materias = materiasPorSemestre.get(s.id) ?? [];
      if (!semestresPorFaculdade.has(s.faculdade_id)) semestresPorFaculdade.set(s.faculdade_id, []);
      semestresPorFaculdade.get(s.faculdade_id).push(s);
    }
    for (const f of faculdades) f.semestres = semestresPorFaculdade.get(f.id) ?? [];
    return faculdades;
  }

  listarFaculdades() {
    return this.db.prepare('SELECT * FROM faculdade ORDER BY nome').all();
  }

  criarFaculdade({ nome, cor, qtdSemestres }) {
    const nomeLimpo = texto(nome, 'Nome da faculdade', { max: 80 });
    const corLimpa = RE_COR.test(cor ?? '') ? cor : '#2563eb';
    const qtd = Math.min(Math.max(Number(qtdSemestres) || 0, 0), 20);
    return this._transacao(() => {
      const { lastInsertRowid } = this.db
        .prepare('INSERT INTO faculdade (nome, cor) VALUES (?, ?)')
        .run(nomeLimpo, corLimpa);
      const inserir = this.db.prepare('INSERT INTO semestre (faculdade_id, numero) VALUES (?, ?)');
      for (let i = 1; i <= qtd; i++) inserir.run(lastInsertRowid, i);
      return Number(lastInsertRowid);
    });
  }

  atualizarFaculdade({ id, nome, cor }) {
    const nomeLimpo = texto(nome, 'Nome da faculdade', { max: 80 });
    const corLimpa = RE_COR.test(cor ?? '') ? cor : '#2563eb';
    this.db.prepare('UPDATE faculdade SET nome = ?, cor = ? WHERE id = ?')
      .run(nomeLimpo, corLimpa, inteiro(id, 'Faculdade'));
  }

  excluirFaculdade(id) {
    this.db.prepare('DELETE FROM faculdade WHERE id = ?').run(inteiro(id, 'Faculdade'));
  }

  // ---------- Semestres ----------

  criarSemestre({ faculdadeId }) {
    const fid = inteiro(faculdadeId, 'Faculdade');
    const { proximo } = this.db
      .prepare('SELECT COALESCE(MAX(numero), 0) + 1 AS proximo FROM semestre WHERE faculdade_id = ?')
      .get(fid);
    const { lastInsertRowid } = this.db
      .prepare('INSERT INTO semestre (faculdade_id, numero) VALUES (?, ?)')
      .run(fid, proximo);
    return Number(lastInsertRowid);
  }

  definirStatusSemestre({ id, status }) {
    this.db.prepare('UPDATE semestre SET status = ? WHERE id = ?')
      .run(emConjunto(status, STATUS_CURSO, 'Status'), inteiro(id, 'Semestre'));
  }

  excluirSemestre(id) {
    this.db.prepare('DELETE FROM semestre WHERE id = ?').run(inteiro(id, 'Semestre'));
  }

  // ---------- Matérias ----------

  listarMateriasParaSelecao() {
    return this.db.prepare(`
      SELECT m.id, m.nome, m.professor, m.status,
             s.id AS semestre_id, s.numero AS semestre_numero, s.status AS semestre_status,
             f.id AS faculdade_id, f.nome AS faculdade_nome, f.cor AS faculdade_cor
      FROM materia m
      JOIN semestre s ON s.id = m.semestre_id
      JOIN faculdade f ON f.id = s.faculdade_id
      ORDER BY f.nome, s.numero, m.nome COLLATE NOCASE
    `).all();
  }

  criarMateria({ semestreId, nome, professor }) {
    const { lastInsertRowid } = this.db
      .prepare('INSERT INTO materia (semestre_id, nome, professor) VALUES (?, ?, ?)')
      .run(
        inteiro(semestreId, 'Semestre'),
        texto(nome, 'Nome da matéria', { max: 120 }),
        texto(professor, 'Professor', { obrigatorio: false, max: 120 }),
      );
    return Number(lastInsertRowid);
  }

  atualizarMateria({ id, nome, professor, status }) {
    this.db.prepare('UPDATE materia SET nome = ?, professor = ?, status = ? WHERE id = ?').run(
      texto(nome, 'Nome da matéria', { max: 120 }),
      texto(professor, 'Professor', { obrigatorio: false, max: 120 }),
      emConjunto(status, STATUS_CURSO, 'Status'),
      inteiro(id, 'Matéria'),
    );
  }

  definirStatusMateria({ id, status }) {
    this.db.prepare('UPDATE materia SET status = ? WHERE id = ?')
      .run(emConjunto(status, STATUS_CURSO, 'Status'), inteiro(id, 'Matéria'));
  }

  excluirMateria(id) {
    this.db.prepare('DELETE FROM materia WHERE id = ?').run(inteiro(id, 'Matéria'));
  }

  // ---------- Atividades ----------

  _selectAtividade() {
    return `
      SELECT a.*,
             m.nome AS materia_nome, m.professor AS materia_professor,
             s.numero AS semestre_numero,
             f.id AS faculdade_id, f.nome AS faculdade_nome, f.cor AS faculdade_cor
      FROM atividade a
      JOIN materia m ON m.id = a.materia_id
      JOIN semestre s ON s.id = m.semestre_id
      JOIN faculdade f ON f.id = s.faculdade_id
    `;
  }

  listarAtividades({ inicio, fim }) {
    if (!RE_DATA.test(inicio) || !RE_DATA.test(fim)) throw new Error('Período inválido.');
    return this.db
      .prepare(`${this._selectAtividade()} WHERE a.data BETWEEN ? AND ? ORDER BY a.data, a.hora IS NULL, a.hora, a.titulo`)
      .all(inicio, fim);
  }

  listarPendentes() {
    return this.db
      .prepare(`${this._selectAtividade()} WHERE a.status = 'pendente' ORDER BY a.data, a.hora IS NULL, a.hora, a.titulo`)
      .all();
  }

  listarConcluidasRecentes({ limite = 30 } = {}) {
    return this.db
      .prepare(`${this._selectAtividade()} WHERE a.status = 'concluida' ORDER BY a.data DESC, a.titulo LIMIT ?`)
      .all(Math.min(Math.max(Number(limite) || 30, 1), 200));
  }

  obterAtividade(id) {
    const linha = this.db.prepare(`${this._selectAtividade()} WHERE a.id = ?`).get(inteiro(id, 'Atividade'));
    if (!linha) throw new Error('Atividade não encontrada.');
    return linha;
  }

  _validarAtividade({ materiaId, tipo, titulo, descricao, data, hora }) {
    if (!RE_DATA.test(data ?? '')) throw new Error('Data inválida.');
    const horaLimpa = hora ? hora.trim() : '';
    if (horaLimpa && !RE_HORA.test(horaLimpa)) throw new Error('Hora inválida.');
    return {
      materiaId: inteiro(materiaId, 'Matéria'),
      tipo: emConjunto(tipo, TIPOS, 'Tipo'),
      titulo: texto(titulo, 'Título', { max: 200 }),
      descricao: texto(descricao, 'Descrição', { obrigatorio: false, max: 5000 }),
      data,
      hora: horaLimpa || null,
    };
  }

  criarAtividade(dados) {
    const v = this._validarAtividade(dados);
    const { lastInsertRowid } = this.db
      .prepare('INSERT INTO atividade (materia_id, tipo, titulo, descricao, data, hora) VALUES (?, ?, ?, ?, ?, ?)')
      .run(v.materiaId, v.tipo, v.titulo, v.descricao, v.data, v.hora);
    return Number(lastInsertRowid);
  }

  atualizarAtividade(dados) {
    const v = this._validarAtividade(dados);
    this.db
      .prepare('UPDATE atividade SET materia_id = ?, tipo = ?, titulo = ?, descricao = ?, data = ?, hora = ? WHERE id = ?')
      .run(v.materiaId, v.tipo, v.titulo, v.descricao, v.data, v.hora, inteiro(dados.id, 'Atividade'));
  }

  definirStatusAtividade({ id, status }) {
    this.db.prepare('UPDATE atividade SET status = ? WHERE id = ?')
      .run(emConjunto(status, STATUS_ATIVIDADE, 'Status'), inteiro(id, 'Atividade'));
  }

  excluirAtividade(id) {
    this.db.prepare('DELETE FROM atividade WHERE id = ?').run(inteiro(id, 'Atividade'));
  }

  // ---------- Lembretes ----------

  _selectLembrete() {
    return `
      SELECT l.*,
             f.nome AS faculdade_nome, f.cor AS faculdade_cor,
             m.nome AS materia_nome
      FROM lembrete l
      JOIN faculdade f ON f.id = l.faculdade_id
      LEFT JOIN materia m ON m.id = l.materia_id
    `;
  }

  listarLembretes({ inicio, fim }) {
    if (!RE_DATA.test(inicio) || !RE_DATA.test(fim)) throw new Error('Período inválido.');
    return this.db
      .prepare(`${this._selectLembrete()} WHERE l.data BETWEEN ? AND ? ORDER BY l.data, l.titulo`)
      .all(inicio, fim);
  }

  listarLembretesPendentes() {
    return this.db
      .prepare(`${this._selectLembrete()} WHERE l.status = 'pendente' ORDER BY l.data, l.titulo`)
      .all();
  }

  obterLembrete(id) {
    const linha = this.db.prepare(`${this._selectLembrete()} WHERE l.id = ?`).get(inteiro(id, 'Lembrete'));
    if (!linha) throw new Error('Lembrete não encontrado.');
    return linha;
  }

  _validarLembrete({ faculdadeId, materiaId, titulo, descricao, data }) {
    if (!RE_DATA.test(data ?? '')) throw new Error('Data inválida.');
    const fid = inteiro(faculdadeId, 'Faculdade');
    let mid = null;
    if (materiaId) {
      mid = inteiro(materiaId, 'Matéria');
      const dono = this.db.prepare(`
        SELECT s.faculdade_id FROM materia m JOIN semestre s ON s.id = m.semestre_id WHERE m.id = ?
      `).get(mid);
      if (!dono || dono.faculdade_id !== fid) throw new Error('A matéria escolhida não pertence a essa faculdade.');
    }
    return {
      faculdadeId: fid,
      materiaId: mid,
      titulo: texto(titulo, 'Título', { max: 200 }),
      descricao: texto(descricao, 'Descrição', { obrigatorio: false, max: 5000 }),
      data,
    };
  }

  criarLembrete(dados) {
    const v = this._validarLembrete(dados);
    const { lastInsertRowid } = this.db
      .prepare('INSERT INTO lembrete (faculdade_id, materia_id, titulo, descricao, data) VALUES (?, ?, ?, ?, ?)')
      .run(v.faculdadeId, v.materiaId, v.titulo, v.descricao, v.data);
    return Number(lastInsertRowid);
  }

  atualizarLembrete(dados) {
    const v = this._validarLembrete(dados);
    this.db
      .prepare('UPDATE lembrete SET faculdade_id = ?, materia_id = ?, titulo = ?, descricao = ?, data = ? WHERE id = ?')
      .run(v.faculdadeId, v.materiaId, v.titulo, v.descricao, v.data, inteiro(dados.id, 'Lembrete'));
  }

  definirStatusLembrete({ id, status }) {
    this.db.prepare('UPDATE lembrete SET status = ? WHERE id = ?')
      .run(emConjunto(status, STATUS_ATIVIDADE, 'Status'), inteiro(id, 'Lembrete'));
  }

  excluirLembrete(id) {
    this.db.prepare('DELETE FROM lembrete WHERE id = ?').run(inteiro(id, 'Lembrete'));
  }

  // ---------- Agentes de chat ----------

  listarAgentes() {
    return this.db.prepare(`
      SELECT a.*,
             COUNT(m.id) AS qtd_mensagens,
             MAX(m.criada_em) AS ultima_mensagem_em
      FROM agente a
      LEFT JOIN mensagem m ON m.agente_id = a.id
      GROUP BY a.id
      ORDER BY COALESCE(MAX(m.criada_em), a.criado_em) DESC
    `).all();
  }

  obterAgente(id) {
    const linha = this.db.prepare('SELECT * FROM agente WHERE id = ?').get(inteiro(id, 'Agente'));
    if (!linha) throw new Error('Chat não encontrado.');
    return linha;
  }

  criarAgente({ tema, descricao, modelo }) {
    const { lastInsertRowid } = this.db
      .prepare('INSERT INTO agente (tema, descricao, modelo) VALUES (?, ?, ?)')
      .run(
        texto(tema, 'Tema', { max: 120 }),
        texto(descricao, 'Descrição', { max: 20000 }),
        emConjunto(modelo, MODELOS, 'Modelo'),
      );
    return Number(lastInsertRowid);
  }

  // Alterar o contexto invalida a sessão do Claude Code: a próxima mensagem abre uma sessão nova com o histórico salvo.
  atualizarAgente({ id, tema, descricao, modelo }) {
    this.db.prepare(`
      UPDATE agente SET tema = ?, descricao = ?, modelo = ?, sessao_id = NULL,
                        atualizado_em = datetime('now', 'localtime')
      WHERE id = ?
    `).run(
      texto(tema, 'Tema', { max: 120 }),
      texto(descricao, 'Descrição', { max: 20000 }),
      emConjunto(modelo, MODELOS, 'Modelo'),
      inteiro(id, 'Agente'),
    );
  }

  definirSessaoAgente({ id, sessaoId }) {
    this.db.prepare('UPDATE agente SET sessao_id = ? WHERE id = ?')
      .run(sessaoId ? String(sessaoId) : null, inteiro(id, 'Agente'));
  }

  excluirAgente(id) {
    this.db.prepare('DELETE FROM agente WHERE id = ?').run(inteiro(id, 'Agente'));
  }

  listarMensagens(agenteId) {
    return this.db
      .prepare('SELECT * FROM mensagem WHERE agente_id = ? ORDER BY id')
      .all(inteiro(agenteId, 'Agente'))
      .map((m) => ({ ...m, anexos: m.anexos ? JSON.parse(m.anexos) : [] }));
  }

  // anexos = nomes dos arquivos de imagem salvos pelo processo principal; com anexo o texto pode ser vazio.
  adicionarMensagem({ agenteId, papel, conteudo, anexos = [] }) {
    if (!Array.isArray(anexos) || anexos.some((a) => typeof a !== 'string')) throw new Error('Anexos inválidos.');
    const corpo = anexos.length
      ? (texto(conteudo, 'Mensagem', { obrigatorio: false, max: 200000 }) ?? '')
      : texto(conteudo, 'Mensagem', { max: 200000 });
    const { lastInsertRowid } = this.db
      .prepare('INSERT INTO mensagem (agente_id, papel, conteudo, anexos) VALUES (?, ?, ?, ?)')
      .run(inteiro(agenteId, 'Agente'), emConjunto(papel, PAPEIS, 'Papel'), corpo, anexos.length ? JSON.stringify(anexos) : null);
    return Number(lastInsertRowid);
  }

  limparMensagens(agenteId) {
    const id = inteiro(agenteId, 'Agente');
    this._transacao(() => {
      this.db.prepare('DELETE FROM mensagem WHERE agente_id = ?').run(id);
      this.db.prepare('UPDATE agente SET sessao_id = NULL WHERE id = ?').run(id);
    });
  }
}

module.exports = { Banco };
