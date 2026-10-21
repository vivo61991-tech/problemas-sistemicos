/* Problemas Sistêmicos — Painel (dia / semana / mês)
   Mesma estrutura do painel do app de NS: Dia/Semana/Mês (botão ou arrastar), filtro do dia da semana,
   seleção de coluna, cards, gráficos, matriz sistemas × períodos e tabela.
   Os períodos são montados aqui a partir das datas de cada chamado (o sistemas.txt tem uma linha por ID). */
(function () {
  'use strict';
  const VERSAO = '1.2.1';
  const HORA_INI = 8, HORA_FIM = 20, EXP = (HORA_FIM - HORA_INI) * 3600e3;   // expediente 08:00–20:00
  const LIMITE = 7;                                                         // 7 dias, 7 semanas, 7 meses
  const WD = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
  const WD_PLURAL = ['domingos', 'segundas', 'terças', 'quartas', 'quintas', 'sextas', 'sábados'];
  const WD_ULTIMO = ['Último domingo', 'Última segunda', 'Última terça', 'Última quarta', 'Última quinta', 'Última sexta', 'Último sábado'];
  const WD_ANT = ['o domingo anterior', 'a segunda anterior', 'a terça anterior', 'a quarta anterior', 'a quinta anterior', 'a sexta anterior', 'o sábado anterior'];
  const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const MES_EXT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const NOME = { DIA: 'Dia', SEMANA: 'Semana', MES: 'Mês' };
  const ORDEM_MODOS = ['DIA', 'SEMANA', 'MES'];
  const TIPOS = [['total', 'Indisp. total', 'var(--fTotal)'], ['parcial', 'Indisp. parcial', 'var(--fParcial)'], ['interm', 'Intermitência', 'var(--fInterm)'], ['lent', 'Lentidão', 'var(--fLent)'], ['outro', 'Outro', 'var(--fOutro)']];

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const dia0 = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addD = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const ddmm = d => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  const ymd = d => d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
  const fmtH = ms => { const m = Math.round(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${pad(m % 60)}`; };
  const fmtHc = ms => { const m = Math.round(ms / 60000); return m === 0 ? '' : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? pad(m % 60) : ''}`; };
  const pctNum = (ms, p) => ms / (p.dias * EXP) * 100;
  const pctTxt = v => v > 0 && v < 0.05 ? '<0,1%' : v.toFixed(1).replace('.', ',') + '%';
  const tipoK = t => /TOTAL/.test(t) ? 'total' : /PARCIAL/.test(t) ? 'parcial' : /INTERMIT/.test(t) ? 'interm' : /LENTID/.test(t) ? 'lent' : 'outro';
  const COR = t => TIPOS.find(x => x[0] === tipoK(t))[2];

  // ---------------- estado (só enquanto o app está aberto) ----------------
  let modo = 'DIA', filtroDia = null, sel = null, mxAberto = true, celSel = null;
  let ctx = null;   // { itens, inicio, now, abrirLista(titulo, sub, ids), root, rerender }

  // ---------------- períodos montados a partir das datas ----------------
  function periodos(m, now) {
    const t0 = dia0(new Date(now)), out = [];
    if (m === 'DIA') {
      if (filtroDia == null) for (let i = LIMITE - 1; i >= 0; i--) out.push({ ini: addD(t0, -i), dias: 1 });
      else { let d = t0; while (d.getDay() !== filtroDia) d = addD(d, -1); for (let i = 0; i < LIMITE; i++) { out.unshift({ ini: d, dias: 1 }); d = addD(d, -7); } }
    } else if (m === 'SEMANA') {
      const seg = addD(t0, -((t0.getDay() + 6) % 7));    // semana de segunda a domingo
      for (let i = LIMITE - 1; i >= 0; i--) out.push({ ini: addD(seg, -7 * i), dias: 7 });
    } else {
      for (let i = LIMITE - 1; i >= 0; i--) { const ini = new Date(t0.getFullYear(), t0.getMonth() - i, 1); out.push({ ini, dias: new Date(ini.getFullYear(), ini.getMonth() + 1, 0).getDate() }); }
    }
    const cod = { DIA: '3', SEMANA: '2', MES: '1' }[m];
    const ini0 = ctx.inicio ? dia0(ctx.inicio) : null;
    return out.map(p => {
      p.tipo = m; p.fim = addD(p.ini, p.dias); p.ordem = cod + ymd(p.ini);
      p.andamento = p.fim > now;                                       // período ainda não terminou
      p.semDados = !ini0 || p.fim <= ini0;                             // antes do 1º chamado do arquivo
      return p;
    });
  }
  // trechos de um chamado dentro do expediente (08–20) de um período: [{x0, x1} em fração da coluna, ms]
  function trechos(c, p) {
    const out = [];
    for (let i = 0; i < p.dias; i++) {
      const d = addD(p.ini, i);
      const a = new Date(d.getFullYear(), d.getMonth(), d.getDate(), HORA_INI), b = new Date(d.getFullYear(), d.getMonth(), d.getDate(), HORA_FIM);
      const s = Math.max(c.ini, a), e = Math.min(c.fimCalc, b);
      if (e > s) out.push({ x0: (i + (s - a) / EXP) / p.dias, x1: (i + (e - a) / EXP) / p.dias, ms: e - s });
    }
    return out;
  }
  const noPeriodo = (c, p) => c.ini < p.fim && c.fimCalc >= p.ini;
  const uniao = tr => { const v = [...tr].sort((a, b) => a.x0 - b.x0), out = []; for (const t of v) { const u = out[out.length - 1]; if (u && t.x0 <= u.x1) u.x1 = Math.max(u.x1, t.x1); else out.push({ x0: t.x0, x1: t.x1 }); } return out; };
  const uniaoMs = (itens, p) => uniao(itens.filter(c => !c.indevido).flatMap(c => trechos(c, p))).reduce((a, t) => a + (t.x1 - t.x0), 0) * p.dias * EXP;

  function estat(p) {
    const its = ctx.itens.filter(c => noPeriodo(c, p));
    const val = its.filter(c => !c.indevido);
    const ms = p.semDados ? 0 : uniaoMs(its, p);
    const porTipo = {}; TIPOS.forEach(([k]) => { porTipo[k] = 0; });
    val.forEach(c => { porTipo[tipoK(c.tipo)]++; });
    const sis = new Map();
    val.forEach(c => { const t = trechos(c, p).reduce((a, x) => a + x.ms, 0); sis.set(c.sistema, (sis.get(c.sistema) || 0) + t); });
    const top = [...sis.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))[0];
    return { n: val.length, ind: its.length - val.length, ms, pct: pctNum(ms, p), porTipo, nSis: sis.size, top: top ? top[0] : '' };
  }

  // ---------------- rótulos ----------------
  const rot = p => p.tipo === 'DIA' ? ddmm(p.ini) : p.tipo === 'SEMANA' ? `${ddmm(p.ini)} a ${ddmm(addD(p.fim, -1))}` : `${MES_EXT[p.ini.getMonth()]}/${String(p.ini.getFullYear()).slice(2)}`;
  const rotLongo = p => `${p.tipo === 'DIA' ? WD[p.ini.getDay()].toLowerCase() + ', ' : p.tipo === 'SEMANA' ? 'semana ' : ''}${rot(p)}${p.andamento ? ' (em andamento)' : ''}`;
  const rotTab = p => p.tipo === 'DIA' ? `${WD[p.ini.getDay()].charAt(0) + WD[p.ini.getDay()].slice(1).toLowerCase()} ${ddmm(p.ini)}` : p.tipo === 'SEMANA' ? `${ddmm(p.ini)}–${ddmm(addD(p.fim, -1))}` : `${MES[p.ini.getMonth()]}/${String(p.ini.getFullYear()).slice(2)}`;
  const tituloPer = (t, s) => t === 'DIA' ? (s ? 'Dia selecionado' : 'Hoje') : t === 'SEMANA' ? (s ? 'Semana selecionada' : 'Semana atual') : (s ? 'Mês selecionado' : 'Mês atual');
  const nomeAnt = (t, p) => t === 'DIA' ? (filtroDia != null ? WD_ANT[filtroDia] : ddmm(p.ini)) : t === 'SEMANA' ? 'semana ' + ddmm(p.ini) : MES[p.ini.getMonth()].toLowerCase();
  const seta = v => v === 0 ? '' : v > 0 ? '▲ ' : '▼ ';
  // aqui mais é pior: subir = rosa, cair = verde (melhorou)
  const dlt = (v, suf) => `<span class="dlt ${v === 0 ? 'neu' : v > 0 ? 'down' : 'up'}">${seta(v)}${Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}${suf}</span>`;
  // comparação só com os dois períodos fechados (período em andamento ainda vai crescer)
  const comparavel = (p, a) => a && !p.andamento && !a.andamento && !p.semDados && !a.semDados;

  // ---------------- desenho ----------------
  function render(c) {
    ctx = c;
    const now = c.now;
    const ps = periodos(modo, now);
    if (sel && !ps.some(p => p.ordem === sel)) sel = null;
    const st = ps.map(estat);
    const iSel = sel ? ps.findIndex(p => p.ordem === sel) : -1;
    const i = iSel >= 0 ? iSel : ps.length - 1, p = ps[i], s = st[i];
    // anterior: o período antes desse (no filtro de dia da semana, o mesmo dia da semana anterior)
    const pa = i > 0 ? ps[i - 1] : null, sa = i > 0 ? st[i - 1] : null;
    const kc = iSel >= 0 ? 'kpi ksel' : 'kpi';
    const cmp = comparavel(p, pa);
    const vs = pa ? ` vs ${esc(nomeAnt(modo, pa))}` : '';
    const sN = p.semDados ? 'sem dados de sistemas' : !pa ? 'sem período anterior' : !cmp ? '<span class="parc">em andamento</span>' : `${dlt(s.n - sa.n, '')}${vs}`;
    const sT = p.semDados ? '' : !pa || !cmp ? `${pctTxt(s.pct)} do expediente` : `${dlt(Math.round((s.pct - sa.pct) * 10) / 10, ' p.p.')}${vs}`;
    const kN = p.semDados ? '—' : s.n ? s.n : '<span class="okv">0</span>';
    const k = `
      <div class="${kc}"><div class="l">Chamados</div><div class="v">${kN}</div><div class="s">${sN}</div></div>
      <div class="${kc}"><div class="l">Tempo com falha</div><div class="v">${p.semDados ? '—' : s.ms ? fmtH(s.ms) : '<span class="okv">0</span>'}</div><div class="s">${sT}</div></div>
      <div class="${kc}"><div class="l">Sistemas afetados</div><div class="v">${p.semDados ? '—' : s.nSis || '<span class="okv">0</span>'}</div><div class="s">${s.top ? 'mais tempo: ' + esc(s.top) : p.semDados ? '' : '<span class="okt">sem ocorrência</span>'}</div></div>
      <div class="${kc} kper"><div class="l">${modo === 'DIA' && filtroDia != null && iSel < 0 ? WD_ULTIMO[filtroDia] : tituloPer(modo, iSel >= 0)}</div><div class="v">${esc(rot(p))}</div><div class="s">${modo === 'DIA' ? DIAS_SEMANA[p.ini.getDay()] + (p.andamento ? ' · <b class="dias">em andamento</b>' : '') : p.andamento ? `<b class="dias">em andamento</b> · ${Math.round((now - p.ini) / 864e5 + 0.5)} de ${p.dias} dias` : `completo · ${p.dias} dias`}</div></div>`;
    const filtro = modo !== 'DIA' ? '<div style="height:12px"></div>' : `
      <div class="wdf" role="group" aria-label="Comparar o mesmo dia da semana">
        ${[0, 1, 2, 3, 4, 5, 6].map(w => `<button data-wd="${w}" class="${w === 0 ? 'dom' : ''}${filtroDia === w ? ' on' : ''}" aria-pressed="${filtroDia === w}">${WD[w]}</button>`).join('')}
        ${filtroDia != null ? '<button class="wdx" id="bWdx" aria-label="Remover filtro e voltar aos dias corridos">✕</button>' : ''}
      </div>`;
    const fd = modo === 'DIA' ? filtroDia : null;
    const porX = modo === 'DIA' ? (fd != null ? ' · ' + WD_PLURAL[fd] : ' por dia') : modo === 'SEMANA' ? ' por semana' : ' por mês';
    const capSel = iSel >= 0 ? `${esc(rotLongo(p))} — ${p.semDados ? 'sem dados de sistemas' : s.n ? `${s.n} chamado${s.n > 1 ? 's' : ''} · ${fmtH(s.ms)} (${pctTxt(s.pct)}) no expediente` : 'nenhum chamado'}` : '';
    const dica = 'Toque numa coluna para selecionar · toque de novo para limpar.';
    c.root.innerHTML = `
      <div class="card topbar">
        <div class="seg" role="tablist" aria-label="Período">${ORDEM_MODOS.map(t => `<button role="tab" data-m="${t}" class="${modo === t ? 'on' : ''}">${NOME[t]}</button>`).join('')}</div>
        <div class="meta-line"><span>Expediente 08h–20h</span><span>${c.inicio ? 'dados desde ' + ddmm(c.inicio) + '/' + String(c.inicio.getFullYear()).slice(2) : 'sem dados'}</span></div>
        ${iSel >= 0 ? `<button class="selchip" id="bLimpar" aria-label="Limpar seleção"><span class="t">Selecionado: <b>${esc(rot(p))}</b> · toque para limpar</span><span aria-hidden="true">✕</span></button>` : ''}
      </div>
      <div id="pag">
        <div class="kpis kpis2">${k}</div>
        ${filtro}
        <div class="card chart"><h2>Chamados${porX}</h2>${chartN(ps, st)}
          <div class="legend">${TIPOS.filter(([k]) => st.some(x => x.porTipo[k])).map(([, n, cor]) => `<span><i style="background:${cor}"></i>${n}</span>`).join('') || '<span>Sem chamados no período</span>'}</div>
          <div class="cap${iSel >= 0 ? ' capsel' : ''}">${iSel >= 0 ? capSel : (fd != null ? `Só ${WD_PLURAL[fd]} · ${LIMITE} mais recentes. ` : '') + dica}</div></div>
        <div class="card chart"><h2>Tempo com falha no expediente${porX}</h2>${chartT(ps, st)}
          <div class="legend"><span><i style="background:var(--tot)"></i>tempo com algum sistema com problema (sobreposição conta uma vez)</span>${ps.some(x => x.andamento) ? '<span><i class="hach"></i>período em andamento</span>' : ''}${ps.some(x => x.semDados) ? '<span><i class="sd"></i>sem dados</span>' : ''}</div>
          <div class="cap${iSel >= 0 ? ' capsel' : ''}">${iSel >= 0 ? capSel : '% = tempo com falha ÷ expediente do período inteiro (dia 12h; semana 7 × 12h; mês dias × 12h).'}</div></div>
        ${matriz(ps, iSel >= 0 ? sel : null)}
        ${tabela(ps, st)}
      </div>`;
    ligar(ps);
  }

  // eixo x: dia (número + dia da semana, domingo em vermelho), semana (dd/mm + mês), mês (Mmm + ano)
  function xRot(p, cx, y, on) {
    const d = p.ini, dom = p.tipo === 'DIA' && d.getDay() === 0;
    const a = p.tipo === 'DIA' ? (filtroDia != null ? ddmm(d) : pad(d.getDate())) : p.tipo === 'SEMANA' ? ddmm(d) : MES[d.getMonth()];
    const b = p.tipo === 'DIA' ? (filtroDia != null ? String(d.getFullYear()) : WD[d.getDay()]) : p.tipo === 'SEMANA' ? MES[d.getMonth()].toLowerCase() : String(d.getFullYear());
    const cor = on ? 'var(--selink)' : dom ? 'var(--domc)' : 'var(--ink2)';
    return `<text x="${cx}" y="${y}" text-anchor="middle" style="fill:${cor};font-size:11px;font-weight:${on ? 800 : 650}">${a}${p.andamento ? '*' : ''}</text><text x="${cx}" y="${y + 13}" text-anchor="middle" style="fill:${dom ? 'var(--domc)' : 'var(--ink3)'};font-size:9.5px">${b}</text>`;
  }
  const W = 360, H = 200, T = 22, B = 34, L = 6, R = 6;
  function quadro(ps, barras) {
    const n = ps.length, bw = (W - L - R) / n;
    const band = ps.map((p, i) => sel === p.ordem ? `<rect x="${L + i * bw + 1}" y="2" width="${bw - 2}" height="${H - 4}" rx="8" style="fill:var(--selbg);stroke:var(--selln)"/>` : '').join('');
    const base = `<line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" style="stroke:var(--line);stroke-width:1"/>`;
    const xs = ps.map((p, i) => xRot(p, L + i * bw + bw / 2, H - B + 15, sel === p.ordem)).join('');
    const hit = ps.map((p, i) => `<rect class="hit" data-ordem="${p.ordem}" x="${L + i * bw}" y="0" width="${bw}" height="${H}" style="fill:transparent"><title>${esc(rotLongo(p))}</title></rect>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" role="img">${band}${base}${barras(bw)}${xs}${hit}</svg>`;
  }
  const halo = 'paint-order:stroke;stroke:var(--card);stroke-width:3px;stroke-linejoin:round';
  const sdRect = (x, bw) => `<rect x="${x + bw * 0.2}" y="${T}" width="${bw * 0.6}" height="${H - B - T}" rx="5" style="fill:url(#sdpat)"/>`;
  const defs = `<defs><pattern id="sdpat" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(135)"><rect width="8" height="8" style="fill:var(--sdA)"/><rect width="4" height="8" style="fill:var(--sdB)"/></pattern>
    <pattern id="hachpat" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" style="fill:var(--tot);opacity:.55"/><rect width="3" height="6" style="fill:var(--tot)"/></pattern></defs>`;
  function chartN(ps, st) {
    const max = Math.max(1, ...st.map(s => s.n));
    const top = max <= 4 ? max + 1 : Math.ceil(max * 1.15);
    const hh = H - B - T;
    return quadro(ps, bw => defs + ps.map((p, i) => {
      const x = L + i * bw, cx = x + bw / 2, s = st[i], w = Math.min(34, bw * 0.56);
      if (p.semDados) return sdRect(x, bw);
      let y = H - B, out = '';
      for (const [k, , cor] of TIPOS) {
        const v = s.porTipo[k]; if (!v) continue;
        const h = v / top * hh; y -= h;
        out += `<rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" style="fill:${cor}"/>`;
      }
      out += s.n ? `<text x="${cx}" y="${y - 6}" text-anchor="middle" style="fill:var(--ink);font-size:12px;font-weight:800;${halo}">${s.n}</text>`
        : `<text x="${cx}" y="${H - B - 8}" text-anchor="middle" style="fill:var(--ok);font-size:12px;font-weight:800">✓</text>`;
      return out;
    }).join(''));
  }
  function chartT(ps, st) {
    const max = Math.max(...st.map(s => s.pct), 0.0001);
    const top = max * 1.25;
    const hh = H - B - T;
    return quadro(ps, bw => defs + ps.map((p, i) => {
      const x = L + i * bw, cx = x + bw / 2, s = st[i], w = Math.min(34, bw * 0.56);
      if (p.semDados) return sdRect(x, bw);
      if (!s.ms) return `<text x="${cx}" y="${H - B - 8}" text-anchor="middle" style="fill:var(--ok);font-size:12px;font-weight:800">✓</text>`;
      const h = Math.max(2, s.pct / top * hh), y = H - B - h;
      return `<rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="4" style="fill:${p.andamento ? 'url(#hachpat)' : 'var(--tot)'}"/>` +
        `<text x="${cx}" y="${y - 17}" text-anchor="middle" style="fill:var(--ink);font-size:11px;font-weight:800;${halo}">${fmtHc(s.ms)}</text>` +
        `<text x="${cx}" y="${y - 5}" text-anchor="middle" style="fill:var(--ink2);font-size:9.5px;font-weight:600;${halo}">${pctTxt(s.pct)}</text>`;
    }).join(''));
  }

  // ---------------- matriz sistemas × períodos (mesma do app de NS) ----------------
  function matriz(ps, selOrdem) {
    const validos = ctx.itens;
    if (celSel && !ps.some(p => p.ordem === celSel.ordem)) celSel = null;
    const mapa = new Map();
    for (const c of validos) {
      ps.forEach((p, ci) => {
        if (p.semDados) return;
        const tr = trechos(c, p), fora = !tr.length && noPeriodo(c, p);
        if (!tr.length && !fora) return;
        if (!mapa.has(c.sistema)) mapa.set(c.sistema, { nome: c.sistema, cols: ps.map(() => []), ms: 0, n: new Set() });
        const s = mapa.get(c.sistema);
        s.cols[ci].push({ c, tr, fora });
        if (!c.indevido) { s.ms += tr.reduce((a, t) => a + t.ms, 0); s.n.add(c.id); }
      });
    }
    const sis = [...mapa.values()].sort((a, b) => b.ms - a.ms || a.nome.localeCompare(b.nome, 'pt-BR'));
    const titulo = modo === 'DIA' ? (filtroDia != null ? `Sistemas · ${WD_PLURAL[filtroDia]}` : 'Sistemas por dia') : modo === 'SEMANA' ? 'Sistemas por semana' : 'Sistemas por mês';
    const totCols = ps.map(p => p.semDados ? [] : uniao(validos.filter(c => !c.indevido).flatMap(c => trechos(c, p))));
    const totMs = totCols.reduce((a, u, ci) => a + u.reduce((x, t) => x + (t.x1 - t.x0) * ps[ci].dias * EXP, 0), 0);
    const temNaCol = ci => !ps[ci].semDados && validos.some(c => noPeriodo(c, ps[ci]));
    const cab = ps.map(p => {
      const d = p.ini, dom = modo === 'DIA' && d.getDay() === 0, mesMin = MES[d.getMonth()].toLowerCase();
      const t = modo === 'MES' ? MES[d.getMonth()] : pad(d.getDate());
      const s = modo === 'DIA' ? (filtroDia != null ? mesMin : WD[d.getDay()]) : modo === 'SEMANA' ? mesMin : String(d.getFullYear());
      return `<button class="hd${dom ? ' dom' : ''}${selOrdem === p.ordem ? ' sel' : ''}${p.andamento ? ' and' : ''}${p.semDados ? ' sd' : ''}" data-ordem="${p.ordem}" aria-label="Selecionar ${esc(rot(p))}" aria-pressed="${selOrdem === p.ordem}">${t}${p.andamento ? '*' : ''}<small>${s}</small></button>`;
    }).join('');
    const divisoes = () => modo === 'DIA' ? `<span class="dv" style="left:50%"></span>` : modo === 'SEMANA' ? [1, 2, 3, 4, 5, 6].map(i => `<span class="dv" style="left:${(i / 7 * 100).toFixed(2)}%"></span>`).join('') : '';
    const clsCel = (p, tem, marcada) => `cel${p.semDados ? ' sd' : tem ? ' tem' : ''}${marcada ? ' sel' : selOrdem === p.ordem ? ' colsel' : ''}`;
    const linhas = sis.map(s => `<div class="sys${celSel && celSel.sis === s.nome ? ' sel' : ''}" title="${esc(s.nome)}">${esc(s.nome)}</div>` + s.cols.map((cs, ci) => {
      const p = ps[ci], marcada = celSel && celSel.ordem === p.ordem && celSel.sis === s.nome;
      const bars = cs.flatMap(({ c, tr, fora }) => fora
        ? [`<span class="fora" style="left:${c.ini.getHours() < HORA_INI ? 0 : 'calc(100% - 6px)'}"></span>`]
        : tr.map(t => `<span class="bar${c.indevido ? ' indev' : ''}${c.aberto ? ' viva' : ''}" style="left:${(t.x0 * 100).toFixed(2)}%;width:${((t.x1 - t.x0) * 100).toFixed(2)}%;background:${COR(c.tipo)}"></span>`)).join('');
      return `<button class="${clsCel(p, cs.length, marcada)}" data-ordem="${p.ordem}" data-sis="${esc(s.nome)}" aria-label="${esc(s.nome)} · ${esc(rot(p))}${p.semDados ? ' · sem dados' : ''}">${p.semDados ? '' : divisoes()}${bars}</button>`;
    }).join('') + `<div class="tot">${fmtHc(s.ms) || (s.n.size ? '0' : '')}</div>`).join('');
    const linhaTot = `<div class="sys totl">Total</div>` + totCols.map((u, ci) => {
      const p = ps[ci], marcada = celSel && celSel.ordem === p.ordem && celSel.sis == null;
      return `<button class="${clsCel(p, temNaCol(ci), marcada)} tcel" data-ordem="${p.ordem}" data-tot="1" aria-label="Todos os sistemas · ${esc(rot(p))}${p.semDados ? ' · sem dados' : ''}">${p.semDados ? '' : divisoes()}${u.map(t => `<span class="bar tot" style="left:${(t.x0 * 100).toFixed(2)}%;width:${((t.x1 - t.x0) * 100).toFixed(2)}%"></span>`).join('')}</button>`;
    }).join('') + `<div class="tot tt">${fmtHc(totMs) || ''}</div>`;
    const temSd = ps.some(p => p.semDados);
    const sub = modo === 'DIA' ? 'Cada coluna = expediente das 08h às 20h (linha no meio = 14h).' : modo === 'SEMANA' ? 'Cada coluna = 7 dias (seg a dom), cada dia das 08h às 20h.' : 'Cada coluna = os dias do mês, cada dia das 08h às 20h.';
    const lab = mxAberto ? (window.innerWidth < 380 ? 92 : 112) + 'px' : 'max-content';
    return `<div class="card mxcard ${mxAberto ? 'mx-on' : 'mx-off'}" id="cardSis">
      <button class="mxhead" id="bMx" aria-expanded="${mxAberto}" aria-label="${mxAberto ? 'Fechar' : 'Abrir'} a matriz de sistemas"><h2>${titulo}</h2><span class="seta" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="${mxAberto ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'}"/></svg></span></button>
      ${mxAberto ? `<div class="mxsub">${sub} Horas = no expediente; no Total, tempo com algum sistema com problema.</div>` : ''}
      <div class="mx" style="--n:${ps.length};--lab:${lab}"><div class="corner">${mxAberto ? 'Sistema' : ''}</div>${cab}<div class="tot hd2">Horas</div>${mxAberto ? linhas + (sis.length ? '<div class="sep"></div>' : '') : ''}${linhaTot}</div>
      ${mxAberto && !sis.length ? `<div class="vazio">Nenhum sistema com chamado nesse período.</div>` : ''}
      <div class="legend">
        ${mxAberto ? TIPOS.slice(0, 4).map(([, n, cor]) => `<span><i style="background:${cor}"></i>${n}</span>`).join('') + '<span><i class="fora"></i>fora do expediente</span><span><i class="indev"></i>indevido</span>' : ''}
        <span><i style="background:var(--tot)"></i>Total: todos os sistemas juntos</span>
        ${temSd ? '<span><i class="sd"></i>sem dados de sistemas</span>' : ''}
      </div>
      <div class="cap">${mxAberto ? 'Toque numa célula com chamado para ver a lista · toque no cabeçalho da coluna para selecionar o período.' : ''}</div>
    </div>`;
  }

  function tabela(ps, st) {
    const fd = modo === 'DIA' ? filtroDia : null;
    const nome = modo === 'DIA' ? (fd != null ? WD_PLURAL[fd].charAt(0).toUpperCase() + WD_PLURAL[fd].slice(1) : 'Dias') : modo === 'SEMANA' ? 'Semanas' : 'Meses';
    const linhas = ps.map((p, i) => ({ p, s: st[i], a: i > 0 ? ps[i - 1] : null, sa: i > 0 ? st[i - 1] : null })).reverse().map(({ p, s, a, sa }) => {
      const cmp = comparavel(p, a);
      const vN = cmp ? `<td class="tv">${dlt(s.n - sa.n, '')}</td>` : '<td class="tv nd">—</td>';
      const vT = cmp ? `<td class="tv">${dlt(Math.round((s.pct - sa.pct) * 10) / 10, '')}</td>` : '<td class="tv nd">—</td>';
      const nCel = p.semDados ? '<td class="nd">—</td>' : s.n ? `<td>${s.n}</td>` : '<td><span class="pill okp">0</span></td>';
      return `<tr data-ordem="${p.ordem}" class="${p.ordem === sel ? 'sel' : ''}" aria-selected="${p.ordem === sel}"><td>${esc(rotTab(p))}${p.andamento ? '*' : ''}</td>${nCel}${vN}<td>${p.semDados ? '—' : s.ms ? fmtH(s.ms) : '0'}</td><td>${p.semDados ? '—' : pctTxt(s.pct)}</td>${vT}</tr>`;
    }).join('');
    return `<div class="card"><h2>${nome}</h2><div style="overflow-x:auto"><table class="conf tsel">
      <thead><tr><th>${modo === 'DIA' ? 'DIA' : modo === 'SEMANA' ? 'SEMANA' : 'MÊS'}</th><th>CHAM.</th><th>VAR.</th><th>TEMPO</th><th>% EXP.</th><th>VAR.</th></tr></thead><tbody>${linhas}</tbody></table></div>
      <div class="small muted" style="margin-top:6px">CHAM. = chamados no período (sem indevidos) · TEMPO = tempo com falha no expediente · % EXP. = tempo ÷ expediente do período · VAR. = variação contra ${modo === 'DIA' ? (fd != null ? WD_ANT[fd] : 'o dia anterior') : modo === 'SEMANA' ? 'a semana anterior' : 'o mês anterior'} (p.p. no %), só com os dois períodos fechados. * = em andamento.</div></div>`;
  }

  // ---------------- toques ----------------
  function redesenhar() { const y = window.scrollY; ctx.rerender(); window.scrollTo(0, y); }
  function toggleSel(o) { sel = sel === o ? null : o; redesenhar(); }
  function setFiltroDia(w) { filtroDia = w; sel = null; redesenhar(); }
  const semAnim = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function setModo(m, dir) {
    if (dir == null) dir = Math.sign(ORDEM_MODOS.indexOf(m) - ORDEM_MODOS.indexOf(modo)) || 1;
    modo = m; sel = null; celSel = null;
    redesenhar();
    const pag = ctx.root.querySelector('#pag');
    if (!pag || semAnim()) return;
    pag.style.transition = 'none'; pag.style.transform = `translateX(${dir * 38}%)`; pag.style.opacity = '0';
    requestAnimationFrame(() => requestAnimationFrame(() => { pag.style.transition = 'transform .24s cubic-bezier(.2,.8,.2,1), opacity .24s'; pag.style.transform = ''; pag.style.opacity = ''; }));
  }
  const vizinho = step => { const k = ORDEM_MODOS.indexOf(modo) + step; return k >= 0 && k < ORDEM_MODOS.length ? ORDEM_MODOS[k] : null; };

  function ligar(ps) {
    const root = ctx.root;
    root.querySelectorAll('.seg button').forEach(b => b.onclick = () => { if (b.dataset.m !== modo) setModo(b.dataset.m); });
    const bl = root.querySelector('#bLimpar'); if (bl) bl.onclick = () => toggleSel(sel);
    root.querySelectorAll('.wdf button[data-wd]').forEach(b => b.onclick = () => { const w = +b.dataset.wd; setFiltroDia(filtroDia === w ? null : w); });
    const bx = root.querySelector('#bWdx'); if (bx) bx.onclick = () => setFiltroDia(null);
    root.querySelectorAll('svg .hit, table.tsel tr[data-ordem], .mx .hd').forEach(el => el.onclick = () => toggleSel(el.dataset.ordem));
    root.querySelector('#bMx').onclick = () => { mxAberto = !mxAberto; if (!mxAberto) celSel = null; redesenhar(); };
    root.querySelectorAll('.mx .cel').forEach(b => b.onclick = () => {
      const p = ps.find(q => q.ordem === b.dataset.ordem); if (!p || p.semDados) return;
      const tot = !!b.dataset.tot, s = tot ? null : b.dataset.sis;
      const itens = ctx.itens.filter(x => (tot || x.sistema === s) && noPeriodo(x, p)).sort((a, b2) => a.ini - b2.ini);
      if (!itens.length) return;
      celSel = { ordem: p.ordem, sis: s }; redesenhar();
      const ms = uniaoMs(itens, p);
      ctx.abrirLista(tot ? 'Todos os sistemas' : s, `${rotLongo(p)} · ${itens.length} chamado${itens.length > 1 ? 's' : ''} · ${fmtH(ms)} (${pctTxt(pctNum(ms, p))}) no expediente`,
        itens.map(x => x.id), () => { celSel = null; redesenhar(); });
    });
  }
  // arrastar para o lado em qualquer ponto do painel troca Dia ⇄ Semana ⇄ Mês
  function gesto(root, ativo) {
    let st = null, acabou = false;
    root.addEventListener('pointerdown', e => {
      if (!ativo() || e.pointerType === 'mouse' || !e.isPrimary || document.body.classList.contains('sheet-on')) return;
      const pag = root.querySelector('#pag'); if (!pag) return;
      st = { x: e.clientX, y: e.clientY, id: e.pointerId, dir: null, dx: 0, pag };
    });
    root.addEventListener('pointermove', e => {
      if (!st || e.pointerId !== st.id) return;
      const dx = e.clientX - st.x, dy = e.clientY - st.y;
      if (!st.dir) { if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return; st.dir = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'h' : 'v'; if (st.dir === 'h') st.pag.style.transition = 'none'; }
      if (st.dir !== 'h') return;
      st.dx = dx;
      const mov = vizinho(dx < 0 ? 1 : -1) ? dx : dx * 0.22;
      st.pag.style.transform = `translateX(${mov}px)`; st.pag.style.opacity = String(1 - Math.min(0.45, Math.abs(mov) / 700));
    });
    const fim = e => {
      if (!st || e.pointerId !== st.id) return;
      const s = st; st = null;
      if (s.dir !== 'h') return;
      acabou = true; setTimeout(() => { acabou = false; }, 350);
      const Wd = root.clientWidth, step = s.dx < 0 ? 1 : -1, alvo = vizinho(step);
      if (alvo && Math.abs(s.dx) > Math.min(70, Wd * 0.18)) {
        if (semAnim()) { setModo(alvo, step); return; }
        s.pag.style.transition = 'transform .14s ease-in, opacity .14s'; s.pag.style.transform = `translateX(${-step * Wd * 0.6}px)`; s.pag.style.opacity = '0';
        setTimeout(() => setModo(alvo, step), 140);
      } else { s.pag.style.transition = 'transform .22s cubic-bezier(.2,.8,.2,1), opacity .22s'; s.pag.style.transform = ''; s.pag.style.opacity = ''; }
    };
    root.addEventListener('pointerup', fim);
    root.addEventListener('pointercancel', fim);
    root.addEventListener('click', e => { if (acabou) { e.stopPropagation(); e.preventDefault(); } }, true);
  }

  window.PSPainel = {
    versao: VERSAO, render, gesto, trechos,
    estado: () => ({ modo, filtroDia, sel, mxAberto, celSel }),
    msExpediente: c => { let ms = 0; for (let d = dia0(c.ini); d < c.fimCalc; d = addD(d, 1)) ms += trechos(c, { ini: d, dias: 1 }).reduce((a, t) => a + t.ms, 0); return ms; },
  };
})();
