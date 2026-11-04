/* ===== Gestionale menu ===== */
(function () {
  'use strict';
  const C = window.MenuCommon;
  const { esc } = C;

  const BASE_PATH = new URL('../', location.href).pathname;      // es. /menu-digitale/
  const LS_DRAFT = 'menuDraft:' + BASE_PATH;
  const LS_GH = 'menuGithub:' + BASE_PATH;
  const DATA_PATH = 'data/menu.json';

  let state = null;           // menu in modifica
  let publishedStr = '';      // ultima versione pubblicata (stringa JSON)
  let gh = loadGh();          // collegamento GitHub
  let tab = 'menu';
  let curSec = 0;
  let openItem = null;        // id del piatto aperto in modifica
  const collapsed = new Set();
  const imgCache = {};        // anteprime locali delle immagini appena caricate

  const view = document.getElementById('view');
  const dlg = document.getElementById('dlg');

  /* ---------- Avvio ---------- */
  init();

  async function init() {
    let pub = null;
    try {
      if (connected()) {
        const f = await ghGetFile(DATA_PATH);
        pub = JSON.parse(f.text);
      }
    } catch (e) { console.warn(e); }
    if (!pub) {
      try {
        const r = await fetch('../' + DATA_PATH + '?v=' + Date.now(), { cache: 'no-store' });
        if (r.ok) pub = await r.json();
      } catch (e) { console.warn(e); }
    }
    pub = normalize(pub || {});
    publishedStr = JSON.stringify(pub);

    let draft = null;
    try { draft = JSON.parse(localStorage.getItem(LS_DRAFT) || 'null'); } catch (e) { /* ignora */ }
    if (draft && JSON.stringify(normalize(draft)) !== publishedStr) {
      state = normalize(draft);
      toast('Hai ripreso le modifiche non ancora pubblicate');
    } else {
      state = JSON.parse(publishedStr);
    }
    bindGlobal();
    render();
  }

  function normalize(d) {
    d.version = 1;
    d.venue = Object.assign({ name: 'Il mio locale', tagline: '', logo: '', address: '', phone: '', instagram: '', website: '', currency: '€', notice: '' }, d.venue || {});
    d.venue.theme = Object.assign({ accent: '#a4472b', mode: 'auto', style: 'classico' }, d.venue.theme || {});
    d.hours = d.hours || {};
    d.hours.note = d.hours.note || '';
    d.hours.days = d.hours.days || {};
    C.DAYS.forEach(day => { if (!Array.isArray(d.hours.days[day.id])) d.hours.days[day.id] = []; });
    if (!Array.isArray(d.sections) || !d.sections.length) {
      d.sections = [
        { id: 'cucina', name: 'Cucina', categories: ['Antipasti', 'Primi', 'Secondi', 'Dolci', 'Pasticceria'].map(n => ({ id: C.slug(n), name: n, description: '', items: [] })) },
        { id: 'bar', name: 'Bar & Bevande', categories: ['Caffetteria', 'Cocktail', 'Vini', 'Birre', 'Analcolici'].map(n => ({ id: C.slug(n), name: n, description: '', items: [] })) }
      ];
    }
    d.sections.forEach(s => {
      s.id = s.id || C.uid('s');
      s.categories = s.categories || [];
      s.categories.forEach(c => {
        c.id = c.id || C.uid('c');
        c.description = c.description || '';
        c.items = c.items || [];
        c.items.forEach(it => {
          it.id = it.id || C.uid('i');
          it.description = it.description || '';
          it.prices = Array.isArray(it.prices) && it.prices.length ? it.prices : [{ label: '', value: '' }];
          it.allergens = it.allergens || [];
          it.tags = it.tags || [];
          it.available = it.available !== false;
          it.image = it.image || '';
        });
      });
    });
    d.qr = Object.assign({ baseUrl: '', tables: 10, start: 1, prefix: 'Tavolo', counters: ['Bancone'], showNfc: true }, d.qr || {});
    return d;
  }

  /* ---------- Salvataggio bozza e stato ---------- */
  function isDirty() { return JSON.stringify(state) !== publishedStr; }

  let saveT = null;
  function changed() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      try {
        if (isDirty()) localStorage.setItem(LS_DRAFT, JSON.stringify(state));
        else localStorage.removeItem(LS_DRAFT);
      } catch (e) { /* storage pieno o bloccato */ }
    }, 250);
    updateStatus();
  }

  function updateStatus() {
    const el = document.getElementById('pubStatus');
    const btn = document.getElementById('publishBtn');
    document.getElementById('venueTitle').textContent = state.venue.name || 'Gestionale menu';
    const dirty = isDirty();
    el.className = 'brand-status';
    if (!connected()) {
      el.textContent = dirty ? 'Modifiche salvate solo su questo dispositivo' : 'Repository non collegato';
      el.classList.add('dirty');
      btn.disabled = false;
    } else if (dirty) {
      el.textContent = 'Modifiche non pubblicate';
      el.classList.add('dirty');
      btn.disabled = false;
    } else {
      el.textContent = 'Menu online aggiornato';
      el.classList.add('ok');
      btn.disabled = true;
    }
    applyAccent();
  }

  function applyAccent() {
    const a = state.venue.theme.accent || '#a4472b';
    document.documentElement.style.setProperty('--accent', a);
    document.documentElement.style.setProperty('--on-accent', C.readableOn(a));
  }

  /* ---------- Utilità percorsi ---------- */
  function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  }
  function setPath(obj, path, val) {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((o, k) => o[k], obj);
    target[last] = val;
  }

  /* ---------- Render ---------- */
  function render() {
    document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab));
    const fn = { menu: viewMenu, locale: viewLocale, orari: viewOrari, qr: viewQr, impostazioni: viewSettings }[tab];
    view.innerHTML = fn();
    if (tab === 'qr') drawQrs();
    updateStatus();
  }

  const I = {
    up: '<path d="m6 15 6-6 6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
    nfc: '<path d="M6 8.5a6 6 0 0 1 0 7M9.5 6a10 10 0 0 1 0 12M13 3.5a14 14 0 0 1 0 17"/><circle cx="3" cy="12" r="1.2"/>'
  };
  function ic(name, size) {
    const s = size || 18;
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${I[name]}</svg>`;
  }
  function imgSrc(p) {
    if (!p) return '';
    if (imgCache[p]) return imgCache[p];
    return /^(https?:|data:|blob:)/.test(p) ? p : '../' + p;
  }
  function priceSummary(it) {
    return it.prices.filter(p => p.value !== '').map(p => (p.label ? p.label + ' ' : '') + C.formatPrice(p.value, state.venue.currency)).join(' · ') || '—';
  }

  /* ----- Scheda Menu ----- */
  function viewMenu() {
    if (curSec >= state.sections.length) curSec = 0;
    const s = state.sections[curSec];
    const base = `sections.${curSec}`;
    const secTabs = state.sections.map((x, i) => `<button class="${i === curSec ? 'on' : ''}" data-act="sec" data-i="${i}">${esc(x.name || 'Senza nome')}</button>`).join('');

    const cats = s.categories.map((c, ci) => {
      const cp = `${base}.categories.${ci}`;
      const items = c.items.map((it, ii) => itemHtml(it, ci, ii, `${cp}.items.${ii}`)).join('');
      return `<div class="cat ${collapsed.has(c.id) ? 'collapsed' : ''}" data-ci="${ci}">
        <div class="cat-head">
          <button class="icon-btn" data-act="collapse" data-ci="${ci}" title="Comprimi / espandi" style="transform:rotate(${collapsed.has(c.id) ? 0 : 90}deg)">${ic('chev')}</button>
          <input class="cat-name" type="text" data-k="${cp}.name" value="${esc(c.name)}" placeholder="Nome categoria">
          <span class="count">${c.items.length} ${c.items.length === 1 ? 'voce' : 'voci'}</span>
          <button class="icon-btn" data-act="catUp" data-ci="${ci}" title="Sposta su" ${ci === 0 ? 'disabled' : ''}>${ic('up')}</button>
          <button class="icon-btn" data-act="catDown" data-ci="${ci}" title="Sposta giù" ${ci === s.categories.length - 1 ? 'disabled' : ''}>${ic('down')}</button>
          <button class="icon-btn danger" data-act="catDel" data-ci="${ci}" title="Elimina categoria">${ic('trash')}</button>
        </div>
        <div class="cat-body">
          <div class="cat-desc"><input type="text" data-k="${cp}.description" value="${esc(c.description)}" placeholder="Nota sotto il titolo (facoltativa)"></div>
          ${items || '<p class="empty-state">Nessuna voce in questa categoria.</p>'}
          <div class="add-row"><button class="btn sm" data-act="itemAdd" data-ci="${ci}">${ic('plus', 16)} Aggiungi voce</button></div>
        </div>
      </div>`;
    }).join('');

    return `
      <h2>Menu</h2>
      <p class="lead">Organizza le sezioni (es. Cucina, Bar), le categorie e le singole voci. Le modifiche si salvano da sole come bozza: premi <b>Pubblica</b> per metterle online.</p>
      <div class="sec-bar">
        <div class="seg">${secTabs}</div>
        <button class="btn sm" data-act="secAdd">${ic('plus', 16)} Sezione</button>
      </div>
      <div class="card row" style="padding:12px 14px">
        <label class="field" style="flex:1;min-width:180px"><span>Nome della sezione</span>
          <input type="text" data-k="${base}.name" data-live="secname" value="${esc(s.name)}"></label>
        <div class="row" style="align-self:flex-end">
          <button class="icon-btn" data-act="secUp" title="Sposta a sinistra" ${curSec === 0 ? 'disabled' : ''} style="transform:rotate(-90deg)">${ic('up')}</button>
          <button class="icon-btn" data-act="secDown" title="Sposta a destra" ${curSec === state.sections.length - 1 ? 'disabled' : ''} style="transform:rotate(-90deg)">${ic('down')}</button>
          <button class="btn sm danger" data-act="secDel">Elimina sezione</button>
        </div>
      </div>
      ${cats}
      <button class="btn" data-act="catAdd">${ic('plus', 16)} Aggiungi categoria</button>`;
  }

  function itemHtml(it, ci, ii, p) {
    const s = state.sections[curSec];
    const nItems = s.categories[ci].items.length;
    const alg = C.ALLERGENS.map(a => `<label class="chip"><input type="checkbox" data-arr="${p}.allergens" value="${a.n}" ${it.allergens.includes(a.n) ? 'checked' : ''}><span class="n">${a.n}</span>${a.name}</label>`).join('');
    const tags = C.TAGS.map(t => `<label class="chip"><input type="checkbox" data-arr="${p}.tags" value="${t.id}" ${it.tags.includes(t.id) ? 'checked' : ''}>${t.label}</label>`).join('');
    const prices = it.prices.map((pr, pi) => `<div class="pline">
        <input type="text" data-k="${p}.prices.${pi}.label" value="${esc(pr.label)}" placeholder="${pi === 0 && it.prices.length === 1 ? 'Etichetta (facoltativa)' : 'es. calice, bottiglia'}">
        <input type="text" inputmode="decimal" data-k="${p}.prices.${pi}.value" value="${esc(pr.value)}" placeholder="0,00">
        <button class="icon-btn danger" data-act="priceDel" data-ci="${ci}" data-ii="${ii}" data-pi="${pi}" title="Rimuovi prezzo" ${it.prices.length === 1 ? 'disabled' : ''}>${ic('x', 16)}</button>
      </div>`).join('');
    const moveOpts = s.categories.map((c, i) => `<option value="${i}" ${i === ci ? 'selected' : ''}>${esc(c.name)}</option>`).join('');

    return `<div class="it ${openItem === it.id ? 'open' : ''} ${it.available ? '' : 'off'}" data-id="${it.id}">
      <div class="it-row" data-act="itemToggle" data-id="${it.id}">
        ${it.image ? `<img class="it-thumb" src="${esc(imgSrc(it.image))}" alt="">` : ''}
        <div class="nm"><b data-sum="name">${esc(it.name || 'Nuova voce')}</b><small data-sum="desc">${esc(it.description)}</small></div>
        <span class="pr" data-sum="price">${esc(priceSummary(it))}</span>
        <label class="switch" title="Disponibile"><input type="checkbox" data-k="${p}.available" ${it.available ? 'checked' : ''}><span class="track"></span></label>
      </div>
      <div class="it-edit">
        <div class="grid" style="margin-top:8px">
          <label class="field"><span>Nome</span><input type="text" data-k="${p}.name" value="${esc(it.name)}" placeholder="es. Tagliatelle al ragù"></label>
          <div class="field"><span>Prezzo</span>
            <div class="prices-ed">${prices}</div>
            <button class="btn sm ghost" style="align-self:flex-start" data-act="priceAdd" data-ci="${ci}" data-ii="${ii}">${ic('plus', 14)} Altro formato / prezzo</button>
          </div>
        </div>
        <label class="field" style="margin-top:12px"><span>Descrizione</span><textarea data-k="${p}.description" rows="2" placeholder="Ingredienti, provenienza, note">${esc(it.description)}</textarea></label>
        <div class="field" style="margin-top:12px"><span>Allergeni</span><div class="chips">${alg}</div></div>
        <div class="field" style="margin-top:12px"><span>Etichette</span><div class="chips">${tags}</div></div>
        <div class="field" style="margin-top:12px"><span>Foto (facoltativa)</span>
          <div class="img-ed">
            ${it.image ? `<img src="${esc(imgSrc(it.image))}" alt="">` : ''}
            <label class="btn sm">${it.image ? 'Sostituisci' : 'Carica foto'}<input type="file" accept="image/*" hidden data-upload="${p}.image" data-max="900"></label>
            ${it.image ? `<button class="btn sm danger" data-act="imgDel" data-path="${p}.image">Rimuovi</button>` : ''}
          </div>
        </div>
        <div class="row" style="margin-top:16px">
          <button class="btn sm" data-act="itemUp" data-ci="${ci}" data-ii="${ii}" ${ii === 0 ? 'disabled' : ''}>${ic('up', 15)} Su</button>
          <button class="btn sm" data-act="itemDown" data-ci="${ci}" data-ii="${ii}" ${ii === nItems - 1 ? 'disabled' : ''}>${ic('down', 15)} Giù</button>
          <label class="row muted" style="font-size:.86rem;gap:6px">Sposta in
            <select data-move data-ci="${ci}" data-ii="${ii}" style="width:auto">${moveOpts}</select></label>
          <span class="spacer"></span>
          <button class="btn sm" data-act="itemDup" data-ci="${ci}" data-ii="${ii}">${ic('copy', 15)} Duplica</button>
          <button class="btn sm danger" data-act="itemDel" data-ci="${ci}" data-ii="${ii}">${ic('trash', 15)} Elimina</button>
        </div>
      </div>
    </div>`;
  }

  /* ----- Scheda Locale ----- */
  function viewLocale() {
    const v = state.venue;
    const presets = ['#a4472b', '#7a2e3a', '#2f5d50', '#1f4e79', '#b07d1a', '#3b3b3b', '#6b4f9e', '#c2410c'];
    return `
      <h2>Il locale</h2>
      <p class="lead">Queste informazioni compaiono in testa al menu e sui cartellini stampati.</p>
      <div class="card"><h3>Dati principali</h3>
        <div class="grid">
          <label class="field"><span>Nome del locale</span><input type="text" data-k="venue.name" value="${esc(v.name)}"></label>
          <label class="field"><span>Sottotitolo</span><input type="text" data-k="venue.tagline" value="${esc(v.tagline)}" placeholder="es. Cucina tipica dal 1987"></label>
          <label class="field"><span>Indirizzo</span><input type="text" data-k="venue.address" value="${esc(v.address)}"></label>
          <label class="field"><span>Telefono</span><input type="tel" data-k="venue.phone" value="${esc(v.phone)}"></label>
          <label class="field"><span>Instagram</span><input type="text" data-k="venue.instagram" value="${esc(v.instagram)}" placeholder="nomeprofilo"></label>
          <label class="field"><span>Sito web</span><input type="url" data-k="venue.website" value="${esc(v.website)}" placeholder="https://"></label>
          <label class="field"><span>Valuta</span><input type="text" data-k="venue.currency" value="${esc(v.currency)}" style="max-width:90px"></label>
        </div>
        <label class="field" style="margin-top:14px"><span>Avviso in evidenza</span>
          <textarea data-k="venue.notice" rows="2" placeholder="es. Coperto € 2,50 · Chiedi al personale per le intolleranze">${esc(v.notice)}</textarea></label>
      </div>
      <div class="card"><h3>Logo</h3>
        <div class="img-ed">
          ${v.logo ? `<img src="${esc(imgSrc(v.logo))}" alt="" style="border-radius:50%;object-fit:contain;background:#fff">` : ''}
          <label class="btn sm">${v.logo ? 'Sostituisci' : 'Carica logo'}<input type="file" accept="image/*" hidden data-upload="venue.logo" data-max="512"></label>
          ${v.logo ? `<button class="btn sm danger" data-act="imgDel" data-path="venue.logo">Rimuovi</button>` : ''}
        </div>
        <label class="field" style="margin-top:12px"><span>…oppure indirizzo di un'immagine</span><input type="url" data-k="venue.logo" value="${esc(v.logo)}" placeholder="https://"></label>
      </div>
      <div class="card"><h3>Aspetto</h3>
        <div class="field"><span>Colore principale</span>
          <div class="swatches">
            ${presets.map(c => `<button class="sw ${c === v.theme.accent ? 'on' : ''}" style="background:${c}" data-act="accent" data-c="${c}" title="${c}"></button>`).join('')}
            <input type="color" data-k="venue.theme.accent" value="${esc(v.theme.accent)}" title="Colore personalizzato">
          </div>
        </div>
        <div class="grid" style="margin-top:14px">
          <div class="field"><span>Stile</span>
            <div class="seg">${[['classico', 'Classico'], ['moderno', 'Moderno']].map(([k, l]) => `<button class="${v.theme.style === k ? 'on' : ''}" data-act="set" data-path="venue.theme.style" data-v="${k}">${l}</button>`).join('')}</div>
            <small>Classico: titoli con grazie, tono carta. Moderno: tutto sans-serif.</small>
          </div>
          <div class="field"><span>Tema</span>
            <div class="seg">${[['auto', 'Automatico'], ['light', 'Chiaro'], ['dark', 'Scuro']].map(([k, l]) => `<button class="${v.theme.mode === k ? 'on' : ''}" data-act="set" data-path="venue.theme.mode" data-v="${k}">${l}</button>`).join('')}</div>
            <small>Automatico segue l'impostazione del telefono del cliente.</small>
          </div>
        </div>
      </div>`;
  }

  /* ----- Scheda Orari ----- */
  function viewOrari() {
    const days = C.DAYS.map(d => {
      const ranges = state.hours.days[d.id];
      const open = ranges.length > 0;
      return `<div class="day">
        <div class="dname">${d.label}</div>
        <div>
          <div class="row" style="margin-bottom:${open ? 8 : 0}px">
            <label class="switch"><input type="checkbox" data-act-change="dayToggle" data-d="${d.id}" ${open ? 'checked' : ''}><span class="track"></span>${open ? 'Aperto' : 'Chiuso'}</label>
            <span class="spacer"></span>
            ${open ? `<button class="btn sm ghost" data-act="dayCopy" data-d="${d.id}">Copia su tutti i giorni</button>` : ''}
          </div>
          ${open ? `<div class="ranges">${ranges.map((r, ri) => `<div class="range">
              <input type="time" data-k="hours.days.${d.id}.${ri}.0" value="${esc(r[0])}">
              <span class="muted">–</span>
              <input type="time" data-k="hours.days.${d.id}.${ri}.1" value="${esc(r[1])}">
              <button class="icon-btn danger" data-act="rangeDel" data-d="${d.id}" data-ri="${ri}" title="Rimuovi fascia">${ic('x', 16)}</button>
            </div>`).join('')}
            ${ranges.length < 3 ? `<button class="btn sm ghost" style="align-self:flex-start" data-act="rangeAdd" data-d="${d.id}">${ic('plus', 14)} Aggiungi fascia</button>` : ''}
          </div>` : ''}
        </div>
      </div>`;
    }).join('');
    return `
      <h2>Orari di apertura</h2>
      <p class="lead">Il menu mostra ai clienti se il locale è aperto in quel momento. Per orari dopo la mezzanotte inserisci ad esempio 19:00 – 02:00.</p>
      <div class="card">${days}</div>
      <div class="card"><label class="field"><span>Nota sugli orari</span>
        <input type="text" data-k="hours.note" value="${esc(state.hours.note)}" placeholder="es. Cucina aperta fino alle 22:30"></label></div>`;
  }

  /* ----- Scheda QR & NFC ----- */
  function defaultBase() { return new URL('../', location.href).href; }
  function menuBase() {
    let b = (state.qr.baseUrl || '').trim() || defaultBase();
    if (!/[/?]$/.test(b) && !/\.html$/.test(b)) b += '/';
    return b;
  }
  function qrPoints() {
    const q = state.qr;
    const pts = [];
    const n = Math.max(0, Math.min(200, parseInt(q.tables, 10) || 0));
    const start = parseInt(q.start, 10) || 1;
    for (let i = 0; i < n; i++) {
      const num = start + i;
      pts.push({ kind: 'table', label: `${q.prefix || 'Tavolo'} ${num}`, url: `${menuBase()}?t=${num}` });
    }
    q.counters.filter(c => c.trim()).forEach(c => pts.push({ kind: 'counter', label: c.trim(), url: `${menuBase()}?b=${encodeURIComponent(c.trim())}` }));
    return pts;
  }

  function viewQr() {
    const q = state.qr;
    const pts = qrPoints();
    const nfcSupported = 'NDEFReader' in window;
    const card = (p, i) => `<div class="qr-card">
        <div class="qr" data-qr="${i}"></div>
        <div class="lbl">${esc(p.label)}</div>
        <div class="url">${esc(p.url)}</div>
        <div class="acts">
          <button class="btn sm" data-act="dlPng" data-i="${i}">PNG</button>
          <button class="btn sm" data-act="dlSvg" data-i="${i}">SVG</button>
          <button class="btn sm" data-act="copyUrl" data-i="${i}">Copia link</button>
          <button class="btn sm" data-act="nfc" data-i="${i}" title="Scrivi su tag NFC">${ic('nfc', 15)} NFC</button>
        </div>
      </div>`;
    const tables = pts.map((p, i) => p.kind === 'table' ? card(p, i) : '').join('');
    const counters = pts.map((p, i) => p.kind === 'counter' ? card(p, i) : '').join('');

    return `
      <h2>QR code e tag NFC</h2>
      <p class="lead">Ogni tavolo e ogni punto del bancone ha il suo link: il cliente vede il menu con l'indicazione di dove si trova.</p>
      <div class="card"><h3>Indirizzo del menu</h3>
        <label class="field"><span>Link pubblico</span>
          <input type="url" data-k="qr.baseUrl" data-live="qr" value="${esc(q.baseUrl)}" placeholder="${esc(defaultBase())}">
          <small>Lascia vuoto per usare l'indirizzo GitHub Pages (${esc(defaultBase())}). Cambialo solo se colleghi un dominio tuo, <b>prima</b> di stampare.</small>
        </label>
      </div>
      <div class="grid">
        <div class="card"><h3>Tavoli</h3>
          <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:10px">
            <label class="field"><span>Quanti</span><input type="number" min="0" max="200" data-k="qr.tables" data-num data-live="qr" value="${esc(q.tables)}"></label>
            <label class="field"><span>Dal n°</span><input type="number" min="0" data-k="qr.start" data-num data-live="qr" value="${esc(q.start)}"></label>
            <label class="field"><span>Nome</span><input type="text" data-k="qr.prefix" data-live="qr" value="${esc(q.prefix)}"></label>
          </div>
        </div>
        <div class="card"><h3>Bancone e altri punti</h3>
          <div class="list-ed">
            ${q.counters.map((c, i) => `<div class="lrow"><input type="text" data-k="qr.counters.${i}" data-live="qr" value="${esc(c)}" placeholder="es. Bancone, Cassa, Dehors"><button class="icon-btn danger" data-act="counterDel" data-i="${i}">${ic('x', 16)}</button></div>`).join('')}
            <button class="btn sm ghost" style="align-self:flex-start" data-act="counterAdd">${ic('plus', 14)} Aggiungi</button>
          </div>
        </div>
      </div>
      <div class="card"><h3>Stampa cartellini</h3>
        <p class="muted" style="margin-top:0">Formato A4: tavoli 4 per foglio (A6, 10,5 × 14,8 cm), bancone 2 per foglio (A5 orizzontale). Stampa al 100% senza margini, poi ritaglia lungo le linee tratteggiate.</p>
        <div class="row">
          <button class="btn primary" data-act="print" data-kind="table">Stampa cartellini tavoli</button>
          <button class="btn" data-act="print" data-kind="counter">Stampa cartellini bancone</button>
          <label class="switch"><input type="checkbox" data-k="qr.showNfc" ${q.showNfc ? 'checked' : ''}><span class="track"></span>Indica il tag NFC sul cartellino</label>
        </div>
      </div>
      <div class="card"><h3>Tag NFC</h3>
        ${nfcSupported
          ? '<p class="hint">Questo dispositivo può scrivere i tag direttamente: premi <b>NFC</b> sotto un QR e avvicina il tag al retro del telefono.</p>'
          : '<p class="hint warn">Da questo dispositivo non è possibile scrivere i tag. Apri il gestionale con <b>Chrome su Android</b>, oppure usa un\'app come <b>NFC Tools</b> (iPhone e Android): Scrivi → Aggiungi record → URL, e incolla il link copiato con «Copia link».</p>'}
        <p class="muted" style="margin:0;font-size:.88rem">Consigliati tag <b>NTAG213</b> o <b>NTAG215</b> adesivi; sotto superfici metalliche servono tag «anti-metal». Puoi bloccare il tag in sola lettura così nessuno potrà riscriverlo.</p>
      </div>
      ${tables ? `<h3>Tavoli</h3><div class="qr-grid">${tables}</div>` : ''}
      ${counters ? `<h3 style="margin-top:22px">Bancone</h3><div class="qr-grid">${counters}</div>` : ''}`;
  }

  function qrModules(text) {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr;
  }
  function qrSvg(text, margin, color) {
    const qr = qrModules(text);
    const n = qr.getModuleCount();
    const m = margin == null ? 2 : margin;
    const size = n + m * 2;
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="${color || '#000'}"/></svg>`;
  }
  function drawQrs() {
    const pts = qrPoints();
    view.querySelectorAll('[data-qr]').forEach(el => { el.innerHTML = qrSvg(pts[+el.dataset.qr].url, 2); });
  }
  let qrT = null;
  function refreshQrLater() {
    clearTimeout(qrT);
    qrT = setTimeout(() => {
      const a = document.activeElement;
      const k = a && a.dataset ? a.dataset.k : null;
      const pos = a && a.selectionStart;
      render();
      if (k) {
        const el = view.querySelector(`[data-k="${k}"]`);
        if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (e) { /* number */ } }
      }
    }, 400);
  }
  function fileName(label, ext) { return 'qr-' + C.slug(label) + '.' + ext; }
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function downloadPng(p) {
    const qr = qrModules(p.url);
    const n = qr.getModuleCount(), m = 4, px = Math.floor(1200 / (n + m * 2));
    const size = (n + m * 2) * px;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect((c + m) * px, (r + m) * px, px, px);
    cv.toBlob(b => download(b, fileName(p.label, 'png')), 'image/png');
  }

  /* Stampa cartellini */
  const NFC_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="2.5" y="2.5" width="19" height="19" rx="5"/><path d="M9 8.5a5 5 0 0 1 0 7M12 6.5a8 8 0 0 1 0 11M15 5a11 11 0 0 1 0 14"/></svg>';
  async function printCards(kind) {
    const pts = qrPoints().filter(p => p.kind === kind);
    if (!pts.length) { toast(kind === 'table' ? 'Imposta almeno un tavolo' : 'Aggiungi almeno un punto bancone', true); return; }
    const v = state.venue;
    const per = kind === 'table' ? 4 : 2;
    const how = state.qr.showNfc ? 'Inquadra il QR code oppure avvicina lo smartphone' : 'Inquadra il QR code con la fotocamera';
    const card = p => kind === 'table'
      ? `<div class="pcard"><div class="band"></div>
          <div class="pname">${esc(v.name)}</div><div class="psub">Menu digitale</div>
          <div class="pqr">${qrSvg(p.url, 1)}</div>
          <div class="plabel">${esc(p.label)}</div>
          <div class="phow">${state.qr.showNfc ? NFC_SVG : ''}<span>${how}</span></div></div>`
      : `<div class="pcard counter"><div class="band"></div>
          <div class="pqr">${qrSvg(p.url, 1)}</div>
          <div class="ptext"><div class="pname">${esc(v.name)}</div><div class="psub">Menu digitale</div>
          <div class="plabel">${esc(p.label)}</div>
          <div class="phow">${state.qr.showNfc ? NFC_SVG : ''}<span>${how}</span></div></div></div>`;
    let html = '';
    for (let i = 0; i < pts.length; i += per) {
      html += `<div class="sheet ${kind === 'table' ? 's-table' : 's-counter'}">${pts.slice(i, i + per).map(card).join('')}</div>`;
    }
    const area = document.getElementById('printArea');
    area.style.setProperty('--card-accent', v.theme.accent);
    area.style.setProperty('--card-on', C.readableOn(v.theme.accent));
    area.innerHTML = html;
    try { await document.fonts.ready; } catch (e) { /* ignora */ }
    window.print();
  }

  /* Scrittura NFC */
  function nfcDialog(p) {
    if (!('NDEFReader' in window)) {
      dlg.innerHTML = `<h3>Scrivi il tag NFC</h3>
        <p>Su questo dispositivo usa un'app come <b>NFC Tools</b>: Scrivi → Aggiungi record → URL / URI, incolla il link e scrivi sul tag.</p>
        <p class="url" style="word-break:break-all;background:var(--soft);padding:10px;border-radius:8px;font-size:.85rem">${esc(p.url)}</p>
        <div class="row"><span class="spacer"></span><button class="btn" data-dlg="close">Chiudi</button><button class="btn primary" data-dlg="copy">Copia link</button></div>`;
      dlg.showModal();
      dlg.onclick = async e => {
        const a = e.target.dataset.dlg;
        if (a === 'copy') { await copy(p.url); dlg.close(); }
        if (a === 'close') dlg.close();
      };
      return;
    }
    dlg.innerHTML = `<h3>Scrivi tag · ${esc(p.label)}</h3>
      <p class="muted" style="word-break:break-all;font-size:.85rem">${esc(p.url)}</p>
      <label class="row" style="margin:12px 0;font-size:.9rem;gap:8px;align-items:flex-start"><input type="checkbox" id="nfcLock" style="margin-top:3px">
        <span>Blocca il tag in sola lettura dopo la scrittura.<br><small class="muted">Operazione irreversibile: il tag non potrà più essere modificato.</small></span></label>
      <div class="row"><span class="spacer"></span><button class="btn" data-dlg="close">Annulla</button><button class="btn primary" data-dlg="go">Inizia</button></div>`;
    dlg.showModal();
    let ctrl = null;
    dlg.onclose = () => { if (ctrl) ctrl.abort(); };
    dlg.onclick = async e => {
      const a = e.target.dataset.dlg;
      if (a === 'close') { dlg.close(); return; }
      if (a !== 'go') return;
      const lock = document.getElementById('nfcLock').checked;
      ctrl = new AbortController();
      dlg.innerHTML = `<h3>Avvicina il tag</h3><div class="nfc-anim">${ic('nfc', 34)}</div>
        <p style="text-align:center" class="muted">Tieni il tag fermo sul retro del telefono finché non compare la conferma.</p>
        <div class="row"><span class="spacer"></span><button class="btn" data-dlg="close">Annulla</button></div>`;
      try {
        const nd = new NDEFReader();
        await nd.write({ records: [{ recordType: 'url', data: p.url }] }, { signal: ctrl.signal });
        if (lock) await nd.makeReadOnly({ signal: ctrl.signal });
        dlg.innerHTML = `<h3 class="nfc-ok">Tag scritto ✓</h3><p>${esc(p.label)}${lock ? ' · bloccato in sola lettura' : ''}. Avvicina il telefono per provarlo.</p>
          <div class="row"><span class="spacer"></span><button class="btn primary" data-dlg="close">Fatto</button></div>`;
      } catch (err) {
        if (err.name === 'AbortError') return;
        dlg.innerHTML = `<h3>Scrittura non riuscita</h3><p>${esc(nfcError(err))}</p>
          <div class="row"><span class="spacer"></span><button class="btn primary" data-dlg="close">Chiudi</button></div>`;
      }
    };
  }
  function nfcError(err) {
    if (err.name === 'NotAllowedError') return 'Permesso NFC negato. Consenti l\'accesso NFC al sito e verifica che l\'NFC sia attivo nelle impostazioni del telefono.';
    if (err.name === 'NotSupportedError') return 'NFC non disponibile o disattivato su questo telefono.';
    if (err.name === 'NetworkError') return 'Il tag si è allontanato troppo presto, oppure è bloccato in sola lettura. Riprova tenendolo fermo.';
    return err.message || String(err);
  }

  /* ----- Scheda Impostazioni ----- */
  function viewSettings() {
    const ok = connected();
    return `
      <h2>Impostazioni</h2>
      <p class="lead">Collega il repository GitHub per pubblicare il menu online e caricare foto e logo.</p>
      <div class="card"><h3>Repository GitHub ${ok ? '<span class="nfc-ok" style="font-size:.85rem">· collegato</span>' : ''}</h3>
        <div class="grid">
          <label class="field"><span>Utente o organizzazione</span><input type="text" id="ghOwner" value="${esc(gh.owner)}" autocomplete="off"></label>
          <label class="field"><span>Repository</span><input type="text" id="ghRepo" value="${esc(gh.repo)}" autocomplete="off"></label>
          <label class="field"><span>Branch</span><input type="text" id="ghBranch" value="${esc(gh.branch)}" autocomplete="off"></label>
        </div>
        <label class="field" style="margin-top:14px"><span>Token di accesso</span>
          <input type="password" id="ghToken" value="${esc(gh.token)}" autocomplete="off" placeholder="github_pat_…">
          <small>Crea un <b>fine-grained token</b> su GitHub → Settings → Developer settings → Personal access tokens, con accesso <b>solo a questo repository</b> e permesso <b>Contents: Read and write</b>. Resta salvato solo in questo browser.</small>
        </label>
        <div class="row" style="margin-top:14px">
          <button class="btn primary" data-act="ghSave">Salva e verifica</button>
          ${ok ? '<button class="btn danger" data-act="ghLogout">Scollega questo dispositivo</button>' : ''}
          <span id="ghMsg" class="muted"></span>
        </div>
      </div>
      <div class="card"><h3>Backup</h3>
        <p class="muted" style="margin-top:0">Scarica una copia del menu o ripristina da un file salvato in precedenza.</p>
        <div class="row">
          <button class="btn" data-act="export">Scarica backup (.json)</button>
          <label class="btn">Importa backup<input type="file" accept="application/json,.json" hidden id="importFile"></label>
          <button class="btn danger" data-act="discard" ${isDirty() ? '' : 'disabled'}>Annulla modifiche non pubblicate</button>
        </div>
      </div>`;
  }

  /* ---------- Eventi ---------- */
  function syncTopbar() {
    const h = document.querySelector('.topbar').offsetHeight;
    document.documentElement.style.setProperty('--topbar-h', h + 'px');
  }

  function bindGlobal() {
    syncTopbar();
    window.addEventListener('resize', syncTopbar);
    document.querySelector('.tabs').addEventListener('click', e => {
      const b = e.target.closest('button[data-tab]');
      if (!b) return;
      tab = b.dataset.tab;
      render();
      window.scrollTo(0, 0);
    });
    document.getElementById('publishBtn').addEventListener('click', publish);
    document.getElementById('previewBtn').addEventListener('click', () => {
      try { localStorage.setItem(LS_DRAFT, JSON.stringify(state)); } catch (e) { /* ignora */ }
    });

    view.addEventListener('input', onInput);
    view.addEventListener('change', onChange);
    view.addEventListener('click', onClick);
    window.addEventListener('beforeunload', e => {
      if (isDirty() && !connected()) { e.preventDefault(); e.returnValue = ''; }
    });
    window.addEventListener('afterprint', () => { document.getElementById('printArea').innerHTML = ''; });
  }

  function onInput(e) {
    const t = e.target;
    if (!t.dataset.k || t.type === 'checkbox' || t.type === 'file') return;
    let val = t.value;
    if (t.dataset.num !== undefined) val = val === '' ? '' : Number(val);
    setPath(state, t.dataset.k, val);
    changed();
    liveUpdate(t);
  }

  function liveUpdate(t) {
    const k = t.dataset.k;
    // riepilogo della riga del piatto
    const it = t.closest('.it');
    if (it) {
      const m = /^(sections\.\d+\.categories\.\d+\.items\.\d+)/.exec(k);
      if (m) {
        const item = getPath(state, m[1]);
        it.querySelector('[data-sum="name"]').textContent = item.name || 'Nuova voce';
        it.querySelector('[data-sum="desc"]').textContent = item.description;
        it.querySelector('[data-sum="price"]').textContent = priceSummary(item);
      }
    }
    if (t.dataset.live === 'secname') {
      const b = view.querySelector(`.sec-bar [data-i="${curSec}"]`);
      if (b) b.textContent = t.value || 'Senza nome';
    }
    if (t.dataset.live === 'qr') refreshQrLater();
    if (k === 'venue.theme.accent') view.querySelectorAll('.sw').forEach(s => s.classList.toggle('on', s.dataset.c === t.value));
  }

  async function onChange(e) {
    const t = e.target;
    if (t.type === 'checkbox' && t.dataset.k) {
      setPath(state, t.dataset.k, t.checked);
      if (/\.available$/.test(t.dataset.k)) t.closest('.it').classList.toggle('off', !t.checked);
      changed();
      return;
    }
    if (t.type === 'checkbox' && t.dataset.arr) {
      const arr = getPath(state, t.dataset.arr);
      const v = /allergens$/.test(t.dataset.arr) ? Number(t.value) : t.value;
      const i = arr.indexOf(v);
      if (t.checked && i < 0) arr.push(v);
      if (!t.checked && i >= 0) arr.splice(i, 1);
      if (typeof v === 'number') arr.sort((a, b) => a - b);
      changed();
      return;
    }
    if (t.dataset.actChange === 'dayToggle') {
      state.hours.days[t.dataset.d] = t.checked ? [['12:00', '15:00'], ['19:00', '23:00']] : [];
      changed(); render();
      return;
    }
    if (t.dataset.move !== undefined) {
      const s = state.sections[curSec];
      const from = s.categories[+t.dataset.ci].items;
      const [item] = from.splice(+t.dataset.ii, 1);
      s.categories[+t.value].items.push(item);
      collapsed.delete(s.categories[+t.value].id);
      changed(); render();
      toast('Spostato in ' + s.categories[+t.value].name);
      return;
    }
    if (t.dataset.upload && t.files && t.files[0]) {
      const path = t.dataset.upload;
      const file = t.files[0];
      t.value = '';
      try {
        toast('Caricamento immagine…');
        const p = await uploadImage(file, +t.dataset.max || 900);
        setPath(state, path, p);
        changed(); render();
        toast('Immagine caricata');
      } catch (err) { toast(err.message, true); }
      return;
    }
    if (t.id === 'importFile' && t.files[0]) {
      try {
        const data = JSON.parse(await t.files[0].text());
        if (!data.sections || !data.venue) throw new Error('File non valido');
        if (!confirm('Sostituire il menu attuale con il backup? Potrai sempre annullare finché non pubblichi.')) return;
        state = normalize(data);
        changed(); render();
        toast('Backup importato: controlla e pubblica');
      } catch (err) { toast('Impossibile leggere il file: ' + err.message, true); }
      t.value = '';
    }
  }

  function onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el || !view.contains(el)) return;
    const act = el.dataset.act;
    if (act === 'itemToggle' && e.target.closest('.switch, input, button, select')) return;
    const s = state.sections[curSec];
    const ci = +el.dataset.ci, ii = +el.dataset.ii;
    const cat = s && s.categories[ci];
    const swap = (arr, a, b) => { [arr[a], arr[b]] = [arr[b], arr[a]]; };

    const A = {
      sec() { curSec = +el.dataset.i; openItem = null; },
      secAdd() {
        const name = prompt('Nome della nuova sezione (es. Pranzo di lavoro, Vini)');
        if (!name) return false;
        state.sections.push({ id: C.slug(name) + '-' + C.uid(''), name, categories: [] });
        curSec = state.sections.length - 1;
      },
      secDel() {
        if (state.sections.length === 1) { toast('Serve almeno una sezione', true); return false; }
        if (!confirm(`Eliminare la sezione «${s.name}» con tutte le sue categorie e voci?`)) return false;
        state.sections.splice(curSec, 1); curSec = 0;
      },
      secUp() { swap(state.sections, curSec, curSec - 1); curSec--; },
      secDown() { swap(state.sections, curSec, curSec + 1); curSec++; },
      catAdd() {
        const name = prompt('Nome della categoria (es. Pizze, Amari, Gelati)');
        if (!name) return false;
        s.categories.push({ id: C.slug(name) + '-' + C.uid(''), name, description: '', items: [] });
      },
      catDel() {
        if (!confirm(`Eliminare la categoria «${cat.name}» e le sue ${cat.items.length} voci?`)) return false;
        s.categories.splice(ci, 1);
      },
      catUp() { swap(s.categories, ci, ci - 1); },
      catDown() { swap(s.categories, ci, ci + 1); },
      collapse() { collapsed.has(cat.id) ? collapsed.delete(cat.id) : collapsed.add(cat.id); return 'noSave'; },
      itemAdd() {
        const it = { id: C.uid('i'), name: '', description: '', prices: [{ label: '', value: '' }], allergens: [], tags: [], available: true, image: '' };
        cat.items.push(it); openItem = it.id;
        setTimeout(() => { const inp = view.querySelector(`.it[data-id="${it.id}"] .it-edit input`); if (inp) { inp.focus(); inp.scrollIntoView({ block: 'center' }); } }, 30);
      },
      itemToggle() { openItem = openItem === el.dataset.id ? null : el.dataset.id; return 'noSave'; },
      itemUp() { swap(cat.items, ii, ii - 1); },
      itemDown() { swap(cat.items, ii, ii + 1); },
      itemDup() {
        const copyIt = JSON.parse(JSON.stringify(cat.items[ii]));
        copyIt.id = C.uid('i'); copyIt.name += ' (copia)';
        cat.items.splice(ii + 1, 0, copyIt); openItem = copyIt.id;
      },
      itemDel() {
        if (!confirm(`Eliminare «${cat.items[ii].name || 'questa voce'}»?`)) return false;
        cat.items.splice(ii, 1);
      },
      priceAdd() { cat.items[ii].prices.push({ label: '', value: '' }); },
      priceDel() { cat.items[ii].prices.splice(+el.dataset.pi, 1); },
      imgDel() { setPath(state, el.dataset.path, ''); },
      accent() { state.venue.theme.accent = el.dataset.c; },
      set() { setPath(state, el.dataset.path, el.dataset.v); },
      rangeAdd() { state.hours.days[el.dataset.d].push(['19:00', '23:00']); },
      rangeDel() { state.hours.days[el.dataset.d].splice(+el.dataset.ri, 1); },
      dayCopy() {
        const src = JSON.stringify(state.hours.days[el.dataset.d]);
        C.DAYS.forEach(d => { state.hours.days[d.id] = JSON.parse(src); });
        toast('Orari copiati su tutta la settimana');
      },
      counterAdd() { state.qr.counters.push(''); setTimeout(() => { const l = view.querySelectorAll('[data-k^="qr.counters."]'); l[l.length - 1].focus(); }, 30); },
      counterDel() { state.qr.counters.splice(+el.dataset.i, 1); },
      dlPng() { downloadPng(qrPoints()[+el.dataset.i]); return 'noRender'; },
      dlSvg() { const p = qrPoints()[+el.dataset.i]; download(new Blob([qrSvg(p.url, 4)], { type: 'image/svg+xml' }), fileName(p.label, 'svg')); return 'noRender'; },
      copyUrl() { copy(qrPoints()[+el.dataset.i].url); return 'noRender'; },
      nfc() { nfcDialog(qrPoints()[+el.dataset.i]); return 'noRender'; },
      print() { printCards(el.dataset.kind); return 'noRender'; },
      ghSave() { ghSave(); return 'noRender'; },
      ghLogout() {
        if (!confirm('Rimuovere il token da questo browser? Il menu online non cambia.')) return false;
        gh.token = ''; saveGh(); toast('Dispositivo scollegato');
        return 'noSave';
      },
      export() {
        const d = new Date().toISOString().slice(0, 10);
        download(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }), `menu-${C.slug(state.venue.name)}-${d}.json`);
        return 'noRender';
      },
      discard() {
        if (!confirm('Tornare alla versione pubblicata? Le modifiche non pubblicate andranno perse.')) return false;
        state = JSON.parse(publishedStr);
        try { localStorage.removeItem(LS_DRAFT); } catch (err) { /* ignora */ }
        toast('Modifiche annullate');
      }
    };
    const fn = A[act];
    if (!fn) return;
    e.preventDefault();
    const res = fn();
    if (res === false || res === 'noRender') return;
    if (res !== 'noSave') changed();
    render();
  }

  /* ---------- GitHub ---------- */
  function detectRepo() {
    const host = location.hostname;
    const m = /^([^.]+)\.github\.io$/i.exec(host);
    if (!m) return { owner: '', repo: '' };
    const seg = location.pathname.split('/').filter(Boolean);
    const repo = seg.length > 1 || (seg.length === 1 && seg[0] !== 'admin') ? seg[0] : `${m[1]}.github.io`;
    return { owner: m[1], repo: repo === 'admin' ? `${m[1]}.github.io` : repo };
  }
  function loadGh() {
    let g = {};
    try { g = JSON.parse(localStorage.getItem('menuGithub:' + new URL('../', location.href).pathname) || '{}'); } catch (e) { /* ignora */ }
    const d = detectRepo();
    return { owner: g.owner || d.owner, repo: g.repo || d.repo, branch: g.branch || 'main', token: g.token || '' };
  }
  function saveGh() { try { localStorage.setItem(LS_GH, JSON.stringify(gh)); } catch (e) { /* ignora */ } }
  function connected() { return !!(gh.owner && gh.repo && gh.token); }

  async function ghApi(path, opts) {
    opts = opts || {};
    const r = await fetch('https://api.github.com' + path, {
      method: opts.method || 'GET',
      headers: Object.assign({
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + gh.token,
        'X-GitHub-Api-Version': '2022-11-28'
      }, opts.body ? { 'Content-Type': 'application/json' } : {}),
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store'
    });
    if (!r.ok) {
      let msg = '';
      try { msg = (await r.json()).message; } catch (e) { /* ignora */ }
      const err = new Error(ghErrorText(r.status, msg));
      err.status = r.status;
      throw err;
    }
    return r.status === 204 ? null : r.json();
  }
  function ghErrorText(status, msg) {
    if (status === 401) return 'Token non valido o scaduto.';
    if (status === 403) return 'Il token non ha il permesso di scrittura (Contents: Read and write).';
    if (status === 404) return 'Repository o file non trovato: controlla utente, repository e accesso del token.';
    if (status === 409) return 'Conflitto: il file è cambiato nel frattempo, riprova.';
    if (status === 422) return 'Richiesta non valida' + (msg ? ': ' + msg : '.');
    return 'Errore GitHub ' + status + (msg ? ': ' + msg : '');
  }
  const repoPath = p => `/repos/${encodeURIComponent(gh.owner)}/${encodeURIComponent(gh.repo)}${p || ''}`;

  function b64ToText(b64) {
    const bin = atob(b64.replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function bytesToB64(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  async function ghGetFile(path) {
    const j = await ghApi(repoPath(`/contents/${path}?ref=${encodeURIComponent(gh.branch)}`));
    return { sha: j.sha, text: b64ToText(j.content || '') };
  }
  async function ghPutFile(path, b64, message, sha) {
    return ghApi(repoPath(`/contents/${path}`), {
      method: 'PUT',
      body: Object.assign({ message, content: b64, branch: gh.branch }, sha ? { sha } : {})
    });
  }

  async function ghSave() {
    gh.owner = document.getElementById('ghOwner').value.trim();
    gh.repo = document.getElementById('ghRepo').value.trim();
    gh.branch = document.getElementById('ghBranch').value.trim() || 'main';
    gh.token = document.getElementById('ghToken').value.trim();
    const msg = document.getElementById('ghMsg');
    if (!connected()) { msg.textContent = 'Compila tutti i campi.'; return; }
    msg.textContent = 'Verifica in corso…';
    try {
      const repo = await ghApi(repoPath());
      if (repo.permissions && !repo.permissions.push) throw new Error('Il token può leggere ma non scrivere sul repository.');
      saveGh();
      toast('Repository collegato');
      render();
    } catch (err) {
      msg.textContent = err.message;
      msg.style.color = 'var(--danger)';
    }
  }

  let publishing = false;
  async function publish() {
    if (publishing) return;
    if (!connected()) {
      tab = 'impostazioni'; render();
      toast('Collega prima il repository GitHub', true);
      return;
    }
    const btn = document.getElementById('publishBtn');
    publishing = true; btn.disabled = true; btn.textContent = 'Pubblico…';
    const next = JSON.parse(JSON.stringify(state));
    next.updatedAt = new Date().toISOString();
    const body = JSON.stringify(next, null, 2) + '\n';
    const b64 = bytesToB64(new TextEncoder().encode(body));
    const attempt = async () => {
      let sha;
      try { sha = (await ghApi(repoPath(`/contents/${DATA_PATH}?ref=${encodeURIComponent(gh.branch)}`))).sha; }
      catch (err) { if (err.status !== 404) throw err; }
      await ghPutFile(DATA_PATH, b64, `Aggiorna menu (${new Date().toLocaleString('it-IT')})`, sha);
    };
    try {
      try { await attempt(); } catch (err) { if (err.status === 409) await attempt(); else throw err; }
      state = next;
      publishedStr = JSON.stringify(state);
      try { localStorage.removeItem(LS_DRAFT); } catch (e) { /* ignora */ }
      toast('Pubblicato! Il menu online si aggiorna in circa un minuto');
    } catch (err) {
      toast(err.message, true);
    } finally {
      publishing = false;
      btn.textContent = 'Pubblica';
      render();
    }
  }

  async function uploadImage(file, max) {
    if (!connected()) throw new Error('Per caricare immagini collega prima il repository (Impostazioni).');
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(bmp.width * scale);
    cv.height = Math.round(bmp.height * scale);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    let blob = await new Promise(r => cv.toBlob(r, 'image/webp', 0.85));
    if (!blob || blob.type !== 'image/webp') blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.85));
    const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
    const name = `data/img/${C.slug(file.name.replace(/\.[^.]+$/, '')).slice(0, 30)}-${Date.now().toString(36)}.${ext}`;
    const b64 = bytesToB64(new Uint8Array(await blob.arrayBuffer()));
    await ghPutFile(name, b64, 'Carica immagine ' + name);
    imgCache[name] = URL.createObjectURL(blob);
    return name;
  }

  /* ---------- Varie ---------- */
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('Link copiato'); }
    catch (e) { prompt('Copia il link:', text); }
  }
  let toastT = null;
  function toast(msg, err) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show' + (err ? ' err' : '');
    clearTimeout(toastT);
    toastT = setTimeout(() => { t.className = 'toast'; }, err ? 5000 : 2600);
  }
})();
