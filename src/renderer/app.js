const TIPOS = {
  tarefa: 'Tarefa',
  trabalho: 'Trabalho',
  prova: 'Prova',
};
const STATUS_CURSO = { pendente: 'Pendente', cursando: 'Cursando', concluido: 'Concluído' };
const STATUS_PROJETO = { trabalhando: 'Trabalhando', futuro: 'Futuro', finalizado: 'Finalizado' };
const STATUS_RICE = { em_progresso: 'Em progresso', concluido: 'Concluído', block: 'Block' };
const MODELOS = {
  opus: { rotulo: 'Opus', descricao: 'mais capaz, consome mais do limite do plano' },
  sonnet: { rotulo: 'Sonnet', descricao: 'equilibrado' },
  haiku: { rotulo: 'Haiku', descricao: 'rápido, consome menos' },
};
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const agora = new Date();
const estado = {
  ano: agora.getFullYear(),
  mes: agora.getMonth(),
  faculdadesOcultas: new Set(),
  projetosOcultos: new Set(),
  mostrarConcluidas: false,
  semestresAbertos: new Map(),
  ricesAbertos: new Map(),
  chatEnviando: false,
  chatImagens: [],
};

const TIPOS_IMAGEM = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_IMAGENS = 5;
const MAX_BYTES_IMAGEM = 5 * 1024 * 1024;

const conteudo = document.getElementById('conteudo');
const modal = document.getElementById('modal');
const modalCaixa = document.getElementById('modal-caixa');
const toast = document.getElementById('toast');

// ---------- Utilidades ----------

function esc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hojeISO = () => iso(new Date());
function dataDeISO(s) {
  const [a, m, d] = s.split('-').map(Number);
  return new Date(a, m - 1, d);
}
function formatarDataLonga(s) {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(dataDeISO(s));
}
const diasEntre = (a, b) => Math.round((dataDeISO(b) - dataDeISO(a)) / 86400000);
const horaDe = (dataHora) => (dataHora ? dataHora.slice(11, 16) : '');

function textoPrazo(item) {
  if (item.status === 'concluida') return { texto: 'concluída', classe: '' };
  const d = diasEntre(hojeISO(), item.data);
  if (d < 0) return { texto: d === -1 ? 'atrasada 1 dia' : `atrasada ${-d} dias`, classe: 'atrasada' };
  if (d === 0) return { texto: 'hoje', classe: 'hoje' };
  if (d === 1) return { texto: 'amanhã', classe: '' };
  return { texto: `em ${d} dias`, classe: '' };
}

let toastTimer;
function mostrarToast(mensagem, tipo = 'erro') {
  toast.textContent = mensagem;
  toast.className = `toast ${tipo}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('oculto'), tipo === 'erro' ? 6000 : 2500);
}

async function chamar(metodo, args) {
  try {
    return await window.api.banco(metodo, args);
  } catch (erro) {
    mostrarToast(erro.message);
    throw erro;
  }
}

function pontoFaculdade(cor) {
  return `<i class="ponto" style="--cor:${esc(cor)}"></i>`;
}

// Markdown mínimo pras respostas do Claude: blocos de código, títulos, listas, negrito, código inline e links.
function renderizarMarkdown(texto) {
  const blocos = [];
  let fonte = String(texto ?? '').replace(/\r\n/g, '\n');
  fonte = fonte.replace(/```[^\n]*\n([\s\S]*?)```/g, (_, codigo) => {
    blocos.push(`<pre><code>${esc(codigo.replace(/\n$/, ''))}</code></pre>`);
    return `\u0000${blocos.length - 1}\u0000`;
  });

  const inline = (s) => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  const linhas = fonte.split('\n');
  let html = '';
  let parag = [];
  let lista = null;
  const fecharParag = () => {
    if (parag.length) { html += `<p>${parag.map(inline).join('<br>')}</p>`; parag = []; }
  };
  const fecharLista = () => {
    if (lista) { html += `<${lista.tag}>${lista.itens.map((i) => `<li>${inline(i)}</li>`).join('')}</${lista.tag}>`; lista = null; }
  };

  for (const linha of linhas) {
    const bloco = linha.match(/^\u0000(\d+)\u0000$/);
    if (bloco) { fecharParag(); fecharLista(); html += blocos[Number(bloco[1])]; continue; }
    const titulo = linha.match(/^(#{1,3})\s+(.*)$/);
    if (titulo) { fecharParag(); fecharLista(); html += `<h${titulo[1].length + 1}>${inline(titulo[2])}</h${titulo[1].length + 1}>`; continue; }
    const itemNum = linha.match(/^\s*\d+[.)]\s+(.*)$/);
    const itemPonto = linha.match(/^\s*[-*•]\s+(.*)$/);
    if (itemNum || itemPonto) {
      fecharParag();
      const tag = itemNum ? 'ol' : 'ul';
      if (!lista || lista.tag !== tag) { fecharLista(); lista = { tag, itens: [] }; }
      lista.itens.push((itemNum || itemPonto)[1]);
      continue;
    }
    if (!linha.trim()) { fecharParag(); fecharLista(); continue; }
    fecharLista();
    parag.push(linha);
  }
  fecharParag();
  fecharLista();
  return html;
}

// ---------- Tema ----------

function aplicarTema(tema) {
  if (tema === 'light' || tema === 'dark') document.documentElement.dataset.theme = tema;
  else delete document.documentElement.dataset.theme;
  localStorage.setItem('tema', tema);
  document.querySelectorAll('.tema-seletor button').forEach((b) => b.classList.toggle('ativo', b.dataset.tema === tema));
}

// ---------- Rotas ----------

function rotaAtual() {
  const partes = location.hash.replace(/^#\/?/, '').split('/');
  const nome = partes[0] || 'calendario';
  return { nome, parametro: partes[1] ? Number(partes[1]) : null };
}

async function renderizar() {
  const { nome, parametro } = rotaAtual();
  document.querySelectorAll('.menu a').forEach((a) => a.classList.toggle('ativo', a.dataset.rota === nome));
  conteudo.classList.remove('chat-aberto');
  switch (nome) {
    case 'proximas': return renderProximas();
    case 'faculdades': return renderFaculdades();
    case 'projetos': return renderProjetos();
    case 'chats': return parametro ? renderChat(parametro) : renderChats();
    default: return renderCalendario();
  }
}

// ---------- Calendário ----------

async function renderCalendario() {
  const { ano, mes } = estado;
  const deslocamento = new Date(ano, mes, 1).getDay();
  const inicio = iso(new Date(ano, mes, 1 - deslocamento));
  const fim = iso(new Date(ano, mes, 1 - deslocamento + 41));

  const [atividades, lembretes, faculdades, tarefasRice, projetos] = await Promise.all([
    chamar('listarAtividades', { inicio, fim }),
    chamar('listarLembretes', { inicio, fim }),
    chamar('listarFaculdades'),
    chamar('listarTarefasRice', { inicio, fim }),
    chamar('listarProjetos'),
  ]);

  const porDia = new Map();
  const adicionar = (item) => {
    const oculto = item.origem === 'rice' ? estado.projetosOcultos.has(item.projeto_id) : estado.faculdadesOcultas.has(item.faculdade_id);
    if (oculto) return;
    if (!porDia.has(item.data)) porDia.set(item.data, []);
    porDia.get(item.data).push(item);
  };
  lembretes.forEach(adicionar);
  atividades.forEach(adicionar);
  tarefasRice.forEach((t) => adicionar({ ...t, origem: 'rice' }));

  const hoje = hojeISO();
  let celulas = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(ano, mes, 1 - deslocamento + i);
    const chave = iso(d);
    const classes = ['dia', d.getMonth() !== mes ? 'fora' : '', chave === hoje ? 'hoje' : ''].join(' ');
    const itens = (porDia.get(chave) ?? [])
      .map((it) => (it.origem === 'rice' ? chipTarefaRice(it) : it.tipo ? chipAtividade(it) : chipLembrete(it)))
      .join('');
    celulas += `
      <div class="${classes}" data-dia="${chave}">
        <div class="dia-topo">
          <span class="dia-num">${d.getDate()}</span>
          <span class="dia-botoes">
            <button class="dia-add" title="Novo lembrete neste dia" data-novo-lembrete="${chave}">🔔</button>
            <button class="dia-add" title="Nova atividade neste dia" data-nova="${chave}">+</button>
          </span>
        </div>
        <div class="dia-itens">${itens}</div>
      </div>`;
  }

  const filtros = faculdades.map((f) => `
    <button class="filtro ${estado.faculdadesOcultas.has(f.id) ? 'inativo' : ''}" data-filtro="${f.id}" title="Mostrar/ocultar">
      ${pontoFaculdade(f.cor)}${esc(f.nome)}
    </button>`).join('') + projetos.filter((p) => p.status !== 'finalizado').map((p) => `
    <button class="filtro ${estado.projetosOcultos.has(p.id) ? 'inativo' : ''}" data-filtro-projeto="${p.id}" title="Projeto: mostrar/ocultar">
      ${pontoFaculdade(p.cor)}${esc(p.nome)}
    </button>`).join('');

  conteudo.innerHTML = `
    <header class="topo">
      <div class="topo-titulo">
        <button class="btn btn-icone" data-acao="mes-anterior" title="Mês anterior">‹</button>
        <h1>${MESES[mes]} de ${ano}</h1>
        <button class="btn btn-icone" data-acao="mes-seguinte" title="Mês seguinte">›</button>
        <button class="btn" data-acao="hoje">Hoje</button>
      </div>
      <div class="filtros">${filtros}</div>
    </header>
    <div>
      <div class="semana-cabecalho">${DIAS_SEMANA.map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="grade">${celulas}</div>
    </div>`;
}

function chipAtividade(a) {
  return `
    <button class="chip tipo-${a.tipo} ${a.status === 'concluida' ? 'concluida' : ''}" data-atividade="${a.id}"
            title="${esc(TIPOS[a.tipo])}: ${esc(a.titulo)} · ${esc(a.materia_nome)} (${esc(a.faculdade_nome)})">
      ${pontoFaculdade(a.faculdade_cor)}
      <span class="chip-texto">${a.hora ? `<b>${esc(a.hora)}</b> ` : ''}${esc(a.titulo)}</span>
    </button>`;
}

function chipLembrete(l) {
  return `
    <button class="chip lembrete tipo-lembrete ${l.status === 'concluida' ? 'concluida' : ''}" data-lembrete="${l.id}"
            title="Lembrete: ${esc(l.titulo)} (${esc(l.faculdade_nome)}${l.materia_nome ? ` · ${esc(l.materia_nome)}` : ''})">
      ${pontoFaculdade(l.faculdade_cor)}
      <span class="chip-texto">🔔 ${esc(l.titulo)}</span>
    </button>`;
}

function chipTarefaRice(t) {
  return `
    <button class="chip tipo-projeto ${t.status === 'concluida' ? 'concluida' : ''}" data-tarefa-rice="${t.id}"
            title="Projeto ${esc(t.projeto_nome)} · RICE ${esc(t.rice_nome)}: ${esc(t.titulo)}">
      ${pontoFaculdade(t.projeto_cor)}
      <span class="chip-texto">${t.hora ? `<b>${esc(t.hora)}</b> ` : ''}${esc(t.titulo)}</span>
    </button>`;
}

// ---------- Próximas ----------

async function renderProximas() {
  const [atividades, lembretes, tarefasRice] = await Promise.all([
    chamar('listarPendentes'), chamar('listarLembretesPendentes'), chamar('listarTarefasRicePendentes'),
  ]);
  const concluidas = estado.mostrarConcluidas
    ? [
      ...await chamar('listarConcluidasRecentes', { limite: 30 }),
      ...(await chamar('listarTarefasRiceConcluidasRecentes', { limite: 30 })).map((t) => ({ ...t, origem: 'rice' })),
    ].sort((a, b) => b.data.localeCompare(a.data))
    : [];
  const hoje = hojeISO();

  const pendentes = [...atividades, ...lembretes, ...tarefasRice.map((t) => ({ ...t, origem: 'rice' }))].sort((a, b) => a.data.localeCompare(b.data) || (a.hora ?? '').localeCompare(b.hora ?? ''));
  const grupos = { atrasadas: [], hoje: [], semana: [], depois: [] };
  for (const item of pendentes) {
    const d = diasEntre(hoje, item.data);
    if (d < 0) grupos.atrasadas.push(item);
    else if (d === 0) grupos.hoje.push(item);
    else if (d <= 7) grupos.semana.push(item);
    else grupos.depois.push(item);
  }

  const secao = (chave, titulo, lista) => lista.length ? `
    <section class="secao ${chave}">
      <h3 class="secao-titulo">${titulo} <span class="contagem">${lista.length}</span></h3>
      ${lista.map(itemLista).join('')}
    </section>` : '';

  conteudo.innerHTML = `
    <header class="topo">
      <h1>Próximas atividades</h1>
      <button class="btn" data-acao="alternar-concluidas">${estado.mostrarConcluidas ? 'Ocultar concluídas' : 'Mostrar concluídas'}</button>
    </header>
    ${pendentes.length ? '' : '<div class="vazio">Nada pendente. Use "+ Nova atividade", "+ Novo lembrete" ou clique em um dia do calendário.</div>'}
    ${secao('atrasadas', 'Atrasadas', grupos.atrasadas)}
    ${secao('hoje', 'Hoje', grupos.hoje)}
    ${secao('semana', 'Próximos 7 dias', grupos.semana)}
    ${secao('depois', 'Mais adiante', grupos.depois)}
    ${secao('concluidas', 'Concluídas recentemente', concluidas)}`;
}

function itemLista(item) {
  if (item.origem === 'rice') return itemListaRice(item);
  const data = dataDeISO(item.data);
  const prazo = textoPrazo(item);
  const lembrete = !item.tipo;
  const concluida = item.status === 'concluida';
  const meta = lembrete
    ? `${esc(item.faculdade_nome)}${item.materia_nome ? ` · ${esc(item.materia_nome)}` : ''}`
    : `${esc(item.faculdade_nome)} · Semestre ${item.semestre_numero} · ${esc(item.materia_nome)}${item.hora ? ` · ${esc(item.hora)}` : ''}`;
  return `
    <article class="item ${lembrete ? 'lembrete tipo-lembrete' : `tipo-${item.tipo}`} ${concluida ? 'concluida' : ''}"
             ${lembrete ? `data-lembrete="${item.id}"` : `data-atividade="${item.id}"`}>
      <label class="check" title="${concluida ? 'Reabrir' : 'Marcar como concluída'}">
        <input type="checkbox" ${lembrete ? `data-concluir-lembrete="${item.id}"` : `data-concluir="${item.id}"`} ${concluida ? 'checked' : ''}>
      </label>
      <div class="item-data"><b>${data.getDate()}</b><span>${MESES_CURTOS[data.getMonth()]}</span></div>
      <div class="item-corpo">
        <div class="item-titulo">${esc(item.titulo)}</div>
        <div class="item-meta">${pontoFaculdade(item.faculdade_cor)}<span>${meta}</span></div>
      </div>
      <span class="badge ${lembrete ? 'tipo-lembrete' : `tipo-${item.tipo}`}">${lembrete ? 'Lembrete' : TIPOS[item.tipo]}</span>
      <span class="prazo ${prazo.classe}">${prazo.texto}</span>
    </article>`;
}

function itemListaRice(t) {
  const data = dataDeISO(t.data);
  const prazo = textoPrazo(t);
  const concluida = t.status === 'concluida';
  return `
    <article class="item tipo-projeto ${concluida ? 'concluida' : ''}" data-tarefa-rice="${t.id}">
      <label class="check" title="${concluida ? 'Reabrir' : 'Marcar como concluída'}">
        <input type="checkbox" data-concluir-tarefa-rice="${t.id}" ${concluida ? 'checked' : ''}>
      </label>
      <div class="item-data"><b>${data.getDate()}</b><span>${MESES_CURTOS[data.getMonth()]}</span></div>
      <div class="item-corpo">
        <div class="item-titulo">${esc(t.titulo)}</div>
        <div class="item-meta">${pontoFaculdade(t.projeto_cor)}<span>${esc(t.projeto_nome)} · RICE ${esc(t.rice_nome)}${t.hora ? ` · ${esc(t.hora)}` : ''}</span></div>
      </div>
      <span class="badge tipo-projeto">Projeto</span>
      <span class="prazo ${prazo.classe}">${prazo.texto}</span>
    </article>`;
}

// ---------- Projetos ----------

function opcoesDe(rotulos, atual) {
  return Object.entries(rotulos)
    .map(([v, r]) => `<option value="${v}" ${v === atual ? 'selected' : ''}>${r}</option>`)
    .join('');
}

async function renderProjetos() {
  const projetos = await chamar('listarEstruturaProjetos');
  conteudo.innerHTML = `
    <header class="topo"><h1>Projetos</h1></header>
    ${projetos.length ? projetos.map(cardProjeto).join('') : '<div class="vazio">Nenhum projeto ainda. Crie o primeiro abaixo.</div>'}
    <section class="card">
      <h2>Novo projeto</h2>
      <form class="form-inline form-nova-faculdade" data-form="novo-projeto">
        <label>Nome <input type="text" name="nome" required maxlength="120" placeholder="Ex.: Migração do ERP"></label>
        <label>Cor <input type="color" name="cor" value="#ea580c"></label>
        <label>Status <select name="status">${opcoesDe(STATUS_PROJETO, 'trabalhando')}</select></label>
        <button class="btn btn-primario">Adicionar</button>
      </form>
    </section>`;
}

function cardProjeto(p) {
  return `
    <section class="card projeto status-${p.status}" data-projeto="${p.id}">
      <header class="card-topo">
        <h2>${pontoFaculdade(p.cor)}${esc(p.nome)}</h2>
        <div class="acoes">
          <select class="pequeno" data-status-projeto="${p.id}" title="Status do projeto">${opcoesDe(STATUS_PROJETO, p.status)}</select>
          <button class="btn btn-pequeno" data-editar-projeto="${p.id}">Editar</button>
          <button class="btn btn-pequeno btn-perigo" data-excluir-projeto="${p.id}">Excluir</button>
        </div>
      </header>
      <div class="semestres">
        ${p.rices.map(blocoRice).join('') || '<div class="vazio">Nenhum RICE ainda.</div>'}
      </div>
      <form class="form-inline" data-form="novo-rice" data-projeto-id="${p.id}">
        <input type="text" name="nome" placeholder="Novo RICE" required maxlength="200">
        <select class="pequeno" name="status" title="Status do RICE">${opcoesDe(STATUS_RICE, 'em_progresso')}</select>
        <input type="text" name="comentario" placeholder="Comentário (opcional)" maxlength="5000">
        <button class="btn btn-primario btn-pequeno">Adicionar RICE</button>
      </form>
    </section>`;
}

function blocoRice(r) {
  const pendentes = r.tarefas.filter((t) => t.status === 'pendente').length;
  const aberto = estado.ricesAbertos.has(r.id) ? estado.ricesAbertos.get(r.id) : r.status !== 'concluido';
  const tarefas = r.tarefas.map((t) => {
    const prazo = textoPrazo(t);
    const concluida = t.status === 'concluida';
    return `
      <li class="materia tarefa-rice ${concluida ? 'status-concluido' : ''}">
        <label class="check" title="${concluida ? 'Reabrir' : 'Marcar como concluída'}">
          <input type="checkbox" data-concluir-tarefa-rice="${t.id}" ${concluida ? 'checked' : ''}>
        </label>
        <button class="tarefa-rice-titulo" data-tarefa-rice="${t.id}" title="Ver detalhes">
          <span class="materia-nome">${esc(t.titulo)}</span>
          <span class="materia-contagem">📅 ${dataDeISO(t.data).toLocaleDateString('pt-BR')}${t.hora ? ` às ${esc(t.hora)}` : ''}</span>
        </button>
        <span class="prazo ${prazo.classe}">${prazo.texto}</span>
        <button class="btn btn-pequeno" data-editar-tarefa-rice="${t.id}">Editar</button>
        <button class="btn btn-pequeno btn-perigo" data-excluir-tarefa-rice="${t.id}">Excluir</button>
      </li>`;
  }).join('');

  return `
    <details class="semestre rice rice-${r.status}" data-rice="${r.id}" ${aberto ? 'open' : ''}>
      <summary>
        <span class="rice-nome">${esc(r.nome)}</span>
        <span class="badge-status">${STATUS_RICE[r.status]}</span>
        <span class="semestre-info">${pendentes} pendente(s) · ${r.tarefas.length} tarefa(s)</span>
      </summary>
      <div class="semestre-corpo">
        ${r.comentario ? `<div class="rice-comentario">${esc(r.comentario)}</div>` : ''}
        <div class="linha-acoes">
          <label>Status do RICE <select class="pequeno" data-status-rice="${r.id}">${opcoesDe(STATUS_RICE, r.status)}</select></label>
          <span class="acoes">
            <button class="btn btn-pequeno" data-editar-rice="${r.id}">Editar RICE</button>
            <button class="btn btn-leve btn-pequeno btn-perigo" data-excluir-rice="${r.id}">Excluir RICE</button>
          </span>
        </div>
        <ul class="materias">${tarefas}</ul>
        <form class="form-inline" data-form="nova-tarefa-rice" data-rice-id="${r.id}">
          <input type="text" name="titulo" placeholder="Nova tarefa" required maxlength="200">
          <input type="date" name="data" required value="${hojeISO()}" title="Data de entrega" style="flex:0 0 auto">
          <button class="btn btn-primario btn-pequeno">Adicionar tarefa</button>
        </form>
      </div>
    </details>`;
}

// ---------- Faculdades ----------

async function renderFaculdades() {
  const [estrutura, info] = await Promise.all([chamar('listarEstrutura'), window.api.info()]);

  conteudo.innerHTML = `
    <header class="topo"><h1>Faculdades e matérias</h1></header>
    ${estrutura.map(cardFaculdade).join('')}
    <section class="card">
      <h2>Nova faculdade</h2>
      <form class="form-inline form-nova-faculdade" data-form="nova-faculdade">
        <label>Nome <input type="text" name="nome" required maxlength="80" placeholder="Ex.: Unicid"></label>
        <label>Cor <input type="color" name="cor" value="#db2777"></label>
        <label>Semestres <input type="number" name="qtdSemestres" min="0" max="20" value="8"></label>
        <button class="btn btn-primario">Adicionar</button>
      </form>
    </section>
    <div class="rodape-info">
      <span>Banco de dados: <code>${esc(info.caminhoBanco)}</code></span>
      <button class="btn btn-leve btn-pequeno" data-acao="abrir-pasta-banco">Abrir pasta</button>
    </div>`;
}

function cardFaculdade(f) {
  return `
    <section class="card" data-faculdade="${f.id}">
      <header class="card-topo">
        <h2>${pontoFaculdade(f.cor)}${esc(f.nome)}</h2>
        <div class="acoes">
          <button class="btn btn-pequeno" data-editar-faculdade="${f.id}">Editar</button>
          <button class="btn btn-pequeno btn-perigo" data-excluir-faculdade="${f.id}">Excluir</button>
        </div>
      </header>
      <div class="semestres">
        ${f.semestres.map(blocoSemestre).join('') || '<div class="vazio">Nenhum semestre ainda.</div>'}
      </div>
      <div><button class="btn btn-leve" data-novo-semestre="${f.id}">+ Adicionar semestre</button></div>
    </section>`;
}

function opcoesStatus(atual) {
  return Object.entries(STATUS_CURSO)
    .map(([v, r]) => `<option value="${v}" ${v === atual ? 'selected' : ''}>${r}</option>`)
    .join('');
}

function blocoSemestre(s) {
  const aberto = estado.semestresAbertos.has(s.id) ? estado.semestresAbertos.get(s.id) : s.status === 'cursando';
  const materias = s.materias.map((m) => `
    <li class="materia status-${m.status}" data-materia="${m.id}">
      <div class="materia-info">
        <span class="materia-nome">${esc(m.nome)}</span>
        ${m.professor ? `<span class="materia-prof">${esc(m.professor)}</span>` : ''}
        <span class="materia-contagem">${m.qtd_pendentes} pendente(s) · ${m.qtd_atividades} no total</span>
      </div>
      <select class="pequeno" data-status-materia="${m.id}" title="Status da matéria">${opcoesStatus(m.status)}</select>
      <button class="btn btn-pequeno" data-editar-materia="${m.id}">Editar</button>
      <button class="btn btn-pequeno btn-perigo" data-excluir-materia="${m.id}">Excluir</button>
    </li>`).join('');

  return `
    <details class="semestre status-${s.status}" data-semestre="${s.id}" ${aberto ? 'open' : ''}>
      <summary>
        <span>Semestre ${s.numero}</span>
        <span class="badge-status">${STATUS_CURSO[s.status]}</span>
        <span class="semestre-info">${s.materias.length} matéria(s)</span>
      </summary>
      <div class="semestre-corpo">
        <div class="linha-acoes">
          <label>Status do semestre <select class="pequeno" data-status-semestre="${s.id}">${opcoesStatus(s.status)}</select></label>
          <button class="btn btn-leve btn-pequeno btn-perigo" data-excluir-semestre="${s.id}">Excluir semestre</button>
        </div>
        <ul class="materias">${materias}</ul>
        <form class="form-inline" data-form="nova-materia" data-semestre-id="${s.id}">
          <input type="text" name="nome" placeholder="Nova matéria" required maxlength="120">
          <input type="text" name="professor" placeholder="Professor (opcional)" maxlength="120">
          <button class="btn btn-primario btn-pequeno">Adicionar matéria</button>
        </form>
      </div>
    </details>`;
}

// ---------- Chats ----------

function badgeModelo(modelo) {
  return `<span class="modelo-badge" title="${esc(MODELOS[modelo]?.descricao ?? '')}">${esc(MODELOS[modelo]?.rotulo ?? modelo)}</span>`;
}

async function renderChats() {
  const [agentes, status] = await Promise.all([chamar('listarAgentes'), window.api.claudeStatus()]);

  const aviso = status.disponivel ? '' : `
    <div class="aviso-claude">
      <b>Claude Code não disponível.</b> O chat usa o Claude Code instalado neste computador (e a sua assinatura).
      Instale-o e faça login pelo terminal com o comando <code>claude</code>. Detalhe: ${esc(status.erro ?? '')}
    </div>`;

  const cards = agentes.map((a) => `
    <section class="card agente-card" data-abrir-chat="${a.id}">
      <h2>${esc(a.tema)}</h2>
      <p class="agente-descricao">${esc(a.descricao)}</p>
      <div class="agente-meta">
        <span>${a.qtd_mensagens} mensagem(ns)${a.ultima_mensagem_em ? ` · última em ${esc(a.ultima_mensagem_em.slice(8, 10))}/${esc(a.ultima_mensagem_em.slice(5, 7))}` : ''}</span>
        ${badgeModelo(a.modelo)}
      </div>
    </section>`).join('');

  conteudo.innerHTML = `
    <header class="topo">
      <h1>Chats com o Claude</h1>
      <button class="btn btn-primario" data-acao="novo-chat">+ Novo chat</button>
    </header>
    ${aviso}
    ${agentes.length ? `<div class="agentes">${cards}</div>` : '<div class="vazio">Nenhum chat ainda. Crie um informando o tema e uma descrição — isso vira o contexto de um agente especialista nesse assunto.</div>'}
    <div class="rodape-info"><span>Cada chat roda pelo Claude Code com a sua conta, usando o limite do seu plano. ${status.disponivel ? `Versão: ${esc(status.versao)}` : ''}</span></div>
    <button class="btn btn-primario btn-guia" data-acao="guia-chat" title="Passo a passo para configurar o chat">Como configurar</button>`;
}

function abrirGuiaChat() {
  abrirModal(`
    <h2>Como configurar o chat</h2>
    <pre class="guia-texto">${esc(GUIA_CHAT)}</pre>
    <div class="modal-acoes"><span class="espaco"></span><button type="button" class="btn" data-fechar>Fechar</button></div>`);
  modalCaixa.classList.add('modal-largo');
}

async function renderChat(id) {
  let agente;
  try {
    agente = await chamar('obterAgente', id);
  } catch {
    location.hash = '#/chats';
    return;
  }
  const mensagens = await chamar('listarMensagens', id);
  limparImagensChat();
  conteudo.classList.add('chat-aberto');

  conteudo.innerHTML = `
    <div class="chat" data-chat="${agente.id}">
      <header class="chat-topo">
        <a class="btn btn-leve" href="#/chats" title="Voltar">‹ Chats</a>
        <h1 title="${esc(agente.tema)}">${esc(agente.tema)}</h1>
        ${badgeModelo(agente.modelo)}
        <button class="btn btn-pequeno" data-editar-agente="${agente.id}">Editar contexto</button>
        <button class="btn btn-pequeno btn-leve" data-limpar-chat="${agente.id}">Limpar conversa</button>
        <button class="btn btn-pequeno btn-perigo" data-excluir-agente="${agente.id}">Excluir</button>
      </header>
      <div class="chat-mensagens" id="chat-mensagens">
        <details class="chat-contexto-box"><summary style="cursor:pointer;color:var(--texto-3);font-size:13px">Contexto do agente</summary><div class="chat-contexto">${esc(agente.descricao)}</div></details>
        ${mensagens.length ? mensagens.map(bolhaMensagem).join('') : `<div class="chat-vazio">Esse agente é especialista em <b>${esc(agente.tema)}</b>. Mande a primeira mensagem — a resposta pode levar alguns segundos.</div>`}
      </div>
      <form class="chat-envio" data-form="chat" data-id="${agente.id}">
        <div class="chat-previas" id="chat-previas"></div>
        <button type="button" class="btn btn-leve btn-anexar" data-anexar title="Anexar imagem (também dá pra colar com Ctrl+V ou arrastar)">📎</button>
        <input type="file" id="chat-arquivo" accept="${TIPOS_IMAGEM.join(',')}" multiple hidden>
        <textarea name="mensagem" rows="1" placeholder="Escreva sua mensagem… (Enter envia, Shift+Enter quebra linha, Ctrl+V cola imagem)"></textarea>
        <button class="btn btn-primario" data-enviar>Enviar</button>
      </form>
    </div>`;
  rolarChat();
  conteudo.querySelector('textarea')?.focus();
}

function bolhaMensagem(m) {
  const fontes = m.previas ?? (m.anexos ?? []).map((nome) => `anexo://img/${m.agente_id}/${encodeURIComponent(nome)}`);
  const imagens = fontes.length
    ? `<div class="msg-imagens">${fontes.map((src) => `<img src="${esc(src)}" alt="Imagem anexada" data-ampliar>`).join('')}</div>`
    : '';
  const corpo = m.papel === 'assistant' ? renderizarMarkdown(m.conteudo) : esc(m.conteudo);
  return `<div class="msg ${m.papel}">${imagens}${corpo}<div class="msg-hora">${esc(horaDe(m.criada_em))}</div></div>`;
}

function limparImagensChat() {
  estado.chatImagens.forEach((img) => URL.revokeObjectURL(img.url));
  estado.chatImagens = [];
}

function desenharPrevias() {
  const caixa = document.getElementById('chat-previas');
  if (!caixa) return;
  caixa.innerHTML = estado.chatImagens
    .map((img, i) => `<div class="previa"><img src="${img.url}" alt=""><button type="button" data-remover-imagem="${i}" title="Remover">×</button></div>`)
    .join('');
}

function lerComoBase64(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result).split(',')[1]);
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsDataURL(arquivo);
  });
}

async function adicionarImagensChat(arquivos) {
  for (const arquivo of arquivos) {
    if (!TIPOS_IMAGEM.includes(arquivo.type)) { mostrarToast('Formato não suportado. Use PNG, JPG, GIF ou WEBP.', 'aviso'); continue; }
    if (arquivo.size > MAX_BYTES_IMAGEM) { mostrarToast(`"${arquivo.name}" passa de 5 MB.`, 'aviso'); continue; }
    if (estado.chatImagens.length >= MAX_IMAGENS) { mostrarToast(`No máximo ${MAX_IMAGENS} imagens por mensagem.`, 'aviso'); break; }
    estado.chatImagens.push({ tipo: arquivo.type, dados: await lerComoBase64(arquivo), url: URL.createObjectURL(arquivo) });
  }
  desenharPrevias();
}

function rolarChat() {
  const area = document.getElementById('chat-mensagens');
  if (area) area.scrollTop = area.scrollHeight;
}

async function enviarMensagemChat(form) {
  if (estado.chatEnviando) return;
  const campo = form.elements.mensagem;
  const texto = campo.value.trim();
  const imagens = estado.chatImagens;
  if (!texto && !imagens.length) return;
  const agenteId = Number(form.dataset.id);
  const area = document.getElementById('chat-mensagens');
  area.querySelector('.chat-vazio')?.remove();
  const botoes = form.querySelectorAll('button');

  estado.chatEnviando = true;
  estado.chatImagens = [];
  desenharPrevias();
  campo.value = '';
  campo.style.height = 'auto';
  campo.disabled = true;
  botoes.forEach((b) => { b.disabled = true; });
  area.insertAdjacentHTML('beforeend', bolhaMensagem({
    papel: 'user', conteudo: texto, previas: imagens.map((i) => i.url), criada_em: new Date().toISOString().replace('T', ' '),
  }));
  area.insertAdjacentHTML('beforeend', '<div class="msg assistant pensando" id="msg-pensando">Pensando</div>');
  rolarChat();

  try {
    const resposta = await window.api.claudeEnviar({
      agenteId, mensagem: texto, imagens: imagens.map(({ tipo, dados }) => ({ tipo, dados })),
    });
    document.getElementById('msg-pensando')?.remove();
    area.insertAdjacentHTML('beforeend', bolhaMensagem({ papel: 'assistant', conteudo: resposta.conteudo, criada_em: new Date().toISOString().replace('T', ' ') }));
  } catch (erro) {
    document.getElementById('msg-pensando')?.remove();
    area.insertAdjacentHTML('beforeend', `<div class="msg erro">Falhou: ${esc(erro.message)}</div>`);
  } finally {
    estado.chatEnviando = false;
    if (document.body.contains(campo)) {
      campo.disabled = false;
      botoes.forEach((b) => { b.disabled = false; });
      campo.focus();
    }
    rolarChat();
  }
}

// ---------- Modais ----------

function abrirModal(html) {
  modalCaixa.innerHTML = html;
  modal.classList.remove('oculto');
  const foco = modalCaixa.querySelector('input:not([type=radio]):not([type=color]), select, textarea');
  foco?.focus();
}

function fecharModal() {
  modal.classList.add('oculto');
  modalCaixa.classList.remove('modal-largo');
  modalCaixa.innerHTML = '';
}

const rodapeModal = (textoSalvar = 'Salvar') => `
  <div class="modal-acoes">
    <span class="espaco"></span>
    <button type="button" class="btn" data-fechar>Cancelar</button>
    <button class="btn btn-primario">${textoSalvar}</button>
  </div>`;

function abrirEscolhaDia(data) {
  abrirModal(`
    <h2>O que criar?</h2>
    <p class="detalhe-data">📅 <span>${formatarDataLonga(data)}</span></p>
    <div class="escolha">
      <button class="btn escolha-opcao tipo-tarefa" data-escolha="atividade" data-data="${data}">
        <b>Atividade</b><span>Tarefa, trabalho ou prova de uma matéria</span>
      </button>
      <button class="btn escolha-opcao tipo-lembrete" data-escolha="lembrete" data-data="${data}">
        <b>🔔 Lembrete</b><span>Aviso ligado a uma faculdade, com ou sem matéria</span>
      </button>
      <button class="btn escolha-opcao tipo-projeto" data-escolha="tarefa-rice" data-data="${data}">
        <b>💼 Tarefa de projeto</b><span>Entrega de um RICE de um projeto da empresa</span>
      </button>
    </div>
    <div class="modal-acoes"><span class="espaco"></span><button type="button" class="btn" data-fechar>Cancelar</button></div>`);
}

async function abrirFormularioAtividade({ data, atividade } = {}) {
  const materias = await chamar('listarMateriasParaSelecao');
  if (!materias.length) {
    mostrarToast('Cadastre uma matéria antes de criar atividades.', 'aviso');
    location.hash = '#/faculdades';
    return;
  }

  const a = atividade ?? { tipo: 'tarefa', titulo: '', descricao: '', data: data ?? hojeISO(), hora: '', materia_id: '' };

  const grupos = new Map();
  for (const m of materias) {
    const chave = `${m.faculdade_nome} · Semestre ${m.semestre_numero}`;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(m);
  }
  const opcoes = [...grupos.entries()].map(([rotulo, lista]) => `
    <optgroup label="${esc(rotulo)}">
      ${lista.map((m) => `<option value="${m.id}" ${m.id === a.materia_id ? 'selected' : ''}>${esc(m.nome)}${m.status === 'concluido' ? ' (concluída)' : ''}</option>`).join('')}
    </optgroup>`).join('');

  const tipos = Object.entries(TIPOS).map(([v, r]) => `
    <label class="tipo-opcao tipo-${v}">
      <input type="radio" name="tipo" value="${v}" ${v === a.tipo ? 'checked' : ''}><span>${r}</span>
    </label>`).join('');

  abrirModal(`
    <h2>${a.id ? 'Editar atividade' : 'Nova atividade'}</h2>
    <form data-form="atividade" data-id="${a.id ?? ''}">
      <div class="tipos">${tipos}</div>
      <label>Título <input type="text" name="titulo" required maxlength="200" value="${esc(a.titulo)}" placeholder="Ex.: Lista de exercícios 3"></label>
      <label>Matéria
        <select name="materiaId" required>
          <option value="">Selecione…</option>
          ${opcoes}
        </select>
      </label>
      <div class="linha">
        <label>Data <input type="date" name="data" required value="${esc(a.data)}"></label>
        <label>Hora (opcional) <input type="time" name="hora" value="${esc(a.hora ?? '')}"></label>
      </div>
      <label>Descrição <textarea name="descricao" rows="4" maxlength="5000" placeholder="Detalhes, link da atividade, capítulos…">${esc(a.descricao ?? '')}</textarea></label>
      ${rodapeModal()}
    </form>`);
}

async function abrirDetalhe(id) {
  const a = await chamar('obterAtividade', id);
  const prazo = textoPrazo(a);
  const novoStatus = a.status === 'pendente' ? 'concluida' : 'pendente';
  abrirModal(`
    <div class="detalhe tipo-${a.tipo} ${a.status === 'concluida' ? 'concluida' : ''}">
      <div><span class="badge tipo-${a.tipo}">${TIPOS[a.tipo]}</span></div>
      <h2>${esc(a.titulo)}</h2>
      <p class="detalhe-materia">
        ${pontoFaculdade(a.faculdade_cor)}
        <span>${esc(a.faculdade_nome)} · Semestre ${a.semestre_numero} · <b>${esc(a.materia_nome)}</b>${a.materia_professor ? ` — Prof. ${esc(a.materia_professor)}` : ''}</span>
      </p>
      <p class="detalhe-data">📅 <span>${formatarDataLonga(a.data)}${a.hora ? ` às ${esc(a.hora)}` : ''}</span> · <span class="prazo ${prazo.classe}">${prazo.texto}</span></p>
      ${a.descricao ? `<div class="detalhe-descricao">${esc(a.descricao)}</div>` : ''}
      <div class="modal-acoes">
        <button class="btn btn-perigo" data-detalhe-excluir="${a.id}">Excluir</button>
        <span class="espaco"></span>
        <button class="btn" data-detalhe-editar="${a.id}">Editar</button>
        <button class="btn btn-primario" data-detalhe-status="${a.id}" data-novo-status="${novoStatus}">
          ${a.status === 'pendente' ? 'Marcar como concluída' : 'Reabrir'}
        </button>
      </div>
    </div>`);
}

function opcoesMateriasDaFaculdade(materias, faculdadeId, selecionada) {
  const lista = materias.filter((m) => m.faculdade_id === Number(faculdadeId));
  return `<option value="">Nenhuma (lembrete geral da faculdade)</option>${lista.map((m) => `
    <option value="${m.id}" ${m.id === Number(selecionada) ? 'selected' : ''}>Semestre ${m.semestre_numero} · ${esc(m.nome)}</option>`).join('')}`;
}

async function abrirFormularioLembrete({ data, lembrete } = {}) {
  const [faculdades, materias] = await Promise.all([chamar('listarFaculdades'), chamar('listarMateriasParaSelecao')]);
  if (!faculdades.length) {
    mostrarToast('Cadastre uma faculdade antes de criar lembretes.', 'aviso');
    location.hash = '#/faculdades';
    return;
  }
  const l = lembrete ?? { titulo: '', descricao: '', data: data ?? hojeISO(), faculdade_id: faculdades[0].id, materia_id: null };
  estado.materiasCache = materias;

  abrirModal(`
    <h2>${l.id ? 'Editar lembrete' : 'Novo lembrete'}</h2>
    <form data-form="lembrete" data-id="${l.id ?? ''}">
      <label>Título <input type="text" name="titulo" required maxlength="200" value="${esc(l.titulo)}" placeholder="Ex.: Início do período de exames"></label>
      <div class="linha">
        <label>Faculdade
          <select name="faculdadeId" required>
            ${faculdades.map((f) => `<option value="${f.id}" ${f.id === l.faculdade_id ? 'selected' : ''}>${esc(f.nome)}</option>`).join('')}
          </select>
        </label>
        <label>Data <input type="date" name="data" required value="${esc(l.data)}"></label>
      </div>
      <label>Matéria (opcional)
        <select name="materiaId">${opcoesMateriasDaFaculdade(materias, l.faculdade_id, l.materia_id)}</select>
      </label>
      <label>Descrição <textarea name="descricao" rows="3" maxlength="5000" placeholder="Ex.: conferir o site da faculdade, levar documento…">${esc(l.descricao ?? '')}</textarea></label>
      ${rodapeModal()}
    </form>`);
}

async function abrirDetalheLembrete(id) {
  const l = await chamar('obterLembrete', id);
  const prazo = textoPrazo(l);
  const novoStatus = l.status === 'pendente' ? 'concluida' : 'pendente';
  abrirModal(`
    <div class="detalhe tipo-lembrete ${l.status === 'concluida' ? 'concluida' : ''}">
      <div><span class="badge tipo-lembrete">Lembrete</span></div>
      <h2>${esc(l.titulo)}</h2>
      <p class="detalhe-materia">
        ${pontoFaculdade(l.faculdade_cor)}
        <span>${esc(l.faculdade_nome)}${l.materia_nome ? ` · <b>${esc(l.materia_nome)}</b>` : ' · lembrete geral'}</span>
      </p>
      <p class="detalhe-data">📅 <span>${formatarDataLonga(l.data)}</span> · <span class="prazo ${prazo.classe}">${prazo.texto}</span></p>
      ${l.descricao ? `<div class="detalhe-descricao">${esc(l.descricao)}</div>` : ''}
      <div class="modal-acoes">
        <button class="btn btn-perigo" data-lembrete-excluir="${l.id}">Excluir</button>
        <span class="espaco"></span>
        <button class="btn" data-lembrete-editar="${l.id}">Editar</button>
        <button class="btn btn-primario" data-lembrete-status="${l.id}" data-novo-status="${novoStatus}">
          ${l.status === 'pendente' ? 'Marcar como concluído' : 'Reabrir'}
        </button>
      </div>
    </div>`);
}

function abrirFormularioFaculdade(f) {
  abrirModal(`
    <h2>Editar faculdade</h2>
    <form data-form="faculdade" data-id="${f.id}">
      <label>Nome <input type="text" name="nome" required maxlength="80" value="${esc(f.nome)}"></label>
      <label>Cor <input type="color" name="cor" value="${esc(f.cor)}"></label>
      ${rodapeModal()}
    </form>`);
}

function abrirFormularioMateria(m) {
  abrirModal(`
    <h2>Editar matéria</h2>
    <form data-form="materia" data-id="${m.id}">
      <label>Nome <input type="text" name="nome" required maxlength="120" value="${esc(m.nome)}"></label>
      <label>Professor <input type="text" name="professor" maxlength="120" value="${esc(m.professor ?? '')}"></label>
      <label>Status <select name="status">${opcoesStatus(m.status)}</select></label>
      ${rodapeModal()}
    </form>`);
}

function abrirFormularioProjeto(p) {
  abrirModal(`
    <h2>Editar projeto</h2>
    <form data-form="projeto" data-id="${p.id}">
      <label>Nome <input type="text" name="nome" required maxlength="120" value="${esc(p.nome)}"></label>
      <div class="linha">
        <label>Cor <input type="color" name="cor" value="${esc(p.cor)}"></label>
        <label>Status <select name="status">${opcoesDe(STATUS_PROJETO, p.status)}</select></label>
      </div>
      ${rodapeModal()}
    </form>`);
}

function abrirFormularioRice(r) {
  abrirModal(`
    <h2>Editar RICE</h2>
    <form data-form="rice" data-id="${r.id}">
      <label>Nome <input type="text" name="nome" required maxlength="200" value="${esc(r.nome)}"></label>
      <label>Status <select name="status">${opcoesDe(STATUS_RICE, r.status)}</select></label>
      <label>Comentário <textarea name="comentario" rows="5" maxlength="5000" placeholder="Andamento, motivo do bloqueio, próximos passos…">${esc(r.comentario ?? '')}</textarea></label>
      ${rodapeModal()}
    </form>`);
}

async function abrirFormularioTarefaRice({ data, riceId, tarefa } = {}) {
  const rices = await chamar('listarRicesParaSelecao');
  if (!rices.length) {
    mostrarToast('Crie um projeto com pelo menos um RICE antes de adicionar tarefas.', 'aviso');
    fecharModal();
    location.hash = '#/projetos';
    return;
  }
  const t = tarefa ?? { titulo: '', descricao: '', data: data ?? hojeISO(), hora: '', rice_id: riceId ?? null };

  const grupos = new Map();
  for (const r of rices) {
    if (!grupos.has(r.projeto_nome)) grupos.set(r.projeto_nome, []);
    grupos.get(r.projeto_nome).push(r);
  }
  const opcoes = [...grupos.entries()].map(([projeto, lista]) => `
    <optgroup label="${esc(projeto)}">
      ${lista.map((r) => `<option value="${r.id}" ${r.id === Number(t.rice_id) ? 'selected' : ''}>${esc(r.nome)} (${STATUS_RICE[r.status]})</option>`).join('')}
    </optgroup>`).join('');

  abrirModal(`
    <h2>${t.id ? 'Editar tarefa do projeto' : 'Nova tarefa de projeto'}</h2>
    <form data-form="tarefa-rice" data-id="${t.id ?? ''}">
      <label>Título <input type="text" name="titulo" required maxlength="200" value="${esc(t.titulo)}" placeholder="Ex.: Validar layout com o cliente"></label>
      <label>RICE
        <select name="riceId" required>
          <option value="">Selecione…</option>
          ${opcoes}
        </select>
      </label>
      <div class="linha">
        <label>Data de entrega <input type="date" name="data" required value="${esc(t.data)}"></label>
        <label>Hora (opcional) <input type="time" name="hora" value="${esc(t.hora ?? '')}"></label>
      </div>
      <label>Descrição <textarea name="descricao" rows="4" maxlength="5000" placeholder="Detalhes, links, responsáveis…">${esc(t.descricao ?? '')}</textarea></label>
      ${rodapeModal()}
    </form>`);
}

async function abrirDetalheTarefaRice(id) {
  const t = await chamar('obterTarefaRice', id);
  const prazo = textoPrazo(t);
  const novoStatus = t.status === 'pendente' ? 'concluida' : 'pendente';
  abrirModal(`
    <div class="detalhe tipo-projeto ${t.status === 'concluida' ? 'concluida' : ''}">
      <div><span class="badge tipo-projeto">Projeto</span></div>
      <h2>${esc(t.titulo)}</h2>
      <p class="detalhe-materia">
        ${pontoFaculdade(t.projeto_cor)}
        <span>${esc(t.projeto_nome)} · RICE <b>${esc(t.rice_nome)}</b> (${STATUS_RICE[t.rice_status]})</span>
      </p>
      <p class="detalhe-data">📅 <span>${formatarDataLonga(t.data)}${t.hora ? ` às ${esc(t.hora)}` : ''}</span> · <span class="prazo ${prazo.classe}">${prazo.texto}</span></p>
      ${t.descricao ? `<div class="detalhe-descricao">${esc(t.descricao)}</div>` : ''}
      <div class="modal-acoes">
        <button class="btn btn-perigo" data-tarefa-rice-excluir="${t.id}">Excluir</button>
        <span class="espaco"></span>
        <button class="btn" data-tarefa-rice-editar="${t.id}">Editar</button>
        <button class="btn btn-primario" data-tarefa-rice-status="${t.id}" data-novo-status="${novoStatus}">
          ${t.status === 'pendente' ? 'Marcar como concluída' : 'Reabrir'}
        </button>
      </div>
    </div>`);
}

async function excluirTarefaRice(id) {
  if (!confirm('Excluir esta tarefa do projeto?')) return false;
  await chamar('excluirTarefaRice', id);
  mostrarToast('Tarefa excluída.', 'ok');
  return true;
}

function abrirFormularioAgente(agente) {
  const a = agente ?? { tema: '', descricao: '', modelo: 'opus' };
  abrirModal(`
    <h2>${a.id ? 'Editar contexto do chat' : 'Novo chat com o Claude'}</h2>
    <form data-form="agente" data-id="${a.id ?? ''}">
      <label>Tema <input type="text" name="tema" required maxlength="120" value="${esc(a.tema)}" placeholder="Ex.: Cálculo II — Univesp"></label>
      <label>Descrição / contexto do agente
        <textarea name="descricao" rows="8" required maxlength="20000" placeholder="Explique no que esse agente deve ser especialista: conteúdo da matéria, ementa, bibliografia, estilo de resposta que você prefere, linguagens/ferramentas usadas, o que evitar…">${esc(a.descricao)}</textarea>
      </label>
      <label>Modelo
        <select name="modelo">
          ${Object.entries(MODELOS).map(([v, m]) => `<option value="${v}" ${v === a.modelo ? 'selected' : ''}>${m.rotulo} — ${m.descricao}</option>`).join('')}
        </select>
      </label>
      ${a.id ? '<p style="margin:0;font-size:12.5px;color:var(--texto-3)">Ao salvar, a próxima mensagem abre uma sessão nova no Claude Code com o contexto atualizado; o histórico salvo aqui é reenviado como referência.</p>' : ''}
      ${rodapeModal(a.id ? 'Salvar' : 'Criar chat')}
    </form>`);
}

// ---------- Eventos: área principal ----------

conteudo.addEventListener('click', async (e) => {
  const alvo = e.target;
  if (alvo.closest('a[href^="#"]')) return;

  const chipRice = alvo.closest('[data-tarefa-rice]');
  if (chipRice && !alvo.closest('.check')) return abrirDetalheTarefaRice(Number(chipRice.dataset.tarefaRice));

  const chip = alvo.closest('[data-atividade]');
  if (chip && !alvo.closest('.check')) return abrirDetalhe(Number(chip.dataset.atividade));

  const chipLemb = alvo.closest('[data-lembrete]');
  if (chipLemb && !alvo.closest('.check')) return abrirDetalheLembrete(Number(chipLemb.dataset.lembrete));

  const nova = alvo.closest('[data-nova]');
  if (nova) return abrirFormularioAtividade({ data: nova.dataset.nova });
  const novoLembrete = alvo.closest('[data-novo-lembrete]');
  if (novoLembrete) return abrirFormularioLembrete({ data: novoLembrete.dataset.novoLembrete });

  const filtro = alvo.closest('[data-filtro]');
  if (filtro) {
    const id = Number(filtro.dataset.filtro);
    if (estado.faculdadesOcultas.has(id)) estado.faculdadesOcultas.delete(id);
    else estado.faculdadesOcultas.add(id);
    return renderCalendario();
  }
  const filtroProjeto = alvo.closest('[data-filtro-projeto]');
  if (filtroProjeto) {
    const id = Number(filtroProjeto.dataset.filtroProjeto);
    if (estado.projetosOcultos.has(id)) estado.projetosOcultos.delete(id);
    else estado.projetosOcultos.add(id);
    return renderCalendario();
  }

  const acao = alvo.closest('[data-acao]')?.dataset.acao;
  if (acao === 'mes-anterior' || acao === 'mes-seguinte') {
    const d = new Date(estado.ano, estado.mes + (acao === 'mes-anterior' ? -1 : 1), 1);
    estado.ano = d.getFullYear();
    estado.mes = d.getMonth();
    return renderCalendario();
  }
  if (acao === 'hoje') {
    estado.ano = agora.getFullYear();
    estado.mes = agora.getMonth();
    return renderCalendario();
  }
  if (acao === 'alternar-concluidas') {
    estado.mostrarConcluidas = !estado.mostrarConcluidas;
    return renderProximas();
  }
  if (acao === 'abrir-pasta-banco') return window.api.abrirPastaBanco();
  if (acao === 'novo-chat') return abrirFormularioAgente();
  if (acao === 'guia-chat') return abrirGuiaChat();

  if (alvo.closest('[data-anexar]')) return document.getElementById('chat-arquivo')?.click();
  const removerImagem = alvo.closest('[data-remover-imagem]');
  if (removerImagem) {
    const [removida] = estado.chatImagens.splice(Number(removerImagem.dataset.removerImagem), 1);
    if (removida) URL.revokeObjectURL(removida.url);
    return desenharPrevias();
  }
  const ampliar = alvo.closest('[data-ampliar]');
  if (ampliar) return abrirModal(`<img class="imagem-ampliada" src="${esc(ampliar.getAttribute('src'))}" alt="Imagem anexada"><div class="modal-acoes"><span class="espaco"></span><button type="button" class="btn" data-fechar>Fechar</button></div>`);

  const abrirChat = alvo.closest('[data-abrir-chat]');
  if (abrirChat) { location.hash = `#/chats/${abrirChat.dataset.abrirChat}`; return; }

  const editarAgente = alvo.closest('[data-editar-agente]');
  if (editarAgente) return abrirFormularioAgente(await chamar('obterAgente', Number(editarAgente.dataset.editarAgente)));
  const limparChat = alvo.closest('[data-limpar-chat]');
  if (limparChat) {
    if (!confirm('Apagar todas as mensagens desta conversa? O contexto do agente é mantido.')) return;
    await chamar('limparMensagens', Number(limparChat.dataset.limparChat));
    return renderizar();
  }
  const excluirAgente = alvo.closest('[data-excluir-agente]');
  if (excluirAgente) {
    if (!confirm('Excluir este chat e todo o histórico?')) return;
    await chamar('excluirAgente', Number(excluirAgente.dataset.excluirAgente));
    mostrarToast('Chat excluído.', 'ok');
    location.hash = '#/chats';
    return;
  }

  const dia = alvo.closest('[data-dia]');
  if (dia) return abrirEscolhaDia(dia.dataset.dia);

  const editarFaculdade = alvo.closest('[data-editar-faculdade]');
  if (editarFaculdade) {
    const faculdades = await chamar('listarFaculdades');
    const f = faculdades.find((x) => x.id === Number(editarFaculdade.dataset.editarFaculdade));
    return f && abrirFormularioFaculdade(f);
  }
  const excluirFaculdade = alvo.closest('[data-excluir-faculdade]');
  if (excluirFaculdade) {
    if (!confirm('Excluir esta faculdade? Todos os semestres, matérias, atividades e lembretes dela serão apagados.')) return;
    await chamar('excluirFaculdade', Number(excluirFaculdade.dataset.excluirFaculdade));
    mostrarToast('Faculdade excluída.', 'ok');
    return renderFaculdades();
  }

  const novoSemestre = alvo.closest('[data-novo-semestre]');
  if (novoSemestre) {
    await chamar('criarSemestre', { faculdadeId: Number(novoSemestre.dataset.novoSemestre) });
    return renderFaculdades();
  }
  const excluirSemestre = alvo.closest('[data-excluir-semestre]');
  if (excluirSemestre) {
    if (!confirm('Excluir este semestre? As matérias e atividades dele serão apagadas.')) return;
    await chamar('excluirSemestre', Number(excluirSemestre.dataset.excluirSemestre));
    mostrarToast('Semestre excluído.', 'ok');
    return renderFaculdades();
  }

  const editarMateria = alvo.closest('[data-editar-materia]');
  if (editarMateria) {
    const materias = await chamar('listarMateriasParaSelecao');
    const m = materias.find((x) => x.id === Number(editarMateria.dataset.editarMateria));
    return m && abrirFormularioMateria(m);
  }
  const excluirMateria = alvo.closest('[data-excluir-materia]');
  if (excluirMateria) {
    if (!confirm('Excluir esta matéria? As atividades dela serão apagadas.')) return;
    await chamar('excluirMateria', Number(excluirMateria.dataset.excluirMateria));
    mostrarToast('Matéria excluída.', 'ok');
    return renderFaculdades();
  }

  const editarProjeto = alvo.closest('[data-editar-projeto]');
  if (editarProjeto) return abrirFormularioProjeto(await chamar('obterProjeto', Number(editarProjeto.dataset.editarProjeto)));
  const excluirProjeto = alvo.closest('[data-excluir-projeto]');
  if (excluirProjeto) {
    if (!confirm('Excluir este projeto? Todos os RICEs e tarefas dele serão apagados.')) return;
    await chamar('excluirProjeto', Number(excluirProjeto.dataset.excluirProjeto));
    mostrarToast('Projeto excluído.', 'ok');
    return renderProjetos();
  }
  const editarRice = alvo.closest('[data-editar-rice]');
  if (editarRice) return abrirFormularioRice(await chamar('obterRice', Number(editarRice.dataset.editarRice)));
  const excluirRice = alvo.closest('[data-excluir-rice]');
  if (excluirRice) {
    if (!confirm('Excluir este RICE? As tarefas dele serão apagadas.')) return;
    await chamar('excluirRice', Number(excluirRice.dataset.excluirRice));
    mostrarToast('RICE excluído.', 'ok');
    return renderProjetos();
  }
  const editarTarefaRice = alvo.closest('[data-editar-tarefa-rice]');
  if (editarTarefaRice) return abrirFormularioTarefaRice({ tarefa: await chamar('obterTarefaRice', Number(editarTarefaRice.dataset.editarTarefaRice)) });
  const excluirTarefa = alvo.closest('[data-excluir-tarefa-rice]');
  if (excluirTarefa) {
    if (await excluirTarefaRice(Number(excluirTarefa.dataset.excluirTarefaRice))) return renderProjetos();
  }
});

conteudo.addEventListener('change', async (e) => {
  const alvo = e.target;
  if (alvo.dataset.concluir) {
    await chamar('definirStatusAtividade', { id: Number(alvo.dataset.concluir), status: alvo.checked ? 'concluida' : 'pendente' });
    return renderProximas();
  }
  if (alvo.dataset.concluirLembrete) {
    await chamar('definirStatusLembrete', { id: Number(alvo.dataset.concluirLembrete), status: alvo.checked ? 'concluida' : 'pendente' });
    return renderProximas();
  }
  if (alvo.dataset.statusSemestre) {
    await chamar('definirStatusSemestre', { id: Number(alvo.dataset.statusSemestre), status: alvo.value });
    return renderFaculdades();
  }
  if (alvo.dataset.statusMateria) {
    await chamar('definirStatusMateria', { id: Number(alvo.dataset.statusMateria), status: alvo.value });
    return renderFaculdades();
  }
  if (alvo.dataset.concluirTarefaRice) {
    await chamar('definirStatusTarefaRice', { id: Number(alvo.dataset.concluirTarefaRice), status: alvo.checked ? 'concluida' : 'pendente' });
    return renderizar();
  }
  if (alvo.dataset.statusProjeto) {
    await chamar('definirStatusProjeto', { id: Number(alvo.dataset.statusProjeto), status: alvo.value });
    return renderProjetos();
  }
  if (alvo.dataset.statusRice) {
    await chamar('definirStatusRice', { id: Number(alvo.dataset.statusRice), status: alvo.value });
    return renderProjetos();
  }
});

conteudo.addEventListener('submit', async (e) => {
  const form = e.target;
  if (!form.dataset.form) return;
  e.preventDefault();
  const dados = Object.fromEntries(new FormData(form));

  if (form.dataset.form === 'nova-materia') {
    await chamar('criarMateria', { semestreId: Number(form.dataset.semestreId), ...dados });
    estado.semestresAbertos.set(Number(form.dataset.semestreId), true);
    mostrarToast('Matéria adicionada.', 'ok');
    return renderFaculdades();
  }
  if (form.dataset.form === 'nova-faculdade') {
    await chamar('criarFaculdade', dados);
    mostrarToast('Faculdade adicionada.', 'ok');
    return renderFaculdades();
  }
  if (form.dataset.form === 'chat') return enviarMensagemChat(form);
  if (form.dataset.form === 'novo-projeto') {
    await chamar('criarProjeto', dados);
    mostrarToast('Projeto adicionado.', 'ok');
    return renderProjetos();
  }
  if (form.dataset.form === 'novo-rice') {
    const novoId = await chamar('criarRice', { projetoId: Number(form.dataset.projetoId), ...dados });
    estado.ricesAbertos.set(novoId, true);
    mostrarToast('RICE adicionado.', 'ok');
    return renderProjetos();
  }
  if (form.dataset.form === 'nova-tarefa-rice') {
    await chamar('criarTarefaRice', { riceId: Number(form.dataset.riceId), ...dados });
    estado.ricesAbertos.set(Number(form.dataset.riceId), true);
    mostrarToast('Tarefa adicionada ao calendário.', 'ok');
    return renderProjetos();
  }
});

conteudo.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && e.target.matches('.chat-envio textarea')) {
    e.preventDefault();
    e.target.form.requestSubmit();
  }
});

conteudo.addEventListener('change', (e) => {
  if (e.target.id === 'chat-arquivo') {
    adicionarImagensChat([...e.target.files]);
    e.target.value = '';
  }
});

conteudo.addEventListener('paste', (e) => {
  if (!e.target.matches('.chat-envio textarea')) return;
  const arquivos = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
  if (!arquivos.length) return;
  e.preventDefault();
  adicionarImagensChat(arquivos);
});

conteudo.addEventListener('dragover', (e) => {
  const form = e.target.closest?.('.chat');
  if (!form || !e.dataTransfer?.types.includes('Files')) return;
  e.preventDefault();
  document.querySelector('.chat-envio')?.classList.add('arrastando');
});

conteudo.addEventListener('dragleave', (e) => {
  if (!e.relatedTarget || !e.target.closest?.('.chat')?.contains(e.relatedTarget)) {
    document.querySelector('.chat-envio')?.classList.remove('arrastando');
  }
});

conteudo.addEventListener('drop', (e) => {
  if (!e.target.closest?.('.chat')) return;
  e.preventDefault();
  document.querySelector('.chat-envio')?.classList.remove('arrastando');
  adicionarImagensChat([...(e.dataTransfer?.files ?? [])]);
});

conteudo.addEventListener('input', (e) => {
  if (e.target.matches('.chat-envio textarea')) {
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
  }
});

conteudo.addEventListener('toggle', (e) => {
  const det = e.target.closest?.('[data-semestre]');
  if (det) estado.semestresAbertos.set(Number(det.dataset.semestre), det.open);
  const rice = e.target.closest?.('[data-rice]');
  if (rice) estado.ricesAbertos.set(Number(rice.dataset.rice), rice.open);
}, true);

// ---------- Eventos: modal ----------

modal.addEventListener('click', (e) => {
  if (e.target === modal) fecharModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modal.classList.contains('oculto')) fecharModal();
});

modalCaixa.addEventListener('change', (e) => {
  if (e.target.name === 'faculdadeId' && e.target.form?.dataset.form === 'lembrete') {
    e.target.form.elements.materiaId.innerHTML = opcoesMateriasDaFaculdade(estado.materiasCache ?? [], e.target.value, null);
  }
});

modalCaixa.addEventListener('click', async (e) => {
  const alvo = e.target;
  if (alvo.closest('[data-fechar]')) return fecharModal();

  const escolha = alvo.closest('[data-escolha]');
  if (escolha) {
    const { data } = escolha.dataset;
    if (escolha.dataset.escolha === 'lembrete') return abrirFormularioLembrete({ data });
    if (escolha.dataset.escolha === 'tarefa-rice') return abrirFormularioTarefaRice({ data });
    return abrirFormularioAtividade({ data });
  }

  const editarTarefaRice = alvo.closest('[data-tarefa-rice-editar]');
  if (editarTarefaRice) return abrirFormularioTarefaRice({ tarefa: await chamar('obterTarefaRice', Number(editarTarefaRice.dataset.tarefaRiceEditar)) });
  const excluirTarefa = alvo.closest('[data-tarefa-rice-excluir]');
  if (excluirTarefa) {
    if (!await excluirTarefaRice(Number(excluirTarefa.dataset.tarefaRiceExcluir))) return;
    fecharModal();
    return renderizar();
  }
  const statusTarefaRice = alvo.closest('[data-tarefa-rice-status]');
  if (statusTarefaRice) {
    await chamar('definirStatusTarefaRice', { id: Number(statusTarefaRice.dataset.tarefaRiceStatus), status: statusTarefaRice.dataset.novoStatus });
    fecharModal();
    return renderizar();
  }

  const editar = alvo.closest('[data-detalhe-editar]');
  if (editar) return abrirFormularioAtividade({ atividade: await chamar('obterAtividade', Number(editar.dataset.detalheEditar)) });
  const excluir = alvo.closest('[data-detalhe-excluir]');
  if (excluir) {
    if (!confirm('Excluir esta atividade?')) return;
    await chamar('excluirAtividade', Number(excluir.dataset.detalheExcluir));
    fecharModal();
    mostrarToast('Atividade excluída.', 'ok');
    return renderizar();
  }
  const status = alvo.closest('[data-detalhe-status]');
  if (status) {
    await chamar('definirStatusAtividade', { id: Number(status.dataset.detalheStatus), status: status.dataset.novoStatus });
    fecharModal();
    return renderizar();
  }

  const editarLemb = alvo.closest('[data-lembrete-editar]');
  if (editarLemb) return abrirFormularioLembrete({ lembrete: await chamar('obterLembrete', Number(editarLemb.dataset.lembreteEditar)) });
  const excluirLemb = alvo.closest('[data-lembrete-excluir]');
  if (excluirLemb) {
    if (!confirm('Excluir este lembrete?')) return;
    await chamar('excluirLembrete', Number(excluirLemb.dataset.lembreteExcluir));
    fecharModal();
    mostrarToast('Lembrete excluído.', 'ok');
    return renderizar();
  }
  const statusLemb = alvo.closest('[data-lembrete-status]');
  if (statusLemb) {
    await chamar('definirStatusLembrete', { id: Number(statusLemb.dataset.lembreteStatus), status: statusLemb.dataset.novoStatus });
    fecharModal();
    return renderizar();
  }
});

modalCaixa.addEventListener('submit', async (e) => {
  const form = e.target;
  e.preventDefault();
  const dados = Object.fromEntries(new FormData(form));
  const id = form.dataset.id ? Number(form.dataset.id) : null;

  switch (form.dataset.form) {
    case 'atividade': {
      await chamar(id ? 'atualizarAtividade' : 'criarAtividade', { id, ...dados });
      const data = dataDeISO(dados.data);
      estado.ano = data.getFullYear();
      estado.mes = data.getMonth();
      mostrarToast('Atividade salva.', 'ok');
      break;
    }
    case 'lembrete': {
      await chamar(id ? 'atualizarLembrete' : 'criarLembrete', { id, ...dados });
      const data = dataDeISO(dados.data);
      estado.ano = data.getFullYear();
      estado.mes = data.getMonth();
      mostrarToast('Lembrete salvo.', 'ok');
      break;
    }
    case 'faculdade':
      await chamar('atualizarFaculdade', { id, ...dados });
      break;
    case 'projeto':
      await chamar('atualizarProjeto', { id, ...dados });
      break;
    case 'rice':
      await chamar('atualizarRice', { id, ...dados });
      break;
    case 'tarefa-rice': {
      await chamar(id ? 'atualizarTarefaRice' : 'criarTarefaRice', { id, ...dados });
      const data = dataDeISO(dados.data);
      estado.ano = data.getFullYear();
      estado.mes = data.getMonth();
      mostrarToast('Tarefa salva.', 'ok');
      break;
    }
    case 'materia':
      await chamar('atualizarMateria', { id, ...dados });
      break;
    case 'agente': {
      if (id) {
        await chamar('atualizarAgente', { id, ...dados });
        mostrarToast('Contexto atualizado.', 'ok');
      } else {
        const novoId = await chamar('criarAgente', dados);
        fecharModal();
        location.hash = `#/chats/${novoId}`;
        return;
      }
      break;
    }
  }
  fecharModal();
  renderizar();
});

// ---------- Inicialização ----------

document.getElementById('btn-nova-atividade').addEventListener('click', () => abrirFormularioAtividade());
document.getElementById('btn-novo-lembrete').addEventListener('click', () => abrirFormularioLembrete());
document.querySelector('.tema-seletor').addEventListener('click', (e) => {
  const botao = e.target.closest('[data-tema]');
  if (botao) aplicarTema(botao.dataset.tema);
});
aplicarTema(localStorage.getItem('tema') ?? 'system');
window.addEventListener('hashchange', renderizar);
renderizar();
