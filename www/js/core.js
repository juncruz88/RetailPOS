/* Store POS — core: constants, helpers, storage, modal, router */
'use strict';

const STORE_KEY = 'storepos.v1';
const DB_VERSION = 1;

const CURRENCIES = [
  ['PHP', 'Philippine Peso'],
  ['USD', 'US Dollar'],
  ['EUR', 'Euro'],
  ['JPY', 'Japanese Yen'],
  ['GBP', 'British Pound'],
  ['AUD', 'Australian Dollar'],
  ['SGD', 'Singapore Dollar'],
  ['HKD', 'Hong Kong Dollar'],
  ['CAD', 'Canadian Dollar'],
  ['AED', 'UAE Dirham']
];

/* Units marked here are sold by weight/measure, so quantities allow decimals */
const UNITS = [
  ['pc', 'piece'], ['kg', 'kilogram'], ['g', 'gram'], ['L', 'liter'],
  ['m', 'meter'], ['box', 'box'], ['pack', 'pack'], ['sack', 'sack'], ['dozen', 'dozen']
];
const DECIMAL_UNITS = ['kg', 'g', 'L', 'm'];

const AR_PAY_METHODS = ['Cash', 'Credit card', 'GCash', 'Maya', 'Bank transfer', 'Check', 'Other'];

const DEFAULT_SETTINGS = {
  storeName: 'My Sari-Sari Store',
  owner: '',
  address: '',
  currency: 'PHP',
  footer: 'Thank you, come again!',
  counter: 1
};

let db = null;

const ui = {
  view: 'sales',
  sales: { search: '', cart: [], discount: 0 },
  inv: { search: '', filter: 'all' },
  ar: { search: '' },
  rep: { mode: 'daily', day: '', month: '', year: '', salesQ: '', histRange: '30' }
};

const ACTIONS = {};
const INPUTS = {};
const CHANGES = {};

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */
function $(sel, root) { return (root || document).querySelector(sel); }
function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

function uid(prefix) {
  return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function round(n, digits) {
  const d = typeof digits === 'number' ? digits : 2;
  const f = Math.pow(10, d);
  return Math.round((Number(n) || 0) * f) / f;
}

function round2(n) { return round(n, 2); }

function num(v, fallback) {
  if (typeof v === 'number') return isFinite(v) ? v : (fallback || 0);
  const s = String(v == null ? '' : v).replace(/[₱,\s]/g, '').trim();
  if (s === '') return fallback || 0;
  const n = parseFloat(s);
  return isNaN(n) ? (fallback || 0) : n;
}

function isDecimalUnit(unit) { return DECIMAL_UNITS.indexOf(unit) !== -1; }

function clampQty(qty, unit) {
  const n = Number(qty) || 0;
  return isDecimalUnit(unit) ? Math.max(0, round(n, 3)) : Math.max(0, Math.round(n));
}

function fmtQty(qty, unit) {
  const n = Number(qty) || 0;
  if (isDecimalUnit(unit)) return String(round(n, 3));
  return String(Math.round(n));
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function currencyCode() { return (db && db.settings && db.settings.currency) || 'PHP'; }

function money(n) {
  const v = Number(n) || 0;
  try {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: currencyCode(),
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(v);
  } catch (err) {
    return currencyCode() + ' ' + v.toFixed(2);
  }
}

function symbolOf(code) {
  try {
    const parts = new Intl.NumberFormat('en-PH', {
      style: 'currency', currency: code || currencyCode(), currencyDisplay: 'narrowSymbol'
    }).formatToParts(0);
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].type === 'currency') return parts[i].value;
    }
  } catch (err) { /* ignore */ }
  return code || 'PHP';
}

function pad2(n) { return n < 10 ? '0' + n : String(n); }

function dayKey(d) {
  const x = new Date(d);
  return x.getFullYear() + '-' + pad2(x.getMonth() + 1) + '-' + pad2(x.getDate());
}
function monthKey(d) {
  const x = new Date(d);
  return x.getFullYear() + '-' + pad2(x.getMonth() + 1);
}
function parseDayKey(k) {
  const p = String(k || '').split('-');
  return new Date(Number(p[0]) || 1970, (Number(p[1]) || 1) - 1, Number(p[2]) || 1);
}
function parseMonthKey(k) {
  const p = String(k || '').split('-');
  return new Date(Number(p[0]) || 1970, (Number(p[1]) || 1) - 1, 1);
}
function toDateSafe(value, fallbackIso) {
  const d = value ? new Date(value) : null;
  if (!d || isNaN(d.getTime())) return fallbackIso || new Date().toISOString();
  return d.toISOString();
}

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(v) {
  const d = new Date(v);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtTime(v) {
  const d = new Date(v);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}
function fmtDateTime(v) {
  return fmtDate(v) + ' · ' + fmtTime(v);
}
function fmtDayLabel(key) {
  const d = parseDayKey(key);
  return MONTHS_SHORT[d.getMonth()] + ' ' + d.getDate();
}
function fmtMonthLabel(key) {
  const d = parseMonthKey(key);
  return MONTHS_SHORT[d.getMonth()] + ' ' + d.getFullYear();
}
function todayInput() {
  const d = new Date();
  return dayKey(d);
}

/* ------------------------------------------------------------------ */
/* CSV + file helpers                                                  */
/* ------------------------------------------------------------------ */
function csvCell(v) {
  const s = v == null ? '' : String(v);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function toCSV(rows) {
  return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
}
function parseCSV(text) {
  const src = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      field += ch; i += 1; continue;
    }
    if (ch === '"') { inQuotes = true; i += 1; continue; }
    if (ch === ',') { row.push(field); field = ''; i += 1; continue; }
    if (ch === '\r') { i += 1; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i += 1; continue; }
    field += ch; i += 1;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(function (r) {
    return r.length && !(r.length === 1 && String(r[0]).trim() === '');
  });
}
function csvObjects(rows) {
  if (!rows.length) return [];
  const head = rows[0].map(function (h) { return String(h).trim().toLowerCase(); });
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const o = {};
    for (let c = 0; c < head.length; c++) o[head[c]] = rows[i][c] == null ? '' : String(rows[i][c]).trim();
    out.push(o);
  }
  return out;
}

function toBase64(str) {
  const bytes = new TextEncoder().encode(String(str));
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function stamp() {
  const d = new Date();
  return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-' + pad2(d.getHours()) + pad2(d.getMinutes());
}

function saveFile(filename, text, mime) {
  mime = mime || 'text/plain;charset=utf-8';
  if (window.AndroidSaver && typeof window.AndroidSaver.saveFile === 'function') {
    try {
      window.AndroidSaver.saveFile(filename, String(mime).split(';')[0], toBase64(text));
      toast('Saved to Downloads: ' + filename, 'ok');
      return;
    } catch (err) { /* fall back to a browser download */ }
  }
  try {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 2000);
    toast('Downloaded ' + filename, 'ok');
  } catch (err) {
    toast('Could not save the file on this device', 'err');
  }
}

function readTextFile(file, done) {
  const reader = new FileReader();
  reader.onload = function () { done(String(reader.result || '')); };
  reader.onerror = function () { toast('Could not read that file', 'err'); };
  reader.readAsText(file);
}

/* ------------------------------------------------------------------ */
/* toast + modal                                                       */
/* ------------------------------------------------------------------ */
let toastTimer = null;
function toast(msg, kind) {
  const box = document.getElementById('toast');
  if (!box) return;
  box.textContent = msg;
  box.className = 'toast show' + (kind === 'err' ? ' err' : kind === 'ok' ? ' ok' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { box.className = 'toast'; }, 2800);
}

const MODALS = [];

function openModal(spec) {
  MODALS.push(spec);
  renderModal();
}

function closeModal() {
  const s = MODALS.pop();
  if (s && typeof s.onClose === 'function') {
    try { s.onClose(); } catch (err) { console.error(err); }
  }
  renderModal();
}

function closeAllModals() {
  while (MODALS.length) closeModal();
}

function renderModal() {
  const root = document.getElementById('modalRoot');
  if (!root) return;
  if (!MODALS.length) { root.innerHTML = ''; return; }
  const toastBox = document.getElementById('toast');
  if (toastBox) toastBox.className = 'toast';
  const s = MODALS[MODALS.length - 1];
  root.innerHTML =
    '<div class="modal-backdrop" data-modal-backdrop>' +
      '<div class="modal ' + (s.size || '') + '" role="dialog" aria-modal="true">' +
        '<div class="modal-head">' +
          '<h3>' + esc(s.title || '') + '</h3>' +
          '<button type="button" class="modal-close" data-act="modal-close" aria-label="Close">×</button>' +
        '</div>' +
        '<div class="modal-body">' + (s.body || '') + '</div>' +
        (s.foot ? '<div class="modal-foot ' + (s.footClass || '') + '">' + s.foot + '</div>' : '') +
      '</div>' +
    '</div>';
  if (typeof s.onMount === 'function') {
    try { s.onMount(root.firstElementChild, root); } catch (err) { console.error(err); }
  }
}

function confirmDialog(o) {
  openModal({
    title: o.title || 'Please confirm',
    body: '<p>' + esc(o.message || '') + '</p>' + (o.detail ? '<p class="note">' + esc(o.detail) + '</p>' : ''),
    foot: '<button type="button" class="btn" data-act="modal-close">Cancel</button>' +
      (o.confirmLabel ? '<button type="button" class="btn ' + (o.kind === 'danger' ? 'danger' : 'primary') + '" id="confirmYes">' + esc(o.confirmLabel) + '</button>' : ''),
    onMount: function (root) {
      const yes = root.querySelector('#confirmYes');
      if (!yes) return;
      yes.addEventListener('click', function () {
        closeModal();
        if (typeof o.onConfirm === 'function') o.onConfirm();
      });
    }
  });
}

/* ------------------------------------------------------------------ */
/* data store                                                          */
/* ------------------------------------------------------------------ */
function blankDB() {
  return {
    version: DB_VERSION,
    settings: Object.assign({}, DEFAULT_SETTINGS),
    items: [],
    sales: [],
    clients: [],
    charges: [],
    payments: []
  };
}

function makeItem(name, barcode, unit, cost, price, stock, reorder, category) {
  return {
    id: uid('itm'), name: name, barcode: barcode, sku: '', category: category || '',
    unit: unit, cost: cost, price: price, stock: stock, reorder: reorder,
    active: true, created: new Date().toISOString()
  };
}

function seedDB() {
  const fresh = blankDB();
  const items = [
    makeItem('Lucky Me Pancit Canton', '4800016641001', 'pc', 12.5, 15, 120, 24, 'Noodles'),
    makeItem('Coca-Cola 1.5L', '4801981111004', 'pc', 52, 65, 48, 12, 'Beverages'),
    makeItem('Pandesal', '4800000000012', 'pc', 2, 3, 60, 20, 'Bakery'),
    makeItem('Rice (Sinandomeng)', '8000000000017', 'kg', 44, 52, 85.5, 25, 'Staples'),
    makeItem('Egg (Medium)', '8000000000024', 'pc', 7.5, 9, 90, 30, 'Fresh'),
    makeItem('Cooking Oil 1L', '4800088112008', 'pc', 68, 82, 22, 8, 'Grocery'),
    makeItem('Sugar (White)', '8000000000031', 'kg', 58, 68, 18.25, 10, 'Staples'),
    makeItem('Safeguard Soap 130g', '4800888142011', 'pc', 34, 45, 6, 10, 'Personal Care')
  ];
  fresh.items = items;

  const client = {
    id: uid('cli'), name: 'Nena Cruz (suki)', phone: '0917 555 0123',
    address: 'Purok 2, Brgy. San Isidro', notes: 'Neighbor store owner — settles weekly.',
    created: new Date().toISOString()
  };
  fresh.clients = [client];

  let counter = 1;
  const at = function (daysAgo, hh, mm) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hh, mm, 0, 0);
    return d.toISOString();
  };

  function addSale(daysAgo, hh, mm, picks, method, clientId) {
    const lines = picks.map(function (p) {
      const it = items[p[0]];
      return {
        itemId: it.id, name: it.name, unit: it.unit,
        qty: p[1], price: it.price, cost: it.cost, total: round2(p[1] * it.price)
      };
    });
    const subtotal = round2(lines.reduce(function (a, l) { return a + l.total; }, 0));
    const cost = round2(lines.reduce(function (a, l) { return a + l.cost * l.qty; }, 0));
    const sale = {
      id: uid('sal'), no: 'INV-' + String(counter++).padStart(4, '0'),
      date: at(daysAgo, hh, mm), lines: lines, subtotal: subtotal, discount: 0,
      total: subtotal, cost: cost, method: method, clientId: clientId || null,
      received: 0, change: 0
    };
    if (method === 'cash') {
      sale.received = Math.ceil(subtotal / 50) * 50;
      sale.change = round2(sale.received - subtotal);
    }
    fresh.sales.push(sale);
    return sale;
  }

  addSale(0, 8, 42, [[0, 3], [2, 6]], 'cash');
  addSale(0, 12, 15, [[1, 2], [4, 6], [6, 0.75]], 'cash');
  addSale(1, 16, 20, [[0, 4], [1, 2], [3, 2.5]], 'cash');
  addSale(1, 17, 5, [[5, 1], [7, 2]], 'credit', client.id);
  addSale(38, 9, 30, [[0, 6], [2, 10], [4, 12]], 'cash');

  const creditSale = fresh.sales[3];
  fresh.charges.push({
    id: uid('chg'), clientId: client.id, date: creditSale.date,
    description: 'Credit sale ' + creditSale.no, amount: creditSale.total,
    dueDate: null, saleId: creditSale.id
  });
  fresh.payments.push({
    id: uid('pay'), clientId: client.id, date: at(0, 9, 15), amount: 100,
    method: 'Cash', reference: '', note: 'Partial payment'
  });

  fresh.settings.counter = counter;
  return fresh;
}

function migrate(raw) {
  if (!raw || typeof raw !== 'object') return blankDB();
  const base = blankDB();
  const out = Object.assign(base, raw);
  out.settings = Object.assign({}, base.settings, raw.settings || {});
  ['items', 'sales', 'clients', 'charges', 'payments'].forEach(function (k) {
    if (!Array.isArray(out[k])) out[k] = [];
  });
  out.version = DB_VERSION;
  if (!out.settings.counter) out.settings.counter = out.sales.length + 1;
  return out;
}

function loadDB() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return seedDB();
    return migrate(JSON.parse(raw));
  } catch (err) {
    console.error('Could not read saved data', err);
    return seedDB();
  }
}

function saveDB() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(db));
    return true;
  } catch (err) {
    console.error(err);
    toast('Device storage is full — export a backup now', 'err');
    return false;
  }
}

function itemById(id) {
  for (let i = 0; i < db.items.length; i++) if (db.items[i].id === id) return db.items[i];
  return null;
}
function clientById(id) {
  for (let i = 0; i < db.clients.length; i++) if (db.clients[i].id === id) return db.clients[i];
  return null;
}
function clientBalance(clientId) {
  let charges = 0, pays = 0;
  db.charges.forEach(function (c) { if (c.clientId === clientId) charges += Number(c.amount) || 0; });
  db.payments.forEach(function (p) { if (p.clientId === clientId) pays += Number(p.amount) || 0; });
  return round2(charges - pays);
}
function totalReceivable() {
  let t = 0;
  db.clients.forEach(function (c) { t += clientBalance(c.id); });
  return round2(t);
}
function lowStockItems() {
  return db.items.filter(function (i) {
    return i.active !== false && Number(i.stock) <= Number(i.reorder || 0);
  }).sort(function (a, b) {
    return (Number(a.stock) - Number(a.reorder || 0)) - (Number(b.stock) - Number(b.reorder || 0));
  });
}

/* ------------------------------------------------------------------ */
/* chrome + router                                                     */
/* ------------------------------------------------------------------ */
function updateChrome() {
  const s = db.settings;
  const nameEl = document.getElementById('storeName');
  if (nameEl) nameEl.textContent = s.storeName || 'My Store';
  const subEl = document.getElementById('storeSub');
  if (subEl) {
    subEl.textContent = (s.owner ? s.owner + ' · ' : '') + currencyCode() + ' · offline register';
  }
  const logo = document.getElementById('logo');
  if (logo) logo.textContent = symbolOf(s.currency);
  const pill = document.getElementById('registerPill');
  if (pill) pill.textContent = new Date().toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
  document.title = (s.storeName || 'Store POS') + ' — POS';
}

const VIEWS = {};

function show(view) {
  ui.view = view;
  $$('#nav button').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-view') === view);
  });
  render();
}

function render() {
  if (!db) return;
  updateChrome();
  const fn = VIEWS[ui.view];
  const main = document.getElementById('main');
  if (!fn || !main) return;
  main.innerHTML = '';
  fn(main);
}

/* ------------------------------------------------------------------ */
/* global event wiring                                                 */
/* ------------------------------------------------------------------ */
document.addEventListener('click', function (e) {
  const backdrop = e.target.closest ? e.target.closest('[data-modal-backdrop]') : null;
  if (backdrop && e.target === backdrop) { closeModal(); return; }
  const t = e.target.closest ? e.target.closest('[data-act]') : null;
  if (!t) return;
  const fn = ACTIONS[t.getAttribute('data-act')];
  if (!fn) return;
  e.preventDefault();
  try { fn(t, e); } catch (err) { console.error(err); toast('Something went wrong: ' + err.message, 'err'); }
});

ACTIONS['modal-close'] = function () { closeModal(); };

document.addEventListener('input', function (e) {
  const fn = INPUTS[e.target.id];
  if (fn) fn(e.target, e);
});

document.addEventListener('change', function (e) {
  const fn = CHANGES[e.target.id];
  if (fn) fn(e.target, e);
});

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && MODALS.length) { e.preventDefault(); closeModal(); }
});

document.addEventListener('click', function (e) {
  const nav = e.target.closest ? e.target.closest('#nav button') : null;
  if (nav) show(nav.getAttribute('data-view'));
});

window.__androidBack = function () {
  if (MODALS.length) { closeModal(); return true; }
  if (ui.view !== 'sales') { show('sales'); return true; }
  return false;
};
