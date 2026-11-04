/* Funzioni condivise tra menu pubblico e gestionale */
(function (global) {
  'use strict';

  // I 14 allergeni del Reg. UE 1169/2011
  const ALLERGENS = [
    { n: 1, name: 'Glutine' },
    { n: 2, name: 'Crostacei' },
    { n: 3, name: 'Uova' },
    { n: 4, name: 'Pesce' },
    { n: 5, name: 'Arachidi' },
    { n: 6, name: 'Soia' },
    { n: 7, name: 'Latte e lattosio' },
    { n: 8, name: 'Frutta a guscio' },
    { n: 9, name: 'Sedano' },
    { n: 10, name: 'Senape' },
    { n: 11, name: 'Sesamo' },
    { n: 12, name: 'Solfiti' },
    { n: 13, name: 'Lupini' },
    { n: 14, name: 'Molluschi' }
  ];

  const TAGS = [
    { id: 'vegetariano', label: 'Vegetariano', short: 'V' },
    { id: 'vegano', label: 'Vegano', short: 'VG' },
    { id: 'senza-glutine', label: 'Senza glutine', short: 'GF' },
    { id: 'piccante', label: 'Piccante', short: '🌶' },
    { id: 'consigliato', label: 'Consigliato', short: '★' },
    { id: 'novita', label: 'Novità', short: 'NEW' },
    { id: 'surgelato', label: 'Prodotto surgelato', short: '*' }
  ];

  const DAYS = [
    { id: 'mon', label: 'Lunedì' },
    { id: 'tue', label: 'Martedì' },
    { id: 'wed', label: 'Mercoledì' },
    { id: 'thu', label: 'Giovedì' },
    { id: 'fri', label: 'Venerdì' },
    { id: 'sat', label: 'Sabato' },
    { id: 'sun', label: 'Domenica' }
  ];
  // Date.getDay(): 0 = domenica
  const JS_DAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function formatPrice(value, currency) {
    if (value === '' || value == null) return '';
    const num = Number(String(value).replace(',', '.'));
    if (isNaN(num)) return esc(value);
    const txt = num.toLocaleString('it-IT', {
      minimumFractionDigits: Number.isInteger(num) ? 0 : 2,
      maximumFractionDigits: 2
    });
    return (currency || '€') + ' ' + txt;
  }

  function toMin(hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
    if (!m) return null;
    return (+m[1]) * 60 + (+m[2]);
  }

  /* Stato apertura: gestisce fasce che superano la mezzanotte (es. 19:00–02:00) */
  function openStatus(hours, now) {
    now = now || new Date();
    const days = (hours && hours.days) || {};
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const today = JS_DAY[now.getDay()];
    const yesterday = JS_DAY[(now.getDay() + 6) % 7];

    // 1) fasce di ieri che sforano oltre la mezzanotte
    for (const r of days[yesterday] || []) {
      const a = toMin(r[0]), b = toMin(r[1]);
      if (a == null || b == null) continue;
      if (b <= a && nowMin < b) return { open: true, until: r[1] };
    }
    // 2) fasce di oggi
    for (const r of days[today] || []) {
      const a = toMin(r[0]), b = toMin(r[1]);
      if (a == null || b == null) continue;
      if (b > a ? (nowMin >= a && nowMin < b) : nowMin >= a) return { open: true, until: r[1] };
    }
    // 3) prossima apertura
    for (let i = 0; i < 8; i++) {
      const d = JS_DAY[(now.getDay() + i) % 7];
      const ranges = (days[d] || []).slice().sort((x, y) => toMin(x[0]) - toMin(y[0]));
      for (const r of ranges) {
        const a = toMin(r[0]);
        if (a == null) continue;
        if (i === 0 && a <= nowMin) continue;
        const dayLabel = i === 0 ? 'oggi' : i === 1 ? 'domani' : DAYS.find(x => x.id === d).label.toLowerCase();
        return { open: false, next: { day: dayLabel, time: r[0] } };
      }
    }
    return { open: false, next: null };
  }

  function formatRanges(ranges) {
    if (!ranges || !ranges.length) return 'Chiuso';
    return ranges.map(r => r[0] + '–' + r[1]).join(' · ');
  }

  function uid(prefix) {
    return (prefix || 'x') + Math.random().toString(36).slice(2, 8);
  }

  function slug(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || uid('c');
  }

  /* Colore di testo leggibile sopra un colore d'accento */
  function readableOn(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#fff';
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return l > 0.6 ? '#1b1712' : '#ffffff';
  }

  global.MenuCommon = { ALLERGENS, TAGS, DAYS, JS_DAY, esc, formatPrice, openStatus, formatRanges, toMin, uid, slug, readableOn };
})(window);
