/* Problemas Sistêmicos — andamento dos chamados em tempo real
   Fonte: sistemas.txt (TXT do SQL Developer, separado por tabulação, cabeçalho na 1ª linha).
   O app confere o arquivo a cada minuto e registra toda mudança de status por ID. */
'use strict';

const VERSION = '1.24.1';
const POLL_MS = 60 * 1000;           // conferência do arquivo
const TICK_MS = 5 * 1000;            // relógio dos tempos em andamento
const RECENT_MS = 60 * 60 * 1000;    // selo NOVO / MUDOU vale por 1 hora
const LOG_MAX = 300;                 // mudanças guardadas no aparelho
// histórico: ao entrar mostra o mês atual e o anterior; depois, um mês por vez ("Mostrar mês de Agosto")
const MESES_LONGO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const REQUIRED = ['ID', 'SISTEMA', 'STATUS', 'DATA_INICIO'];
const KNOWN = ['ID', 'SISTEMA', 'CHAMADO', 'STATUS', 'CRITICIDADE', 'EVOLUCAO', 'SEGMENTO', 'IMPACTO_OPERACIONAL',
  'DATA_INICIO', 'DATA_FIM', 'TIPO_FALHA', 'GRUPOS_RESPONSAVEIS', 'GRUPOS_IMPACTADOS', 'AREA_ACIONADA',
  'ALERTA_ENVIADO', 'DATA_ATUALIZACAO', 'DADO_ATUALIZADO', 'TEMPO_DECORRIDO'];
// campos acompanhados: mudança em qualquer um entra em "Últimas mudanças"
const TRACK = [['STATUS', 'Status'], ['EVOLUCAO', 'Evolução'], ['DATA_FIM', 'Fim'], ['CRITICIDADE', 'Criticidade'], ['TIPO_FALHA', 'Tipo de falha']];

// colunas que continuam sendo lidas (mudanças, conferência), mas não aparecem nos cards nem no detalhe
const OCULTAS = ['FLAG', 'TEMPO_DECORRIDO', 'DADO_ATUALIZADO', 'DATA_ATUALIZACAO'];

const K = { data: 'ps.data', snap: 'ps.snap', log: 'ps.log', bell: 'ps.bell', pins: 'ps.pins' };

/* ---------- armazenamento no aparelho ---------- */
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
}

/* ---------- utilidades ---------- */
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// datas do Oracle: "20/10/26 08:22:00,000000000" (também aceita 20/10/2026 08:22 e 2026-10-20 08:22:00)
// devolve Date, null (vazio) ou undefined (inválida)
function parseDate(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return null;
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  let y, mo, d, h = 0, mi = 0, se = 0;
  if (m) { d = +m[1]; mo = +m[2]; y = +m[3]; if (y < 100) y += 2000; h = +(m[4] || 0); mi = +(m[5] || 0); se = +(m[6] || 0); }
  else {
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return undefined;
    y = +m[1]; mo = +m[2]; d = +m[3]; h = +(m[4] || 0); mi = +(m[5] || 0); se = +(m[6] || 0);
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 59) return undefined;
  const dt = new Date(y, mo - 1, d, h, mi, se);
  if (dt.getMonth() !== mo - 1 || dt.getDate() !== d) return undefined;
  return dt;
}
const fHM = d => d ? pad(d.getHours()) + ':' + pad(d.getMinutes()) : '–';
const fDM = d => d ? pad(d.getDate()) + '/' + pad(d.getMonth() + 1) : '–';
const fFull = d => d ? fDM(d) + '/' + String(d.getFullYear()).slice(2) + ' ' + fHM(d) : '–';
const dayKey = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const sameDay = (a, b) => a && b && dayKey(a) === dayKey(b);
function fDur(ms) {
  if (!(ms >= 0)) return '–';
  const t = Math.floor(ms / 60000);
  if (t < 1) return '<1 min';
  if (t < 60) return t + ' min';
  if (t < 1440) { const h = Math.floor(t / 60), m = t % 60; return h + 'h' + (m ? ' ' + pad(m) + 'min' : ''); }
  const d = Math.floor(t / 1440), h = Math.floor((t % 1440) / 60);
  return d + 'd' + (h ? ' ' + h + 'h' : '');
}
function fAgo(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 10) return 'agora';
  if (s < 60) return 'há ' + s + ' s';
  const m = Math.floor(s / 60);
  if (m < 60) return 'há ' + m + ' min';
  return 'há ' + fDur(ms);
}
function dayLabel(d, now) {
  const y = new Date(now); y.setDate(y.getDate() - 1);
  const base = DIAS[d.getDay()] + ', ' + d.getDate() + ' ' + MESES[d.getMonth()];
  if (sameDay(d, now)) return 'Hoje · ' + base;
  if (sameDay(d, y)) return 'Ontem · ' + base;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/* ---------- regras do chamado ---------- */
const up = s => String(s || '').trim().toUpperCase();
function isOpen(r) {
  const s = up(r.STATUS);
  if (s === 'INDEVIDO' || s === 'FECHADO') return false;
  if (s === 'ABERTO') return true;
  return !r._fim;   // status desconhecido: aberto enquanto não tiver fim
}
const isInd = r => up(r.STATUS) === 'INDEVIDO';
function tipo(r) {
  const t = up(r.TIPO_FALHA);
  if (t.includes('TOTAL')) return { k: 'total', c: 'var(--fTotal)', n: 'Indisp. total', longo: 'Indisponibilidade total' };
  if (t.includes('PARCIAL')) return { k: 'parcial', c: 'var(--fParcial)', n: 'Indisp. parcial', longo: 'Indisponibilidade parcial' };
  if (t.includes('INTERMIT')) return { k: 'interm', c: 'var(--fInterm)', n: 'Intermitência', longo: 'Intermitência' };
  if (t.includes('LENTID')) return { k: 'lent', c: 'var(--fLent)', n: 'Lentidão', longo: 'Lentidão' };
  const n = r.TIPO_FALHA ? cap(r.TIPO_FALHA) : 'Sem tipo';
  return { k: 'outro', c: 'var(--fOutro)', n, longo: n };
}
function cap(s) { s = String(s || '').toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); }
function critClass(c) {
  const n = parseInt(String(c || '').replace(/\D/g, ''), 10);
  if (n <= 1) return 'alta';
  if (n === 2) return 'media';
  return '';
}
const critRank = c => { const n = parseInt(String(c || '').replace(/\D/g, ''), 10); return isNaN(n) ? 9 : n; };
// aberto = falha (vermelho); fechado e indevido = neutro; outros status = em atenção
function stClass(s) { s = up(s); return s === 'ABERTO' ? 'a' : s === 'FECHADO' || s === 'INDEVIDO' || !s ? '' : 'e'; }
const statusTag = s => `<span class="st ${stClass(s)}">${esc(s || '—')}</span>`;

/* ---------- leitura do arquivo ---------- */
function parseTxt(text) {
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) return { ok: false, err: 'arquivo vazio ou só com o cabeçalho' };
  const cols = lines[0].split('\t').map(c => c.trim().toUpperCase());
  const miss = REQUIRED.filter(c => !cols.includes(c));
  if (miss.length) return { ok: false, err: 'faltam as colunas ' + miss.join(', ') + ' (o arquivo precisa ser separado por tabulação)' };
  const warns = [];
  const byId = new Map();
  for (let i = 1; i < lines.length; i++) {
    const v = lines[i].split('\t');
    const r = {};
    cols.forEach((c, j) => { r[c] = (v[j] == null ? '' : v[j]).trim(); });
    const ln = i + 1;
    if (!r.ID) { warns.push(`Linha ${ln}: sem ID, ignorada`); continue; }
    r._ini = parseDate(r.DATA_INICIO);
    if (!r._ini) { warns.push(`Linha ${ln} (ID ${r.ID}): DATA_INICIO inválida ("${r.DATA_INICIO}"), ignorada`); continue; }
    r._fim = parseDate(r.DATA_FIM);
    if (r._fim === undefined) { warns.push(`Linha ${ln} (ID ${r.ID}): DATA_FIM inválida ("${r.DATA_FIM}"), tratada como sem fim`); r._fim = null; }
    if (r._fim && r._fim < r._ini) { warns.push(`ID ${r.ID}: DATA_FIM antes do início, tratada como sem fim`); r._fim = null; }
    r._upd = parseDate(r.DATA_ATUALIZACAO) || null;
    const prev = byId.get(r.ID);
    if (prev) {
      warns.push(`ID ${r.ID} repetido no arquivo: ficou a linha com a atualização mais recente`);
      if ((r._upd || 0) < (prev._upd || 0)) continue;
    }
    byId.set(r.ID, r);
  }
  const rows = [...byId.values()];
  if (!rows.length) return { ok: false, err: 'nenhuma linha válida' };
  return { ok: true, rows, cols, warns };
}

/* ---------- comparação por ID ---------- */
function snapOf(rows) {
  const s = {};
  rows.forEach(r => { s[r.ID] = { STATUS: r.STATUS, EVOLUCAO: r.EVOLUCAO || '', DATA_FIM: r.DATA_FIM || '', CRITICIDADE: r.CRITICIDADE || '', TIPO_FALHA: r.TIPO_FALHA || '', U: r.DATA_ATUALIZACAO || '', SIS: r.SISTEMA, INC: r.CHAMADO || '' }; });
  return s;
}
function diff(prev, rows, at) {
  const out = [];
  if (!prev || !Object.keys(prev).length) return out;
  const seen = new Set();
  for (const r of rows) {
    seen.add(r.ID);
    const p = prev[r.ID];
    const base = { at, id: r.ID, sis: r.SISTEMA, inc: r.CHAMADO || '' };
    if (!p) { out.push({ ...base, kind: 'novo', st: r.STATUS, evo: r.EVOLUCAO || '' }); continue; }
    const ch = [];
    for (const [f, label] of TRACK) {
      const a = p[f] || '', b = r[f] || '';
      if (a !== b) ch.push({ f, label, de: a, para: b });
    }
    if (ch.length) out.push({ ...base, kind: 'muda', ch });
    else if ((p.U || '') !== (r.DATA_ATUALIZACAO || '')) out.push({ ...base, kind: 'dados' });
  }
  const gone = Object.keys(prev).filter(id => !seen.has(id));
  if (gone.length > 3) out.push({ at, kind: 'saiu-varios', n: gone.length, ids: gone.slice(0, 50) });
  else gone.forEach(id => out.push({ at, id, sis: prev[id].SIS, inc: prev[id].INC, kind: 'saiu' }));
  return out;
}

/* ---------- busca do arquivo ---------- */
// No GitHub Pages, lê direto do repositório pela API (sem o cache de ~10 min do Pages).
// A conferência usa ETag: quando nada mudou, a resposta é 304 e não gasta a cota da API.
function ghRepo() {
  const h = location.hostname;
  if (!/\.github\.io$/i.test(h)) return null;
  if (new URLSearchParams(location.search).get('fonte') === 'arquivo') return null;
  const owner = h.split('.')[0];
  const first = location.pathname.split('/').filter(Boolean)[0];
  const repo = first && !/\.html?$/i.test(first) ? first : owner + '.github.io';
  return { owner, repo };
}
async function fetchApi(gh, arquivo, etag) {
  const url = `https://api.github.com/repos/${gh.owner}/${gh.repo}/contents/${arquivo}`;
  const headers = { Accept: 'application/vnd.github.raw' };
  if (etag) headers['If-None-Match'] = etag;
  const res = await fetch(url, { headers, cache: 'no-store' });
  if (res.status === 304) return { same: true, source: 'api' };
  if (res.status === 404) return { ausente: true, source: 'api' };   // arquivo não existe no repositório
  if (!res.ok) {
    const reset = +res.headers.get('X-RateLimit-Reset');
    const e = new Error('API ' + res.status);
    e.retryAt = reset ? reset * 1000 : Date.now() + 10 * 60 * 1000;
    throw e;
  }
  return { text: await res.text(), etag: res.headers.get('ETag') || '', source: 'api' };
}
async function fetchFile(arquivo) {
  const res = await fetch(arquivo + '?t=' + Date.now(), { cache: 'no-store' });
  if (res.status === 404) return { ausente: true, source: 'arquivo' };
  if (!res.ok) throw new Error('arquivo ' + res.status);
  return { text: await res.text(), source: 'arquivo' };
}
async function getText(arquivo, etag) {
  const gh = ghRepo();
  if (gh && Date.now() >= S.apiPauseUntil) {
    try { return await fetchApi(gh, arquivo, etag); }
    catch (e) { S.apiPauseUntil = e.retryAt || Date.now() + 10 * 60 * 1000; }
  }
  return fetchFile(arquivo);
}
// notificações: arquivo opcional; qualquer falha aqui não atrapalha os chamados
async function pollNotif() {
  if (!window.PSNotif) return;
  try {
    const r = await getText('notificacao.txt', PSNotif.etag());
    if (r.same) return;
    PSNotif.aplicar(r.ausente ? null : r.text, { etag: r.etag });
  } catch (e) { /* sem conexão: fica a última cópia guardada */ }
  renderBanners();
}

/* ---------- estado ---------- */
const S = {
  rows: [], cols: [], warns: [],
  text: '', etag: '', source: '', loadedAt: 0, checkedAt: 0,
  net: 'init',            // ok | off | init
  fileErr: '',            // erro do último arquivo recebido (mantém o anterior)
  saveErr: false,         // falha ao guardar no aparelho
  goneWarn: 0,
  log: load(K.log, []),
  snap: load(K.snap, null),
  apiPauseUntil: 0,
  busy: false,
  filter: 'todos', q: '', fSis: '', histCorte: null, feedAll: false,
  tab: 'oc', sheet: null,       // sheet: {mode:'det'|'list', id, list:{titulo, sub, ids, onClose}}
};
if (!Array.isArray(S.log)) S.log = [];
S.pins = load(K.pins, []); if (!Array.isArray(S.pins)) S.pins = [];   // cards fixados: o mais recente primeiro

function applyText(text, meta, fromStore) {
  const p = parseTxt(text);
  if (!p.ok) return p;
  S.rows = p.rows; S.cols = p.cols; S.warns = p.warns; S.text = text;
  if (meta) { S.etag = meta.etag || S.etag; S.source = meta.source || S.source; S.loadedAt = meta.loadedAt || S.loadedAt; }
  if (!fromStore) {
    const at = new Date().toISOString();
    const changes = diff(S.snap, p.rows, at);
    const many = changes.find(c => c.kind === 'saiu-varios');
    S.goneWarn = many ? many.n : 0;
    if (changes.length) { S.log = changes.concat(S.log).slice(0, LOG_MAX); announce(changes); }
    S.snap = snapOf(p.rows);
    const ok1 = save(K.data, { text, etag: S.etag, source: S.source, loadedAt: S.loadedAt });
    const ok2 = save(K.snap, S.snap);
    const ok3 = save(K.log, S.log);
    S.saveErr = !(ok1 && ok2 && ok3);
  } else if (!S.snap) {
    S.snap = snapOf(p.rows);
    S.saveErr = !save(K.snap, S.snap);
  }
  return p;
}

async function poll(manual) {
  if (S.busy) return;
  S.busy = true;
  $('btRefresh').classList.add('spin');
  try {
    const r = await getText('sistemas.txt', S.etag);
    if (r.ausente) throw new Error('sistemas.txt não encontrado');
    S.net = 'ok';
    S.checkedAt = Date.now();
    if (r.same || r.text === S.text) {
      if (r.etag) S.etag = r.etag;
      if (manual) toast('Nenhuma mudança desde a última conferência.');
    } else {
      const p = applyText(r.text, { etag: r.etag, source: r.source, loadedAt: Date.now() }, false);
      if (!p.ok) {
        S.fileErr = p.err;
        if (r.etag) S.etag = r.etag;   // não insiste no mesmo arquivo com erro
      } else S.fileErr = '';
      render();
    }
  } catch (e) {
    S.net = 'off';
    if (manual) toast('Sem conexão. Mostrando a última cópia guardada.');
  } finally {
    await pollNotif();
    S.busy = false;
    $('btRefresh').classList.remove('spin');
    renderSync(); renderBanners();
  }
}

/* ---------- avisos de mudança ---------- */
function changeText(c) {
  if (c.kind === 'novo') return `${c.sis}: novo chamado (${c.st}${c.evo ? ' · ' + c.evo : ''})`;
  if (c.kind === 'muda') {
    const st = c.ch.find(x => x.f === 'STATUS'), ev = c.ch.find(x => x.f === 'EVOLUCAO');
    if (st) return `${c.sis}: ${st.de || '—'} → ${st.para || '—'}`;
    if (ev) return `${c.sis}: ${ev.para || 'evolução alterada'}`;
    return `${c.sis}: ${c.ch.map(x => x.label.toLowerCase()).join(', ')} alterado`;
  }
  if (c.kind === 'saiu') return `${c.sis}: saiu do arquivo`;
  if (c.kind === 'saiu-varios') return `${c.n} chamados saíram do arquivo`;
  return `${c.sis}: dados atualizados`;
}
function announce(changes) {
  const imp = changes.filter(c => c.kind !== 'dados');
  if (!imp.length) return;
  toast(imp.length === 1 ? changeText(imp[0]) : imp.length + ' mudanças nos chamados · toque para ver', true);
  if (document.hidden && load(K.bell, false) && 'Notification' in window && Notification.permission === 'granted') {
    const title = imp.length === 1 ? changeText(imp[0]) : imp.length + ' mudanças nos chamados';
    const body = imp.length === 1 ? (imp[0].inc || '') : imp.slice(0, 4).map(changeText).join('\n');
    const opt = { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'ps-mudancas', renotify: true };
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then(reg => reg.showNotification(title, opt)).catch(() => { try { new Notification(title, opt); } catch (e) {} });
    } else { try { new Notification(title, opt); } catch (e) {} }
  }
}
let toastT;
function toast(msg, toFeed, ms) {
  const t = $('toast');
  t.textContent = msg;
  t.onclick = () => { t.classList.remove('show'); if (toFeed) { setTab('oc'); $('feed').scrollIntoView({ behavior: 'smooth', block: 'center' }); } };
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), ms || 5000);
}


/* ---------- desenho ---------- */
function unionMs(list, from, to) {
  const iv = list.map(([a, b]) => [Math.max(a, from), Math.min(b, to)]).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  let tot = 0, cs = -1, ce = -1;
  for (const [a, b] of iv) {
    if (a > ce) { if (ce > cs) tot += ce - cs; cs = a; ce = b; } else if (b > ce) ce = b;
  }
  if (ce > cs) tot += ce - cs;
  return tot;
}
const endOf = (r, now) => (r._fim ? r._fim.getTime() : (isOpen(r) ? now : r._ini.getTime()));
function recentKind(id, now) {
  for (const c of S.log) {
    if (now - Date.parse(c.at) > RECENT_MS) break;
    if (c.id === id && (c.kind === 'novo' || c.kind === 'muda')) return c.kind;
  }
  return '';
}
const openRows = () => S.rows.filter(isOpen).sort((a, b) => critRank(a.CRITICIDADE) - critRank(b.CRITICIDADE) || a._ini - b._ini);

// linha de chamado (Chamados de hoje, Histórico e listas do Painel)
// ID da solicitação no sistêmico: cápsula só com borda, à esquerda do nome do sistema (todas as listas)
const idCap = id => id ? `<span class="idc num" title="ID ${esc(id)}">${esc(id)}</span>` : '';
function hiRow(r, now, comDia) {
  const t = tipo(r), ind = isInd(r), ab = isOpen(r);
  const d0 = comDia ? fDM(r._ini) + ' ' : '';
  const range = `${d0}${fHM(r._ini)}`;   // só o início (o fim fica no detalhe)
  const du = ab ? `<span data-since="${r._ini.getTime()}">${fDur(now - r._ini)}</span>` : r._fim ? fDur(r._fim - r._ini) : '–';
  const st = ab ? 'em andamento' : ind ? 'Indevido' : cap(r.EVOLUCAO || r.STATUS);
  return `<button class="hi k-${t.k}${ind ? ' ind' : ''}${ab ? ' aberto' : ''}" data-id="${esc(r.ID)}" style="--fc:${t.c}"><span class="bar"></span>
    <div style="min-width:0"><div class="s">${idCap(r.ID)}<span class="nm">${esc(r.SISTEMA)}</span></div><div class="d num"><span class="dr">${range}</span><span class="cap-t k-${t.k}">${esc(t.longo)}</span></div></div>
    <div class="du num">${du}<small>${esc(st)}</small></div></button>`;
}

/* ---- 1) Ocorrências: ativas (cards grandes) + chamados de hoje + últimas mudanças ---- */
function renderOpen() {
  const now = Date.now();
  const open = openRows();
  $('ctOpen').textContent = open.length;
  $('ctOpen').classList.toggle('hot', open.length > 0);
  const bd = $('navBd'); bd.hidden = !open.length; bd.textContent = open.length;
  if (!open.length) {
    const last = S.rows.filter(r => !isInd(r) && r._fim).sort((a, b) => b._fim - a._fim)[0];
    $('open').innerHTML = `<div class="calm-card" role="status"><div class="cc-top"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/></svg><div class="cc-tx"><b>Nenhuma ocorrência ativa</b><span>Todos os sistemas operando.</span></div></div>` +
      (last ? `<div class="ult"><small>Último normalizado:</small><div class="us"><span class="cc-id num">${esc(last.ID)}</span><span class="cc-nm">${esc(last.SISTEMA)} · ${sameDay(last._fim, new Date()) ? 'hoje' : fDM(last._fim)} às ${fHM(last._fim)}</span></div></div>` : '') + `</div>`;
    return;
  }
  const fixos = S.pins.map(id => open.find(r => r.ID === id)).filter(Boolean);
  const ordem = fixos.concat(open.filter(r => !S.pins.includes(r.ID)));
  $('open').innerHTML = ordem.map(r => {
    const t = tipo(r), rk = recentKind(r.ID, now), fx = S.pins.includes(r.ID), al = r.ALERTA_ENVIADO === '1';
    const ini = sameDay(r._ini, new Date()) ? 'hoje' : fDM(r._ini);
    const seg = segTxt(r.SEGMENTO);
    return `<button class="oc k-${t.k}${rk ? ' com-selo' : ''}${fx ? ' fixo' : ''}" data-id="${esc(r.ID)}">
      <div class="h"><span class="sis" title="${esc(r.SISTEMA)}">${esc(r.SISTEMA)}</span>
        <span class="pin${fx ? ' on' : ''}" role="button" tabindex="0" data-pin="${esc(r.ID)}" aria-pressed="${fx}" aria-label="${fx ? 'Desafixar' : 'Fixar no topo'}" title="${fx ? 'Desafixar' : 'Fixar no topo'}">${PIN_SVG}</span>
        <span class="cap-id num" title="ID da solicitação no sistêmico">ID ${esc(r.ID)}</span></div>
      ${r.IMPACTO_OPERACIONAL ? `<div class="imp">${esc(r.IMPACTO_OPERACIONAL)}</div>` : ''}
      <div class="tl"><span class="cap-t k-${t.k}">${esc(t.longo)}</span>${seg ? `<span class="para">para <b>${esc(seg)}</b></span>` : ''}</div>
      <div class="ft"><div class="timer num"><small>aberto há</small><span data-since="${r._ini.getTime()}">${fDur(now - r._ini)}</span></div>
        <div class="when">${r.EVOLUCAO ? `<span class="evo">${esc(r.EVOLUCAO)}</span>` : ''}<span class="ini num">início ${ini} ${fHM(r._ini)}</span></div></div>
      ${barraDia(r, now)}
      ${rk ? `<span class="selo">${rk === 'novo' ? 'NOVO' : 'MUDOU'}</span>` : ''}
      ${al ? `<span class="alrt" role="button" tabindex="0" data-alerta="${esc(r.ID)}" aria-label="Alerta enviado" title="Alerta enviado">${SIRENE_SVG}</span>` : ''}
    </button>`;
  }).join('');
}
// alfinete (fixar card) e sirene (alerta enviado): traço fino, no estilo das letras
const PIN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5"/><path class="pc" d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>';
const SIRENE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 18v-5a5 5 0 0 1 10 0v5"/><path d="M5 21a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1z"/><path d="M12 2v1.5M3.5 6.5l1.2 1M20.5 6.5l-1.2 1"/><path d="M10 13a2 2 0 0 1 2-2"/></svg>';
// fixar/desafixar: quem é fixado vai para o topo (o último fixado fica em cima); desafixado volta à ordem normal
function alternarPin(id) {
  const i = S.pins.indexOf(id);
  if (i >= 0) S.pins.splice(i, 1); else S.pins.unshift(id);
  if (S.rows.length) S.pins = S.pins.filter(x => S.rows.some(r => r.ID === x));   // tira IDs que saíram do arquivo
  save(K.pins, S.pins);
  renderOpen();
  if (i < 0) { const c = document.querySelector(`#open .oc[data-id="${CSS.escape(id)}"]`); if (c) { c.classList.add('subiu'); setTimeout(() => c.classList.remove('subiu'), 700); } }
}
// janela informativa do alerta enviado
const AL = { aberto: false, hist: false, ignorarPop: false };
function abrirAlerta(id) {
  const r = S.rows.find(x => x.ID === id); if (!r) return;
  let bg = $('alBg');
  if (!bg) {
    bg = document.createElement('div'); bg.id = 'alBg'; bg.className = 'nt-bg'; bg.hidden = true;
    bg.innerHTML = '<div class="nt t-INFORMACAO" id="alBox" role="dialog" aria-modal="true" aria-labelledby="alTit" tabindex="-1"></div>';
    bg.addEventListener('click', e => { if (e.target === bg) fecharAlerta(); });
    document.body.appendChild(bg);
  }
  const ic = window.PSNotif && PSNotif.icone ? PSNotif.icone('INFORMACAO') : '';
  $('alBox').innerHTML = `<div class="nt-h"><span class="nt-ic">${ic}</span><h3 id="alTit">Alerta enviado</h3></div>
    <div class="nt-corpo"><p class="al-sis"><span class="idc num">${esc(r.ID)}</span> <b>${esc(r.SISTEMA)}</b></p>
      <p>Foi enviado um <b>alerta</b> para <b>reforçar a solicitação com a área responsável</b>${r.AREA_ACIONADA && r.AREA_ACIONADA !== 'undefined' ? ` (<b>${esc(r.AREA_ACIONADA)}</b>)` : ''}.</p>
      <p>O chamado continua em acompanhamento até ser normalizado.</p></div>
    <div class="nt-acoes"><button class="nt-bt" id="alX" aria-label="Fechar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg><span>Fechar</span></button></div>`;
  $('alX').onclick = () => fecharAlerta();
  bg.hidden = false; document.body.classList.add('al-on'); document.documentElement.classList.add('trava');
  if (!AL.aberto) { try { history.pushState({ alerta: 1 }, ''); AL.hist = true; } catch (e) { AL.hist = false; } }
  AL.aberto = true;
  $('alBox').focus({ preventScroll: true });
}
function fecharAlerta(porHistorico) {
  if (!AL.aberto) return;
  AL.aberto = false; $('alBg').hidden = true; document.body.classList.remove('al-on');
  if (!document.body.matches('.nt-on, .sheet-on')) document.documentElement.classList.remove('trava');
  if (!porHistorico && AL.hist) { AL.ignorarPop = true; history.back(); }
  AL.hist = false;
}

// segmentos afetados: "B2B, B2C, CAMPO" → "B2B, B2C e CAMPO"
function segTxt(s) {
  const l = String(s || '').split(',').map(x => x.trim()).filter(Boolean);
  return l.length < 2 ? (l[0] || '') : l.slice(0, -1).join(', ') + ' e ' + l[l.length - 1];
}
// barra do dia (expediente 08h–21h de HOJE): trecho que o chamado ocupou hoje, até agora.
// Chamado que vem de ontem começa a contar às 08h de hoje. Atualiza ao vivo (tick).
const EXP_INI = 8, EXP_FIM = 21;
const POS14 = ((14 - EXP_INI) / (EXP_FIM - EXP_INI) * 100).toFixed(2);   // marca das 14h na barra
function trechoHoje(iniMs, now) {
  const d = new Date(now), a = new Date(d.getFullYear(), d.getMonth(), d.getDate(), EXP_INI).getTime(), b = new Date(d.getFullYear(), d.getMonth(), d.getDate(), EXP_FIM).getTime();
  const s = Math.max(iniMs, a), e = Math.min(now, b);
  const tot = b - a;
  return { l: e > s ? (s - a) / tot * 100 : 0, w: e > s ? (e - s) / tot * 100 : 0, ms: Math.max(0, e - s), antes: now < a, deOntem: iniMs < new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() };
}
function barraDiaTxt(x) {
  if (x.antes) return 'expediente começa às 08h';
  if (!x.ms) return 'fora do expediente hoje';
  return `${fDur(x.ms)} hoje no expediente${x.deOntem ? ' · vem de antes de hoje' : ''}`;
}
function barraDia(r, now) {
  const x = trechoHoje(r._ini.getTime(), now);
  return `<div class="dbar" data-dia="${r._ini.getTime()}" role="img" aria-label="Ocupação de hoje das 08h às 21h: ${barraDiaTxt(x)}">
      <div class="trk"><span class="m14" style="left:${POS14}%"></span><span class="fill" style="left:${x.l.toFixed(2)}%;width:${x.w.toFixed(2)}%"></span></div>
      <div class="esc num"><span>08h</span><span class="dtx">${barraDiaTxt(x)}</span><span>21h</span></div></div>`;
}
// chamados de hoje: abertos hoje, encerrados hoje ou ainda em andamento (os abertos primeiro)
function renderHoje() {
  const now = Date.now();
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const list = S.rows.filter(r => r._ini >= d0 || isOpen(r) || (r._fim && r._fim >= d0))
    .sort((a, b) => (isOpen(b) - isOpen(a)) || b._ini - a._ini);
  const val = list.filter(r => !isInd(r));
  const ms = unionMs(val.map(r => [r._ini.getTime(), endOf(r, now)]), d0.getTime(), now);
  $('hojeRes').innerHTML = list.length ? `${val.length} chamado${val.length === 1 ? '' : 's'}${ms ? ' · ' + fDur(ms) : ''}` : '';
  $('hoje').innerHTML = list.length ? `<div class="lst">${list.map(r => hiRow(r, now, !sameDay(r._ini, new Date(now)))).join('')}</div>`
    : `<div class="lst"><div class="empty okt">Nenhum chamado hoje.</div></div>`;
}

function feedItem(c, now) {
  const d = new Date(c.at);
  const hr = `<div class="hr num">${fHM(d)}${sameDay(d, new Date(now)) ? '' : `<small>${fDM(d)}</small>`}</div>`;
  let tx;
  const nome = `<span class="fn">${idCap(c.id)}<span class="fs">${esc(c.sis)}</span></span>`;
  // cada campo que mudou vira uma linha "• Campo: valor que entrou" (sem o valor anterior)
  const li = (rot, val) => `<li><b>${esc(rot)}${val != null ? ':' : ''}</b>${val != null ? ' ' + esc(val) : ''}</li>`;
  const valor = x => {
    if (!x.para) return x.f === 'DATA_FIM' ? 'retirado' : '—';
    if (x.f === 'DATA_FIM') { const f = parseDate(x.para); return f ? fDM(f) + ' ' + fHM(f) : x.para; }
    if (x.f === 'TIPO_FALHA') return tipo({ TIPO_FALHA: x.para }).longo;
    if (x.f === 'CRITICIDADE') return x.para;
    return cap(x.para);
  };
  let itens;
  if (c.kind === 'novo') itens = li('Novo chamado') + li('Status', cap(c.st)) + (c.evo ? li('Evolução', cap(c.evo)) : '');
  else if (c.kind === 'muda') itens = c.ch.map(x => li(x.label, valor(x))).join('');
  else if (c.kind === 'dados') itens = li('Dados do chamado atualizados');
  else if (c.kind === 'saiu') itens = li('Saiu do arquivo');
  if (c.kind === 'saiu-varios') tx = `<span class="fs">${c.n} chamados saíram do arquivo</span><ul class="lg">${li('IDs', c.ids.slice(0, 12).join(', ') + (c.ids.length > 12 ? '…' : ''))}</ul>`;
  else tx = `${nome}<ul class="lg">${itens}</ul>`;
  const clickable = c.id && S.rows.some(r => r.ID === c.id);
  return `<button class="fi" ${clickable ? `data-id="${esc(c.id)}"` : 'disabled'}>${hr}<div class="tx">${tx}</div></button>`;
}
function renderFeed() {
  const now = Date.now();
  const list = S.feedAll ? S.log : S.log.slice(0, 5);
  $('btFeed').hidden = S.log.length <= 5;
  $('btFeed').textContent = S.feedAll ? 'Ver menos' : `Ver todas (${S.log.length})`;
  $('feed').innerHTML = list.length ? list.map(c => feedItem(c, now)).join('')
    : `<div class="empty">As mudanças de status aparecem aqui assim que acontecerem. O app confere o arquivo a cada minuto.</div>`;
}

/* ---- 2) Histórico: busca, filtro por sistema e por tipo de falha ---- */
const CHIPS = [['todos', 'Todos'], ['total', 'Indisp. total', 'var(--fTotal)'], ['parcial', 'Indisp. parcial', 'var(--fParcial)'], ['interm', 'Intermitência', 'var(--fInterm)'], ['lent', 'Lentidão', 'var(--fLent)'], ['ind', 'Indevidos']];
function renderChips() {
  $('chips').innerHTML = CHIPS.map(([k, n, c]) => `<button class="chip" data-f="${k}" aria-pressed="${S.filter === k}"${c ? ` style="--fc:${c}"` : ''}>${c ? '<i></i>' : ''}${n}</button>`).join('');
}
// lista própria de sistemas: nome à esquerda, quantidade de ocorrências (sem indevidos) na cápsula à direita
const CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
function sisContagem() {
  const cont = new Map();
  S.rows.forEach(r => { if (!isInd(r)) cont.set(r.SISTEMA, (cont.get(r.SISTEMA) || 0) + 1); else if (!cont.has(r.SISTEMA)) cont.set(r.SISTEMA, 0); });
  return cont;
}
const somaOc = cont => [...cont.values()].reduce((a, n) => a + n, 0);   // total de ocorrências (sem indevidos)
function renderSisSelect() {
  const cont = sisContagem();
  if (S.fSis && !cont.has(S.fSis)) S.fSis = '';
  const aberto = !$('pickL').hidden;
  const f = $('pickF');
  f.classList.toggle('on', !!S.fSis);
  f.innerHTML = (S.fSis ? `<button class="pick-x" id="pickX" aria-label="Remover filtro de sistema" title="Remover filtro">✕</button>` : '') +
    `<button class="pick-b" id="pickB" aria-haspopup="listbox" aria-expanded="${aberto}" aria-controls="pickL">` +
    (S.fSis ? `<span class="nm">${esc(S.fSis)}</span><span class="qtd">${cont.get(S.fSis)}</span>` : `<span class="nm">Todos os sistemas</span><span class="qtd">${somaOc(cont)}</span>`) + CHEV + `</button>`;
  if (aberto) renderSisLista(cont);
}
function renderSisLista(cont) {
  cont = cont || sisContagem();
  const nomes = [...cont.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  $('pickL').innerHTML = `<button class="pick-o todos" role="option" data-sis="" aria-selected="${!S.fSis}"><span class="nm">Todos os sistemas</span><span class="qtd">${somaOc(cont)}</span></button>` +
    nomes.map(n => `<button class="pick-o" role="option" data-sis="${esc(n)}" aria-selected="${n === S.fSis}"><span class="nm">${esc(n)}</span><span class="qtd">${cont.get(n)}</span></button>`).join('');
}
function abrirSis() {
  renderSisLista();
  $('pickL').hidden = false;
  $('pickB').setAttribute('aria-expanded', 'true');
  const sel = $('pickL').querySelector('[aria-selected="true"]');
  if (sel) { sel.scrollIntoView({ block: 'nearest' }); sel.focus({ preventScroll: true }); }
}
function fecharSis() {
  if ($('pickL').hidden) return;
  $('pickL').hidden = true;
  const b = $('pickB'); if (b) b.setAttribute('aria-expanded', 'false');
}
function setSis(n) {
  S.fSis = n; S.histCorte = null;
  fecharSis(); renderSisSelect(); renderHist();
}
function renderHist() {
  const now = new Date();
  const q = S.q.trim().toLowerCase();
  let list = S.rows.slice();
  if (S.fSis) list = list.filter(r => r.SISTEMA === S.fSis);
  if (S.filter === 'ind') list = list.filter(isInd);
  else if (S.filter !== 'todos') list = list.filter(r => tipo(r).k === S.filter);
  if (q) list = list.filter(r => [r.ID, r.SISTEMA, r.CHAMADO, r.IMPACTO_OPERACIONAL, r.EVOLUCAO, r.AREA_ACIONADA, r.TIPO_FALHA, r.SEGMENTO, r.STATUS].join(' ').toLowerCase().includes(q));
  list.sort((a, b) => b._ini - a._ini);
  const val = list.filter(r => !isInd(r));
  const ms = val.reduce((a, r) => a + (endOf(r, now.getTime()) - r._ini), 0);
  $('hres').innerHTML = list.length ? `<span>${list.length} chamado${list.length > 1 ? 's' : ''}${list.length - val.length ? ` (${list.length - val.length} indevido${list.length - val.length > 1 ? 's' : ''})` : ''}</span><span>${fDur(ms)} somados</span>` : '';
  const groups = [];
  for (const r of list) {
    const k = dayKey(r._ini);
    if (!groups.length || groups[groups.length - 1].k !== k) groups.push({ k, d: r._ini, rows: [] });
    groups[groups.length - 1].rows.push(r);
  }
  if (!groups.length) { $('hist').innerHTML = `<div class="day"><div class="empty">${q || S.filter !== 'todos' || S.fSis ? 'Nada encontrado com esse filtro.' : 'Sem chamados no arquivo.'}</div></div>`; return; }
  // corte = 1º dia do mês mais antigo exibido (padrão: mês anterior ao atual).
  // Se o filtro não tiver nada nesses meses, começa pelo mês mais recente que tiver chamado.
  const mesDe = d => new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  let corte = S.histCorte != null ? S.histCorte : new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
  corte = Math.min(corte, mesDe(groups[0].d));
  const shown = groups.filter(g => g.d.getTime() >= corte);
  const prox = groups[shown.length];   // 1º dia ainda escondido: o mês dele é o próximo a mostrar
  const rotMes = d => MESES_LONGO[d.getMonth()] + (d.getFullYear() !== now.getFullYear() ? ' de ' + d.getFullYear() : '');
  $('hist').innerHTML = shown.map(g => {
    const v = g.rows.filter(r => !isInd(r));
    const d0 = new Date(g.d); d0.setHours(0, 0, 0, 0);
    const dms = unionMs(v.map(r => [r._ini.getTime(), endOf(r, Date.now())]), d0.getTime(), d0.getTime() + 864e5);
    return `<div class="day"><div class="dh"><b>${esc(dayLabel(g.d, now))}</b><span class="num">${g.rows.length} chamado${g.rows.length > 1 ? 's' : ''}${dms ? ' · ' + fDur(dms) : ''}</span></div>` +
      g.rows.map(r => hiRow(r, Date.now(), false)).join('') + `</div>`;
  }).join('') + (prox ? `<button class="more" id="btMore" data-corte="${mesDe(prox.d)}">Mostrar mês de ${rotMes(prox.d)}</button>` : '');
}

/* ---- 3) Painel ---- */
function itensPainel(now) {
  return S.rows.map(r => ({ id: r.ID, sistema: r.SISTEMA, tipo: up(r.TIPO_FALHA), ini: r._ini, fimCalc: new Date(endOf(r, now)), indevido: isInd(r), aberto: isOpen(r) }));
}
function renderPainel() {
  const root = $('pgPainel');
  if (!window.PSPainel || PSPainel.versao !== VERSION) { root.innerHTML = `<div class="banner bad">O painel está numa versão diferente do app. Feche e abra o app de novo para atualizar.</div>`; return; }
  if (!S.rows.length) { root.innerHTML = `<div class="card empty">Sem dados para o painel.</div>`; return; }
  const now = Date.now();
  const inicio = S.rows.reduce((m, r) => (!m || r._ini < m ? r._ini : m), null);
  PSPainel.render({ root, now, inicio, itens: itensPainel(now), rerender: renderPainel, abrirLista: openList });
  S.painelAt = now;
}

/* ---- topo, avisos e dados ---- */
function renderSync() {
  const dot = $('syncDot'), tx = $('syncTx');
  dot.className = 'dot';
  if (!S.rows.length) { dot.classList.add(S.net === 'off' ? 'err' : 'off'); tx.textContent = S.net === 'off' ? 'Sem conexão e sem cópia guardada' : 'Carregando…'; return; }
  if (S.fileErr) { dot.classList.add('err'); tx.textContent = 'Arquivo novo com erro · mostrando os últimos dados válidos'; return; }
  if (S.net === 'off') { dot.classList.add('off'); tx.textContent = 'Sem conexão · cópia de ' + fFull(new Date(S.loadedAt)); return; }
  if (S.net === 'init') { dot.classList.add('off'); tx.textContent = 'Conferindo… · cópia de ' + fFull(new Date(S.loadedAt)); return; }
  dot.classList.add('live');
  tx.textContent = 'Ao vivo · conferido ' + fAgo(Date.now() - S.checkedAt);
}
function renderBanners() {
  const b = [];
  if (S.saveErr) b.push(['bad', '<b>Não foi possível guardar os dados no aparelho.</b> O app funciona, mas sem internet ele não terá a última cópia e o registro de mudanças pode se perder. Libere espaço do navegador ou saia da aba anônima.']);
  if (S.fileErr) b.push(['bad', `<b>O arquivo recebido tem erro:</b> ${esc(S.fileErr)}. O app continua com os últimos dados válidos${S.loadedAt ? ' (de ' + fFull(new Date(S.loadedAt)) + ')' : ''}.`]);
  if (S.goneWarn) b.push(['warn', `<b>${S.goneWarn} chamados sumiram do arquivo de uma vez.</b> Confira se o arquivo veio completo.`]);
  // erros (vermelho) e alerta de chamados sumidos ficam no topo; avisos de leitura vão para o fim da página
  $('banners').innerHTML = b.map(([c, h]) => `<div class="banner ${c}">${h}</div>`).join('');
  const ws = S.warns.concat(window.PSNotif ? PSNotif.avisos() : []);
  $('avisos').innerHTML = !ws.length ? '' : `<div class="banner warn"><details><summary>${ws.length} aviso${ws.length > 1 ? 's' : ''} na leitura dos arquivos · ver</summary><ul class="warnlist">${ws.slice(0, 50).map(w => `<li>${esc(w)}</li>`).join('')}${ws.length > 50 ? `<li>… e mais ${ws.length - 50}</li>` : ''}</ul></details></div>`;
}

/* ---- páginas ---- */
const TABS = { oc: 'pgOc', hist: 'pgHist', painel: 'pgPainel' };
function renderTab() {
  if (S.tab === 'oc') { renderOpen(); renderHoje(); renderFeed(); }
  else if (S.tab === 'hist') { renderSisSelect(); renderChips(); renderHist(); }
  else renderPainel();
}
function setTab(t) {
  if (!TABS[t] || t === S.tab) return;
  S.tab = t;
  if (t === 'painel' && window.PSPainel && PSPainel.recolher) PSPainel.recolher();   // matriz de sistemas sempre começa fechada
  Object.entries(TABS).forEach(([k, id]) => { $(id).hidden = k !== t; });
  document.querySelectorAll('#tabs button').forEach(b => { const on = b.dataset.v === t; b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'page' : 'false'); });
  renderTab();
  window.scrollTo(0, 0);
}
function render() {
  renderSync(); renderBanners();
  renderOpen();               // também mantém o número no menu de baixo
  renderTab();
  if (S.sheet) refreshSheet();
}

function tick() {
  const now = Date.now();
  document.querySelectorAll('[data-since]').forEach(el => { el.textContent = fDur(now - +el.dataset.since); });
  document.querySelectorAll('[data-ago]').forEach(el => { el.textContent = fAgo(now - +el.dataset.ago); });
  document.querySelectorAll('[data-dia]').forEach(el => {
    const x = trechoHoje(+el.dataset.dia, now), f = el.querySelector('.fill');
    f.style.left = x.l.toFixed(2) + '%'; f.style.width = x.w.toFixed(2) + '%';
    el.querySelector('.dtx').textContent = barraDiaTxt(x);
    el.setAttribute('aria-label', 'Ocupação de hoje das 08h às 21h: ' + barraDiaTxt(x));
  });
  renderSync();
  if (window.PSNotif) PSNotif.atualizar();   // notificação entra/sai na hora certa pelas datas
  if (S.tab === 'oc' && S.rows.length) renderHoje();
  // painel com chamado em andamento: redesenha a cada minuto (o tempo do aberto cresce)
  if (S.tab === 'painel' && !S.sheet && S.rows.some(isOpen) && now - (S.painelAt || 0) >= 60000) {
    const y = window.scrollY; renderPainel(); window.scrollTo(0, y);
  }
}

/* ---------- folha: lista (do Painel) e detalhe ---------- */
function showSheet() {
  $('sheetBg').style.display = 'block';
  document.body.classList.add('sheet-on'); document.documentElement.classList.add('trava');
  requestAnimationFrame(() => $('sheet').classList.add('show'));
  history.pushState({ sheet: 1 }, '');
}
function openSheet(id) {
  const novo = !S.sheet;
  S.sheet = { mode: 'det', id, list: null };
  if (!refreshSheet()) { S.sheet = null; return; }
  $('sheet').scrollTop = 0;   // detalhe sempre começa do topo
  if (novo) showSheet();
}
function openList(titulo, sub, ids, onClose) {
  const novo = !S.sheet;
  S.sheet = { mode: 'list', id: null, list: { titulo, sub, ids, onClose } };
  refreshSheet();
  if (novo) showSheet();
}
function refreshSheet() {
  const sh = S.sheet; if (!sh) return false;
  if (sh.mode === 'list') { drawList(sh.list); return true; }
  return drawDet(sh.id, sh.list);
}
function drawList(l) {
  const now = Date.now();
  const rows = l.ids.map(id => S.rows.find(r => r.ID === id)).filter(Boolean);
  $('sheet').innerHTML = `<button class="fechar" id="shX" aria-label="Fechar" title="Fechar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>
    <h3 id="shTitle">${esc(l.titulo)}</h3><div class="sub">${esc(l.sub)}</div>
    <div class="lst">${rows.map(r => hiRow(r, now, true)).join('') || '<div class="empty">Os chamados dessa lista não estão mais no arquivo.</div>'}</div>`;
  $('shX').onclick = () => history.back();
  $('sheet').scrollTop = 0;
}
function drawDet(id, list) {
  const r = S.rows.find(x => x.ID === id);
  if (!r) return false;
  const now = Date.now(), t = tipo(r), open = isOpen(r);
  const yn = v => (v === '1' ? 'Sim' : v === '0' ? 'Não' : esc(v || '—'));
  const row = (k, v) => v ? `<dt>${k}</dt><dd>${v}</dd>` : '';
  const extra = S.cols.filter(c => !KNOWN.includes(c) && !OCULTAS.includes(c));
  const hist = S.log.filter(c => c.id === id);
  const msExp = window.PSPainel ? PSPainel.msExpediente({ ini: r._ini, fimCalc: new Date(endOf(r, now)) }) : null;
  $('sheet').innerHTML = `<button class="fechar" id="shX" aria-label="Fechar" title="Fechar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>
    ${list ? '<button class="volta" id="shVolta">‹ Voltar à lista</button>' : ''}
    <h3 id="shTitle" class="dt-h"><span class="nm">${esc(r.SISTEMA)}</span><span class="cap-id num" title="ID da solicitação no sistêmico">ID ${esc(r.ID)}</span><span class="stl"><span class="cap-t k-${t.k}">${esc(t.longo)}</span>${statusTag(r.STATUS)}</span></h3>
    <div class="big">
      ${temChamado(r.CHAMADO)
      ? `<button class="cham" id="shCham" data-cham="${esc(r.CHAMADO)}" aria-label="Copiar o chamado ${esc(r.CHAMADO)}"><span class="tx"><small>Chamado</small><b>${esc(r.CHAMADO)}</b></span><span class="cp" title="Copiar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></span></button>`
      : `<div class="cham sem"><span class="tx"><small>Chamado</small><b>Sem chamado</b></span></div>`}
      <div><small>Duração</small><b class="num" ${open ? `data-since="${r._ini.getTime()}"` : ''}>${fDur(endOf(r, now) - r._ini)}</b></div>
      <div><small>Início</small><b class="num">${fFull(r._ini)}</b></div>
      <div><small>Fim</small><b class="num">${r._fim ? fFull(r._fim) : (open ? 'em andamento' : '—')}</b></div>
    </div>
    <dl class="kv">
      ${row('Segmento', esc(r.SEGMENTO))}
      ${msExp != null ? row('No expediente (08h–21h)', msExp ? fDur(msExp) : 'fora do expediente') : ''}
      ${row('Área acionada', esc(r.AREA_ACIONADA))}
      ${row('Grupos responsáveis', esc(r.GRUPOS_RESPONSAVEIS))}
      ${row('Grupos impactados', esc(r.GRUPOS_IMPACTADOS))}
      ${row('Evolução', esc(r.EVOLUCAO))}
      ${row('Impacto', esc(r.IMPACTO_OPERACIONAL))}
      ${'ALERTA_ENVIADO' in r ? row('Alerta enviado', yn(r.ALERTA_ENVIADO)) : ''}
    </dl>
    ${extra.length ? `<h4>Outras colunas</h4><dl class="kv">${extra.map(c => row(esc(c), esc(r[c]) || '—')).join('')}</dl>` : ''}
    <h4>Mudanças registradas</h4>
    ${hist.length ? `<div class="feed">${hist.map(c => feedItem(c, now).replace(/data-id="[^"]*"/, 'disabled')).join('')}</div>` : '<div class="empty" style="padding:0">Nenhuma mudança registrada neste aparelho.</div>'}
    ${analiseHtml(r, now)}`;
  $('shX').onclick = () => history.back();
  if ($('shCham')) $('shCham').onclick = () => copiarChamado($('shCham').dataset.cham);
  if (list) $('shVolta').onclick = () => { S.sheet = { mode: 'list', id: null, list }; refreshSheet(); };
  return true;
}
/* ---------- análise do histórico (detalhe) ----------
   Amostra: todo o arquivo (6 meses fechados + o mês atual), mesmo SISTEMA e mesmo tipo de falha.
   Tempo = duração total (início → fim) dos chamados encerrados; indevidos ficam fora.
   Frequência = dias da base ÷ ocorrências (inclui as em andamento). */
function analise(r, now) {
  const k = tipo(r).k, sis = up(r.SISTEMA);
  const mesmos = S.rows.filter(x => up(x.SISTEMA) === sis && tipo(x).k === k && !isInd(x));
  const fech = mesmos.filter(x => x._fim).map(x => ({ x, ms: x._fim - x._ini })).sort((a, b) => a.ms - b.ms);
  const ini0 = S.rows.reduce((m, x) => (!m || x._ini < m ? x._ini : m), null);
  const base0 = ini0 ? new Date(ini0.getFullYear(), ini0.getMonth(), 1) : null;   // 1º dia do mês mais antigo da base
  const dias = base0 ? Math.max(1, (now - base0) / 864e5) : 0;
  const media = fech.length ? fech.reduce((a, f) => a + f.ms, 0) / fech.length : null;
  return { n: mesmos.length, nFech: fech.length, media, menor: fech[0] || null, maior: fech[fech.length - 1] || null, base0, dias };
}
function freqTxt(a) {
  if (!a.n || !a.base0) return '';
  const intervalo = a.dias / a.n;
  const periodo = `${a.n} ocorrência${a.n > 1 ? 's' : ''} em ${Math.round(a.dias)} dias de base`;
  if (a.n === 1) return `Primeira ocorrência desse problema na base (${Math.round(a.dias)} dias).`;
  if (intervalo < 1) return `Esse problema ocorre em média <b>${(a.n / a.dias).toFixed(1).replace('.', ',')} vezes por dia</b> (${periodo}).`;
  const d = Math.round(intervalo);
  return `Esse problema ocorre em média <b>a cada ${d} dia${d > 1 ? 's' : ''}</b> (${periodo}).`;
}
function analiseHtml(r, now) {
  const t = tipo(r), a = analise(r, now);
  const quando = f => `<small class="qd">${fDM(f.x._ini)}/${String(f.x._ini.getFullYear()).slice(2)}</small>`;
  let cmp = '';
  if (isOpen(r) && a.media != null) {
    const aberto = now - r._ini;
    cmp = `<p class="an-cmp ${aberto > a.media ? 'acima' : ''}">Este chamado está aberto há <b>${fDur(aberto)}</b>: ${aberto > a.maior.ms ? 'já passou do maior tempo da base' : aberto > a.media ? 'acima da média' : 'dentro da média'}.</p>`;
  }
  const corpo = !a.nFech ? `<div class="empty" style="padding:0">Ainda não há chamado encerrado de ${esc(r.SISTEMA)} com ${esc(t.longo.toLowerCase())} na base para calcular os tempos.</div>`
    : `<div class="an-box">
        <div><small>Tempo médio</small><b class="num">${fDur(a.media)}</b></div>
        <div><small>Maior tempo</small><b class="num">${fDur(a.maior.ms)}</b>${quando(a.maior)}</div>
        <div><small>Menor tempo</small><b class="num">${fDur(a.menor.ms)}</b>${quando(a.menor)}</div>
      </div>${cmp}`;
  return `<h4>Análise do histórico</h4>
    <div class="an">
      <div class="an-t">${esc(r.SISTEMA)} · <span class="tf" style="--fc:${t.c}"><i></i>${esc(t.longo)}</span></div>
      ${corpo}
      ${a.n ? `<p class="an-fq">${freqTxt(a)}</p>` : ''}
      <p class="an-base">Base: ${a.nFech} chamado${a.nFech === 1 ? '' : 's'} encerrado${a.nFech === 1 ? '' : 's'} desse sistema com esse tipo de falha${a.base0 ? `, de ${fDM(a.base0)}/${String(a.base0.getFullYear()).slice(2)} até hoje` : ''} · tempo total do início ao fim · indevidos fora.</p>
    </div>`;
}
/* ---------- copiar o número do chamado ---------- */
const temChamado = c => !!String(c || '').trim() && !/^sem\s+chamado$/i.test(String(c).trim());
async function copiarChamado(c) {
  let ok = false;
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(c); ok = true; } } catch (e) {}
  if (!ok) {   // navegador sem a API: cópia pelo método antigo
    try {
      const ta = document.createElement('textarea');
      ta.value = c; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, c.length);
      ok = document.execCommand('copy'); ta.remove();
    } catch (e) { ok = false; }
  }
  toast(ok ? `Chamado ${c} copiado` : `Não foi possível copiar. Chamado: ${c}`, false, ok ? 2500 : 6000);
}
function closeSheet() {
  const l = S.sheet && S.sheet.list;
  S.sheet = null;
  $('sheet').classList.remove('show'); $('sheet').scrollTop = 0;
  $('sheetBg').style.display = 'none';
  document.body.classList.remove('sheet-on'); if (!document.body.matches('.nt-on, .al-on')) document.documentElement.classList.remove('trava');
  if (l && l.onClose) l.onClose();
}

/* ---------- avisos no aparelho ---------- */
function renderBell() {
  const on = load(K.bell, false) && 'Notification' in window && Notification.permission === 'granted';
  $('btBell').classList.toggle('on', !!on);
  $('btBell').setAttribute('aria-pressed', on ? 'true' : 'false');
}
async function toggleBell() {
  if (!('Notification' in window)) { toast('Este aparelho não permite avisos pelo navegador. As mudanças continuam aparecendo no app.'); return; }
  if (load(K.bell, false) && Notification.permission === 'granted') {
    save(K.bell, false); renderBell(); toast('Avisos no aparelho desligados.'); return;
  }
  let p = Notification.permission;
  if (p === 'default') { try { p = await Notification.requestPermission(); } catch (e) { p = 'denied'; } }
  if (p !== 'granted') { toast('Os avisos estão bloqueados nas configurações do navegador para este site.'); renderBell(); return; }
  if (!save(K.bell, true)) { toast('Não foi possível guardar essa escolha no aparelho.'); return; }
  renderBell();
  toast('Avisos ligados: com o app aberto em segundo plano, cada mudança de status gera um aviso.');
}

/* ---------- início ---------- */
function init() {
  $('ver').textContent = VERSION;
  const stored = load(K.data, null);
  if (stored && stored.text) {
    const p = applyText(stored.text, { etag: stored.etag, source: stored.source, loadedAt: stored.loadedAt }, true);
    if (!p.ok) { S.text = ''; S.etag = ''; }
  }
  render(); renderBell();
  if (window.PSNotif && PSNotif.versao === VERSION) { PSNotif.iniciar(); $('btNotif').onclick = () => PSNotif.tocarBotao(); renderBanners(); }

  document.addEventListener('click', e => {
    const pn = e.target.closest('[data-pin]');
    if (pn) { e.preventDefault(); alternarPin(pn.dataset.pin); return; }
    const ale = e.target.closest('[data-alerta]');
    if (ale) { e.preventDefault(); abrirAlerta(ale.dataset.alerta); return; }
    const it = e.target.closest('[data-id]');
    if (it && !it.disabled) {
      if (it.closest('#sheet')) {   // item da lista do Painel: abre o detalhe com "Voltar à lista"
        if (S.sheet && S.sheet.mode === 'list') { S.sheet = { mode: 'det', id: it.dataset.id, list: S.sheet.list }; refreshSheet(); $('sheet').scrollTop = 0; }
        return;
      }
      if (it.closest('#pgOc') || it.closest('#pgHist')) { openSheet(it.dataset.id); return; }
    }
    const ch = e.target.closest('#chips .chip');
    if (ch) { S.filter = ch.dataset.f; S.histCorte = null; renderChips(); renderHist(); return; }
    if (e.target.id === 'btMore') { S.histCorte = +e.target.dataset.corte; renderHist(); }
  });
  document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => setTab(b.dataset.v));
  $('btFeed').onclick = () => { S.feedAll = !S.feedAll; renderFeed(); };
  $('btRefresh').onclick = () => poll(true);
  $('btBell').onclick = toggleBell;
  let qT; $('q').addEventListener('input', e => { clearTimeout(qT); qT = setTimeout(() => { S.q = e.target.value; S.histCorte = null; renderHist(); }, 150); });
  $('pick').addEventListener('click', e => {
    if (e.target.closest('#pickX')) { e.stopPropagation(); setSis(''); return; }
    if (e.target.closest('#pickB')) { $('pickL').hidden ? abrirSis() : fecharSis(); return; }
    const o = e.target.closest('.pick-o'); if (o) setSis(o.dataset.sis);
  });
  document.addEventListener('pointerdown', e => { if (!e.target.closest('#pick')) fecharSis(); }, true);
  $('pickL').addEventListener('keydown', e => {
    const os = [...$('pickL').querySelectorAll('.pick-o')], i = os.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = os[Math.max(0, Math.min(os.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]; if (n) n.focus(); }
    if (e.key === 'Escape') { e.stopPropagation(); fecharSis(); $('pickB').focus(); }
  });
  $('sheetBg').onclick = () => history.back();
  // Enter/Espaço no alfinete e na sirene (estão dentro do card)
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const x = e.target.closest && e.target.closest('[data-pin], [data-alerta]');
    if (x) { e.preventDefault(); e.stopPropagation(); x.click(); }
  }, true);
  window.addEventListener('popstate', () => {
    if (AL.ignorarPop) { AL.ignorarPop = false; return; }
    if (AL.aberto) { fecharAlerta(true); return; }
    if (window.PSNotif && PSNotif.consumirPop()) return;          // a própria janela de notificação voltou o histórico
    if (window.PSNotif && PSNotif.aberto()) { PSNotif.fechar(true); return; }
    if (S.sheet) closeSheet();
  });
  document.addEventListener('keydown', e => { if (e.key !== 'Escape') return; if (AL.aberto) fecharAlerta(); else if (window.PSNotif && PSNotif.aberto()) PSNotif.fechar(); else if (S.sheet) history.back(); });
  if (window.PSPainel) PSPainel.gesto($('pgPainel'), () => S.tab === 'painel');

  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - S.checkedAt > 15000) poll(); });
  window.addEventListener('online', () => poll());
  setInterval(() => { if (!document.hidden || load(K.bell, false)) poll(); }, POLL_MS);
  setInterval(tick, TICK_MS);
  poll();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
init();
