/* Problemas Sistêmicos — andamento dos chamados em tempo real
   Fonte: sistemas.txt (TXT do SQL Developer, separado por tabulação, cabeçalho na 1ª linha).
   O app confere o arquivo a cada minuto e registra toda mudança de status por ID. */
'use strict';

const VERSION = '1.0.0';
const POLL_MS = 60 * 1000;           // conferência do arquivo
const TICK_MS = 5 * 1000;            // relógio dos tempos em andamento
const RECENT_MS = 60 * 60 * 1000;    // selo NOVO / MUDOU vale por 1 hora
const LOG_MAX = 300;                 // mudanças guardadas no aparelho
const HIST_STEP = 7;                 // dias do histórico por vez

const REQUIRED = ['ID', 'SISTEMA', 'STATUS', 'DATA_INICIO'];
const KNOWN = ['ID', 'SISTEMA', 'CHAMADO', 'STATUS', 'CRITICIDADE', 'EVOLUCAO', 'SEGMENTO', 'IMPACTO_OPERACIONAL',
  'DATA_INICIO', 'DATA_FIM', 'TIPO_FALHA', 'GRUPOS_RESPONSAVEIS', 'GRUPOS_IMPACTADOS', 'AREA_ACIONADA',
  'ALERTA_ENVIADO', 'DATA_ATUALIZACAO', 'DADO_ATUALIZADO', 'TEMPO_DECORRIDO'];
// campos acompanhados: mudança em qualquer um entra em "Últimas mudanças"
const TRACK = [['STATUS', 'Status'], ['EVOLUCAO', 'Evolução'], ['DATA_FIM', 'Fim'], ['CRITICIDADE', 'Criticidade'], ['TIPO_FALHA', 'Tipo de falha']];

const K = { data: 'ps.data', snap: 'ps.snap', log: 'ps.log', bell: 'ps.bell' };

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
  if (t.includes('TOTAL')) return { k: 'total', c: 'var(--fTotal)', n: 'Total' };
  if (t.includes('PARCIAL')) return { k: 'parcial', c: 'var(--fParcial)', n: 'Parcial' };
  if (t.includes('INTERMIT')) return { k: 'interm', c: 'var(--fInterm)', n: 'Intermitência' };
  if (t.includes('LENTID')) return { k: 'lent', c: 'var(--fLent)', n: 'Lentidão' };
  return { k: 'outro', c: 'var(--fOutro)', n: r.TIPO_FALHA ? cap(r.TIPO_FALHA) : 'Sem tipo' };
}
function cap(s) { s = String(s || '').toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); }
function critClass(c) {
  const n = parseInt(String(c || '').replace(/\D/g, ''), 10);
  if (n <= 1) return 'alta';
  if (n === 2) return 'media';
  return '';
}
const critRank = c => { const n = parseInt(String(c || '').replace(/\D/g, ''), 10); return isNaN(n) ? 9 : n; };
function stClass(s) { s = up(s); return s === 'ABERTO' ? 'a' : s === 'FECHADO' ? 'f' : s === 'INDEVIDO' ? '' : 'e'; }
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
async function fetchApi(gh) {
  const url = `https://api.github.com/repos/${gh.owner}/${gh.repo}/contents/sistemas.txt`;
  const headers = { Accept: 'application/vnd.github.raw' };
  if (S.etag) headers['If-None-Match'] = S.etag;
  const res = await fetch(url, { headers, cache: 'no-store' });
  if (res.status === 304) return { same: true, source: 'api' };
  if (!res.ok) {
    const reset = +res.headers.get('X-RateLimit-Reset');
    const e = new Error('API ' + res.status);
    e.retryAt = reset ? reset * 1000 : Date.now() + 10 * 60 * 1000;
    throw e;
  }
  return { text: await res.text(), etag: res.headers.get('ETag') || '', source: 'api' };
}
async function fetchFile() {
  const res = await fetch('sistemas.txt?t=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error('arquivo ' + res.status);
  return { text: await res.text(), source: 'arquivo' };
}
async function getText() {
  const gh = ghRepo();
  if (gh && Date.now() >= S.apiPauseUntil) {
    try { return await fetchApi(gh); }
    catch (e) { S.apiPauseUntil = e.retryAt || Date.now() + 10 * 60 * 1000; }
  }
  return fetchFile();
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
  filter: 'todos', q: '', histDays: HIST_STEP, feedAll: false,
  sheetId: null,
};
if (!Array.isArray(S.log)) S.log = [];

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
    const r = await getText();
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
function toast(msg, toFeed) {
  const t = $('toast');
  t.textContent = msg;
  t.onclick = () => { t.classList.remove('show'); if (toFeed) $('feed').scrollIntoView({ behavior: 'smooth', block: 'center' }); };
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 5000);
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

function renderKpis() {
  const now = Date.now();
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const open = S.rows.filter(isOpen);
  const today = S.rows.filter(r => !isInd(r) && (r._ini >= d0 || isOpen(r) || (r._fim && r._fim >= d0)));
  const ms = unionMs(today.map(r => [r._ini.getTime(), endOf(r, now)]), d0.getTime(), now);
  const startedToday = S.rows.filter(r => !isInd(r) && r._ini >= d0).length;
  $('kpis').innerHTML =
    `<div class="kpi ${open.length ? 'hot' : 'calm'}"><div class="v num">${open.length}</div><div class="l">em andamento</div></div>` +
    `<div class="kpi"><div class="v num">${startedToday}</div><div class="l">abertos hoje</div></div>` +
    `<div class="kpi"><div class="v num" style="font-size:${ms >= 36e5 ? 20 : 26}px;white-space:nowrap">${ms ? fDur(ms) : '0'}</div><div class="l">com falha hoje</div></div>`;
}

function renderOpen() {
  const now = Date.now();
  const open = S.rows.filter(isOpen).sort((a, b) => critRank(a.CRITICIDADE) - critRank(b.CRITICIDADE) || a._ini - b._ini);
  $('ctOpen').textContent = open.length;
  if (!open.length) {
    const last = S.rows.filter(r => !isInd(r) && r._fim).sort((a, b) => b._fim - a._fim)[0];
    $('open').innerHTML = `<div class="calm-card"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/></svg><div><b>Nenhum chamado em andamento</b>` +
      (last ? `<span>Último normalizado: ${esc(last.SISTEMA)} · ${sameDay(last._fim, new Date()) ? 'hoje' : fDM(last._fim)} às ${fHM(last._fim)}</span>` : '<span>Sem chamados no arquivo.</span>') + `</div></div>`;
    return;
  }
  $('open').innerHTML = open.map(r => {
    const t = tipo(r), rk = recentKind(r.ID, now);
    const upd = r._upd ? `atualizado <span data-ago="${r._upd.getTime()}">${fAgo(now - r._upd)}</span>` : '';
    return `<button class="oc" data-id="${esc(r.ID)}" style="--fc:${t.c}">
      <div class="h"><span class="sis">${esc(r.SISTEMA)}</span>
        ${r.CRITICIDADE ? `<span class="tag t-crit ${critClass(r.CRITICIDADE)}">${esc(r.CRITICIDADE)}</span>` : ''}
        ${rk === 'novo' ? '<span class="tag t-novo">NOVO</span>' : rk === 'muda' ? '<span class="tag t-mudou">MUDOU</span>' : ''}
        <span style="flex:1"></span><span class="tf"><i></i>${esc(t.n)}</span></div>
      ${r.EVOLUCAO ? `<div class="evo">● ${esc(r.EVOLUCAO)}</div>` : ''}
      ${r.IMPACTO_OPERACIONAL ? `<div class="imp">${esc(r.IMPACTO_OPERACIONAL)}</div>` : ''}
      <div class="meta">${r.CHAMADO ? `<span>${esc(r.CHAMADO)}</span>` : ''}${r.SEGMENTO ? `<span>${esc(r.SEGMENTO)}</span>` : ''}${r.AREA_ACIONADA ? `<span>${esc(r.AREA_ACIONADA)}</span>` : ''}</div>
      <div class="ft"><div class="timer num"><small>aberto há</small><span data-since="${r._ini.getTime()}">${fDur(now - r._ini)}</span></div>
        <div class="when">início ${sameDay(r._ini, new Date()) ? '' : fDM(r._ini) + ' '}${fHM(r._ini)}<br>${upd}</div></div>
    </button>`;
  }).join('');
}

function feedItem(c, now) {
  const d = new Date(c.at);
  const hr = `<div class="hr num">${fHM(d)}${sameDay(d, new Date(now)) ? '' : `<small>${fDM(d)}</small>`}</div>`;
  let tx;
  if (c.kind === 'novo') tx = `<b>${esc(c.sis)}</b> · novo chamado<div class="tr">${statusTag(c.st)}${c.evo ? ' ' + esc(c.evo) : ''}</div>`;
  else if (c.kind === 'muda') tx = `<b>${esc(c.sis)}</b>${c.inc ? ' · ' + esc(c.inc) : ''}` + c.ch.map(x => {
    if (x.f === 'STATUS') return `<div class="tr">${statusTag(x.de)} → ${statusTag(x.para)}</div>`;
    if (x.f === 'DATA_FIM') { const f = parseDate(x.para); return `<div class="tr">${f ? 'normalizado às ' + fHM(f) + (sameDay(f, new Date(now)) ? '' : ' de ' + fDM(f)) : 'fim retirado'}</div>`; }
    return `<div class="tr">${esc(x.label)}: ${esc(x.de || '—')} → <b>${esc(x.para || '—')}</b></div>`;
  }).join('');
  else if (c.kind === 'dados') tx = `<b>${esc(c.sis)}</b>${c.inc ? ' · ' + esc(c.inc) : ''}<div class="tr">dados do chamado atualizados</div>`;
  else if (c.kind === 'saiu') tx = `<b>${esc(c.sis)}</b>${c.inc ? ' · ' + esc(c.inc) : ''}<div class="tr">saiu do arquivo</div>`;
  else tx = `<b>${c.n} chamados saíram do arquivo</b><div class="tr">IDs ${esc(c.ids.slice(0, 12).join(', '))}${c.ids.length > 12 ? '…' : ''}</div>`;
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

const CHIPS = [['todos', 'Todos'], ['total', 'Total', 'var(--fTotal)'], ['parcial', 'Parcial', 'var(--fParcial)'], ['interm', 'Intermitência', 'var(--fInterm)'], ['lent', 'Lentidão', 'var(--fLent)'], ['ind', 'Indevidos']];
function renderChips() {
  $('chips').innerHTML = CHIPS.map(([k, n, c]) => `<button class="chip" data-f="${k}" aria-pressed="${S.filter === k}"${c ? ` style="--fc:${c}"` : ''}>${c ? '<i></i>' : ''}${n}</button>`).join('');
}
function renderHist() {
  const now = new Date();
  const q = S.q.trim().toLowerCase();
  let list = S.rows.filter(r => !isOpen(r));
  if (S.filter === 'ind') list = list.filter(isInd);
  else if (S.filter !== 'todos') list = list.filter(r => tipo(r).k === S.filter);
  if (q) list = list.filter(r => [r.ID, r.SISTEMA, r.CHAMADO, r.IMPACTO_OPERACIONAL, r.EVOLUCAO, r.AREA_ACIONADA, r.TIPO_FALHA, r.SEGMENTO].join(' ').toLowerCase().includes(q));
  list.sort((a, b) => b._ini - a._ini);
  const groups = [];
  for (const r of list) {
    const k = dayKey(r._ini);
    if (!groups.length || groups[groups.length - 1].k !== k) groups.push({ k, d: r._ini, rows: [] });
    groups[groups.length - 1].rows.push(r);
  }
  if (!groups.length) { $('hist').innerHTML = `<div class="day"><div class="empty">${q || S.filter !== 'todos' ? 'Nada encontrado com esse filtro.' : 'Sem histórico no arquivo.'}</div></div>`; return; }
  const shown = groups.slice(0, S.histDays);
  $('hist').innerHTML = shown.map(g => {
    const valid = g.rows.filter(r => !isInd(r));
    const d0 = new Date(g.d); d0.setHours(0, 0, 0, 0);
    const ms = unionMs(valid.map(r => [r._ini.getTime(), endOf(r, Date.now())]), d0.getTime(), d0.getTime() + 864e5);
    return `<div class="day"><div class="dh"><b>${esc(dayLabel(g.d, now))}</b><span class="num">${g.rows.length} chamado${g.rows.length > 1 ? 's' : ''}${ms ? ' · ' + fDur(ms) : ''}</span></div>` +
      g.rows.map(r => {
        const t = tipo(r), ind = isInd(r);
        const range = r._fim ? (sameDay(r._ini, r._fim) ? `${fHM(r._ini)}–${fHM(r._fim)}` : `${fHM(r._ini)}–${fDM(r._fim)} ${fHM(r._fim)}`) : `${fHM(r._ini)}–sem fim`;
        return `<button class="hi${ind ? ' ind' : ''}" data-id="${esc(r.ID)}" style="--fc:${t.c}"><span class="bar"></span>
          <div style="min-width:0"><div class="s">${esc(r.SISTEMA)}</div><div class="d num">${range} · ${esc(t.n)}${r.CHAMADO ? ' · ' + esc(r.CHAMADO) : ''}</div></div>
          <div class="du num">${r._fim ? fDur(r._fim - r._ini) : '–'}<small>${ind ? 'Indevido' : esc(cap(r.EVOLUCAO || r.STATUS))}</small></div></button>`;
      }).join('') + `</div>`;
  }).join('') + (groups.length > S.histDays ? `<button class="more" id="btMore">Mostrar mais ${Math.min(HIST_STEP, groups.length - S.histDays)} dias</button>` : '');
}

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
  if (S.saveErr) b.push(['bad', '<b>Não foi possível guardar os dados no aparelho.</b> O painel funciona, mas sem internet ele não terá a última cópia e o registro de mudanças pode se perder. Libere espaço do navegador ou saia da aba anônima.']);
  if (S.fileErr) b.push(['bad', `<b>O arquivo recebido tem erro:</b> ${esc(S.fileErr)}. O painel continua com os últimos dados válidos${S.loadedAt ? ' (de ' + fFull(new Date(S.loadedAt)) + ')' : ''}.`]);
  if (S.goneWarn) b.push(['warn', `<b>${S.goneWarn} chamados sumiram do arquivo de uma vez.</b> Confira se o arquivo veio completo.`]);
  if (S.warns.length) b.push(['warn', `${S.warns.length} aviso${S.warns.length > 1 ? 's' : ''} na leitura do arquivo. <a href="#dados" style="color:inherit;font-weight:700" id="lnDados">Ver detalhes</a>`]);
  $('banners').innerHTML = b.map(([c, h]) => `<div class="banner ${c}">${h}</div>`).join('');
  const ln = $('lnDados'); if (ln) ln.onclick = e => { e.preventDefault(); $('dados').open = true; $('dados').scrollIntoView({ behavior: 'smooth' }); };
}
function renderDados() {
  const maxId = S.rows.reduce((m, r) => Math.max(m, +r.ID || 0), 0);
  const lastUpd = S.rows.reduce((m, r) => (r._upd && (!m || r._upd > m) ? r._upd : m), null);
  const src = S.source === 'api' ? 'Direto do repositório (GitHub, sem cache)' : S.source === 'arquivo' ? 'Arquivo do site (sistemas.txt)' : '—';
  $('dadosBody').innerHTML = `<dl class="kv">
    <dt>Fonte</dt><dd>${src}</dd>
    <dt>Arquivo recebido</dt><dd>${S.loadedAt ? fFull(new Date(S.loadedAt)) : '—'}</dd>
    <dt>Última atualização no arquivo</dt><dd>${fFull(lastUpd)}</dd>
    <dt>Chamados</dt><dd class="num">${S.rows.length} (maior ID ${maxId || '—'})</dd>
    <dt>Colunas</dt><dd>${esc(S.cols.join(', '))}</dd>
    <dt>Mudanças registradas</dt><dd class="num">${S.log.length}</dd>
    <dt>Cópia no aparelho</dt><dd>${S.saveErr ? '<b style="color:var(--bad)">falhou</b>' : 'ok'}</dd>
  </dl>` + (S.warns.length ? `<ul class="warnlist">${S.warns.slice(0, 50).map(w => `<li>${esc(w)}</li>`).join('')}${S.warns.length > 50 ? `<li>… e mais ${S.warns.length - 50}</li>` : ''}</ul>` : '');
}

function render() {
  renderSync(); renderBanners(); renderKpis(); renderOpen(); renderFeed(); renderChips(); renderHist(); renderDados();
  if (S.sheetId) openSheet(S.sheetId, true);
}

function tick() {
  const now = Date.now();
  document.querySelectorAll('[data-since]').forEach(el => { el.textContent = fDur(now - +el.dataset.since); });
  document.querySelectorAll('[data-ago]').forEach(el => { el.textContent = fAgo(now - +el.dataset.ago); });
  renderSync();
  if (S.rows.length) renderKpis();
}

/* ---------- detalhe ---------- */
function openSheet(id, refresh) {
  const r = S.rows.find(x => x.ID === id);
  if (!r) { if (refresh) closeSheet(); return; }
  const now = Date.now(), t = tipo(r), open = isOpen(r);
  const yn = v => (v === '1' ? 'Sim' : v === '0' ? 'Não' : esc(v || '—'));
  const row = (k, v) => v ? `<dt>${k}</dt><dd>${v}</dd>` : '';
  const extra = S.cols.filter(c => !KNOWN.includes(c));
  const hist = S.log.filter(c => c.id === id);
  $('sheet').innerHTML = `<div class="grab"></div><button class="x" id="shX" aria-label="Fechar">✕</button>
    <h3 id="shTitle">${esc(r.SISTEMA)} ${r.CRITICIDADE ? `<span class="tag t-crit ${critClass(r.CRITICIDADE)}">${esc(r.CRITICIDADE)}</span>` : ''} ${statusTag(r.STATUS)}</h3>
    <div class="sub">${esc(r.CHAMADO || 'Sem chamado')} · ID ${esc(r.ID)}</div>
    <div class="big">
      <div><small>Início</small><b class="num">${fFull(r._ini)}</b></div>
      <div><small>Fim</small><b class="num">${r._fim ? fFull(r._fim) : (open ? 'em andamento' : '—')}</b></div>
      <div><small>Duração</small><b class="num" ${open && !r._fim ? `data-since="${r._ini.getTime()}"` : ''}>${fDur(endOf(r, now) - r._ini)}</b></div>
      <div><small>Tipo de falha</small><b><span class="tf" style="--fc:${t.c};font-size:15px;color:var(--ink)"><i></i>${esc(t.n)}</span></b></div>
    </div>
    <dl class="kv">
      ${row('Evolução', esc(r.EVOLUCAO))}
      ${row('Impacto', esc(r.IMPACTO_OPERACIONAL))}
      ${row('Segmento', esc(r.SEGMENTO))}
      ${row('Área acionada', esc(r.AREA_ACIONADA))}
      ${row('Grupos responsáveis', esc(r.GRUPOS_RESPONSAVEIS))}
      ${row('Grupos impactados', esc(r.GRUPOS_IMPACTADOS))}
      ${'ALERTA_ENVIADO' in r ? row('Alerta enviado', yn(r.ALERTA_ENVIADO)) : ''}
      ${row('Atualizado em', r._upd ? fFull(r._upd) : '')}
      ${row('Dado atualizado', parseDate(r.DADO_ATUALIZADO) ? fFull(parseDate(r.DADO_ATUALIZADO)) : esc(r.DADO_ATUALIZADO))}
      ${row('Tempo decorrido (arquivo)', esc(r.TEMPO_DECORRIDO))}
    </dl>
    ${extra.length ? `<h4>Outras colunas</h4><dl class="kv">${extra.map(c => row(esc(c), esc(r[c]) || '—')).join('')}</dl>` : ''}
    <h4>Mudanças registradas</h4>
    ${hist.length ? `<div class="feed">${hist.map(c => feedItem(c, now).replace(/data-id="[^"]*"/, 'disabled')).join('')}</div>` : '<div class="empty" style="padding:0">Nenhuma mudança registrada neste aparelho.</div>'}`;
  $('shX').onclick = () => history.back();
  if (!refresh) {
    S.sheetId = id;
    $('sheetBg').style.display = 'block';
    requestAnimationFrame(() => $('sheet').classList.add('show'));
    history.pushState({ sheet: id }, '');
  }
}
function closeSheet() {
  S.sheetId = null;
  $('sheet').classList.remove('show');
  $('sheetBg').style.display = 'none';
}

/* ---------- avisos no aparelho ---------- */
function renderBell() {
  const on = load(K.bell, false) && 'Notification' in window && Notification.permission === 'granted';
  $('btBell').classList.toggle('on', !!on);
  $('btBell').setAttribute('aria-pressed', on ? 'true' : 'false');
}
async function toggleBell() {
  if (!('Notification' in window)) { toast('Este aparelho não permite avisos pelo navegador. As mudanças continuam aparecendo no painel.'); return; }
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

  document.addEventListener('click', e => {
    const it = e.target.closest('[data-id]');
    if (it && !it.disabled && (it.closest('#open') || it.closest('#feed') || it.closest('#hist'))) { openSheet(it.dataset.id); return; }
    const ch = e.target.closest('.chip');
    if (ch) { S.filter = ch.dataset.f; S.histDays = HIST_STEP; renderChips(); renderHist(); return; }
    if (e.target.id === 'btMore') { S.histDays += HIST_STEP; renderHist(); }
  });
  $('btFeed').onclick = () => { S.feedAll = !S.feedAll; renderFeed(); };
  $('btRefresh').onclick = () => poll(true);
  $('btBell').onclick = toggleBell;
  let qT; $('q').addEventListener('input', e => { clearTimeout(qT); qT = setTimeout(() => { S.q = e.target.value; S.histDays = HIST_STEP; renderHist(); }, 150); });
  $('sheetBg').onclick = () => history.back();
  window.addEventListener('popstate', () => { if (S.sheetId) closeSheet(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.sheetId) history.back(); });

  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - S.checkedAt > 15000) poll(); });
  window.addEventListener('online', () => poll());
  setInterval(() => { if (!document.hidden || load(K.bell, false)) poll(); }, POLL_MS);
  setInterval(tick, TICK_MS);
  poll();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
init();
