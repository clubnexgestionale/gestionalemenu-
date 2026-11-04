/* ===== Menu pubblico ===== */
(function () {
  'use strict';
  const { ALLERGENS, TAGS, DAYS, JS_DAY, esc, formatPrice, openStatus, formatRanges, readableOn } = window.MenuCommon;
  const app = document.getElementById('app');
  const params = new URLSearchParams(location.search);
  const preview = params.has('anteprima');
  let where = '';

  let data = null;
  let currentSection = 0;
  let query = '';

  function loadData() {
    if (preview) {
      try {
        const d = localStorage.getItem('menuDraft:' + new URL('./', location.href).pathname);
        if (d) return Promise.resolve(JSON.parse(d));
      } catch (e) { /* ignora */ }
    }
    return fetch('data/menu.json?v=' + Date.now(), { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
  }

  loadData()
    .then(json => {
      data = json;
      const prefix = (data.qr && data.qr.prefix) || 'Tavolo';
      where = params.get('t') ? prefix + ' ' + params.get('t') : (params.get('b') || '');
      if (preview) {
        const bar = document.createElement('div');
        bar.textContent = 'Anteprima della bozza · non ancora pubblicata';
        bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:50;background:#1f1a14;color:#fff;text-align:center;font:600 13px/1 system-ui,sans-serif;padding:11px';
        document.body.appendChild(bar);
      }
      const want = params.get('s');
      const idx = data.sections.findIndex(s => s.id === want);
      if (idx >= 0) currentSection = idx;
      applyTheme();
      render();
      setInterval(renderStatus, 60000);
    })
    .catch(() => {
      app.innerHTML = '<div class="error">Il menu non è disponibile in questo momento. Riprova tra poco.</div>';
    });

  function applyTheme() {
    const v = data.venue || {};
    const t = v.theme || {};
    const root = document.documentElement;
    if (t.accent) {
      root.style.setProperty('--accent', t.accent);
      root.style.setProperty('--on-accent', readableOn(t.accent));
    }
    if (t.mode === 'light' || t.mode === 'dark') root.dataset.theme = t.mode;
    if (t.style) root.dataset.style = t.style;
    document.title = (v.name || 'Menu') + ' · Menu';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(root).getPropertyValue('--bg').trim() || '#f6f1e8';
  }

  function statusHtml() {
    const st = openStatus(data.hours);
    if (st.open) return `<span class="pill open"><span class="dot"></span>Aperto ora · chiude alle ${esc(st.until)}</span>`;
    const nxt = st.next ? ` · apre ${esc(st.next.day)} alle ${esc(st.next.time)}` : '';
    return `<span class="pill closed"><span class="dot"></span>Chiuso${nxt}</span>`;
  }
  function renderStatus() {
    const el = document.getElementById('status');
    if (el) el.innerHTML = statusHtml();
  }

  function priceHtml(item) {
    const cur = data.venue.currency || '€';
    return (item.prices || []).filter(p => p.value !== '' && p.value != null).map(p =>
      `<span class="p">${p.label ? `<span class="lbl">${esc(p.label)}</span>` : ''}${formatPrice(p.value, cur)}</span>`
    ).join('');
  }

  function itemHtml(item) {
    const tags = (item.tags || []).map(id => {
      const t = TAGS.find(x => x.id === id);
      return t ? `<span class="tag ${t.id}">${esc(t.id === 'surgelato' ? '* Surgelato' : t.label)}</span>` : '';
    }).join('');
    const alg = (item.allergens || []).length
      ? `<span class="alg" title="Allergeni: ${esc(item.allergens.map(n => (ALLERGENS.find(a => a.n === n) || {}).name).join(', '))}">${item.allergens.map(n => `<span>${n}</span>`).join('')}</span>`
      : '';
    const img = item.image ? `<img class="thumb" src="${esc(item.image)}" alt="" loading="lazy">` : '';
    return `<li class="item${item.available === false ? ' off' : ''}${img ? ' has-img' : ''}">
      ${img}
      <div class="name">${esc(item.name)}</div>
      <div class="prices">${priceHtml(item)}</div>
      ${item.description ? `<p class="desc">${esc(item.description)}</p>` : ''}
      ${tags || alg ? `<div class="meta">${tags}${alg}</div>` : ''}
    </li>`;
  }

  function matches(item) {
    if (!query) return true;
    const q = query.toLowerCase();
    return (item.name + ' ' + (item.description || '')).toLowerCase().includes(q);
  }

  function render() {
    const v = data.venue || {};
    const section = data.sections[currentSection] || { categories: [] };
    const cats = section.categories.filter(c => c.items && c.items.length);

    const catsHtml = cats.map(c => {
      const items = c.items.filter(matches);
      if (!items.length) return '';
      return `<section class="category" id="cat-${esc(c.id)}">
        <h2>${esc(c.name)}</h2>
        ${c.description ? `<p class="cat-desc">${esc(c.description)}</p>` : ''}
        <ul class="items">${items.map(itemHtml).join('')}</ul>
      </section>`;
    }).join('');

    const todayId = JS_DAY[new Date().getDay()];
    const hoursRows = DAYS.map(d =>
      `<tr class="${d.id === todayId ? 'today' : ''}"><td>${d.label}</td><td>${esc(formatRanges((data.hours.days || {})[d.id]))}</td></tr>`
    ).join('');

    const contacts = [];
    if (v.address) contacts.push(`<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.address)}" target="_blank" rel="noopener">${icon('pin')}${esc(v.address)}</a>`);
    if (v.phone) contacts.push(`<a href="tel:${esc(v.phone.replace(/\s+/g, ''))}">${icon('phone')}${esc(v.phone)}</a>`);
    if (v.instagram) contacts.push(`<a href="https://instagram.com/${esc(v.instagram.replace(/^@/, ''))}" target="_blank" rel="noopener">${icon('ig')}@${esc(v.instagram.replace(/^@/, ''))}</a>`);
    if (v.website) contacts.push(`<a href="${esc(v.website)}" target="_blank" rel="noopener">${icon('web')}Sito web</a>`);

    app.innerHTML = `
      <header class="hero"><div class="wrap">
        ${v.logo ? `<img class="logo" src="${esc(v.logo)}" alt="">` : ''}
        <h1>${esc(v.name || 'Menu')}</h1>
        ${v.tagline ? `<p class="tagline">${esc(v.tagline)}</p>` : ''}
        <div class="badges">
          <span id="status">${statusHtml()}</span>
          ${where ? `<span class="pill where">${esc(where)}</span>` : ''}
        </div>
        ${v.notice ? `<p class="notice">${esc(v.notice)}</p>` : ''}
      </div></header>

      <nav class="nav"><div class="wrap">
        <div class="sections" role="tablist">
          ${data.sections.map((s, i) => `<button role="tab" data-sec="${i}" aria-selected="${i === currentSection}">${esc(s.name)}</button>`).join('')}
        </div>
        <div class="cats">${cats.map((c, i) => `<a href="#cat-${esc(c.id)}" class="${i === 0 ? 'active' : ''}">${esc(c.name)}</a>`).join('')}</div>
        <div class="search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input type="search" id="q" placeholder="Cerca un piatto o una bevanda" value="${esc(query)}" autocomplete="off">
        </div>
      </div></nav>

      <main><div class="wrap">
        <div id="list">${catsHtml || '<p class="empty">Nessun risultato.</p>'}</div>

        <section class="info">
          <h3>Orari</h3>
          <table class="hours">${hoursRows}</table>
          ${data.hours.note ? `<p class="hours-note">${esc(data.hours.note)}</p>` : ''}
          ${contacts.length ? `<div class="contacts">${contacts.join('')}</div>` : ''}
          <details class="legend">
            <summary>Legenda allergeni</summary>
            <div class="legend-grid">${ALLERGENS.map(a => `<span><b>${a.n}</b>${a.name}</span>`).join('')}</div>
            <p class="hours-note">I prodotti contrassegnati con * possono essere surgelati all'origine. Per informazioni su allergeni e intolleranze rivolgiti al personale.</p>
          </details>
        </section>
        <p class="foot">${esc(v.name || '')}</p>
      </div></main>`;

    bind();
  }

  function bind() {
    app.querySelectorAll('.sections button').forEach(b => b.addEventListener('click', () => {
      currentSection = +b.dataset.sec;
      query = '';
      render();
      const nav = document.querySelector('.nav');
      window.scrollTo({ top: nav.offsetTop, behavior: 'smooth' });
    }));
    const q = document.getElementById('q');
    q.addEventListener('input', () => {
      query = q.value.trim();
      const section = data.sections[currentSection];
      const html = section.categories.filter(c => c.items && c.items.length).map(c => {
        const items = c.items.filter(matches);
        if (!items.length) return '';
        return `<section class="category" id="cat-${esc(c.id)}"><h2>${esc(c.name)}</h2><ul class="items">${items.map(itemHtml).join('')}</ul></section>`;
      }).join('');
      document.getElementById('list').innerHTML = html || '<p class="empty">Nessun risultato.</p>';
    });
    // Evidenzia la categoria visibile
    const links = [...app.querySelectorAll('.cats a')];
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        links.forEach(l => {
          const on = l.getAttribute('href') === '#' + e.target.id;
          l.classList.toggle('active', on);
          if (on) l.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
        });
      });
    }, { rootMargin: '-160px 0px -60% 0px' });
    app.querySelectorAll('.category').forEach(s => obs.observe(s));
  }

  function icon(name) {
    const p = {
      pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
      phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
      ig: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/>',
      web: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'
    }[name];
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  }
})();
