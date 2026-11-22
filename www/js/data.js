/* Store POS — backup/restore, settings, help and boot */
'use strict';

let pendingImport = { kind: 'json', mode: 'replace', entity: 'items' };

/* ------------------------------------------------------------------ */
/* backup view                                                         */
/* ------------------------------------------------------------------ */
VIEWS.backup = function (main) {
  const bytes = new Blob([JSON.stringify(db)]).size;
  const kb = Math.max(1, Math.round(bytes / 1024));
  const sales = db.sales.length;
  main.innerHTML =
    '<div class="view">' +
      '<div class="view-head">' +
        '<div><h2>Backup &amp; restore</h2><p class="sub">Keep a copy of your store data, or move it to another phone.</p></div>' +
      '</div>' +
      '<div class="grid cols-3">' +
        '<div class="stat"><div class="k">Items</div><div class="v">' + db.items.length + '</div></div>' +
        '<div class="stat"><div class="k">Sales</div><div class="v">' + sales + '</div></div>' +
        '<div class="stat"><div class="k">Data size</div><div class="v">' + kb + ' KB</div><div class="n">Stored on this device</div></div>' +
      '</div>' +

      '<div class="panel">' +
        '<div class="panel-head"><h3>Full backup — JSON</h3><span class="sub">Everything: items, sales, clients, receivables</span></div>' +
        '<div class="panel-body stack">' +
          '<p class="note">The JSON file is the complete copy of the store. Use it to restore on this device or move the whole store to a new phone.</p>' +
          '<div class="inline">' +
            '<button type="button" class="btn primary" data-act="export-json">Download backup</button>' +
            '<button type="button" class="btn" data-act="import-json" data-mode="replace">Restore (replace all)</button>' +
            '<button type="button" class="btn" data-act="import-json" data-mode="merge">Merge backup</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="panel">' +
        '<div class="panel-head"><h3>Spreadsheet backup — CSV</h3><span class="sub">One file per table</span></div>' +
        '<div class="panel-body stack">' +
          '<div class="grid cols-3">' +
            [['items', 'Inventory'], ['clients', 'Clients'], ['sales', 'Sales'],
              ['receivables', 'Receivables'], ['payments', 'Payments']].map(function (e) {
              return '<button type="button" class="btn block" data-act="export-csv" data-entity="' + e[0] + '">Export ' + e[1] + '.csv</button>';
            }).join('') +
          '</div>' +
          '<hr class="hr">' +
          '<div class="grid cols-2">' +
            '<div class="field"><label for="csvEntity">Import into</label>' +
              '<select class="input" id="csvEntity">' +
                '<option value="items">Inventory items</option>' +
                '<option value="clients">Clients</option>' +
                '<option value="sales">Sales</option>' +
                '<option value="receivables">Receivables (charges)</option>' +
                '<option value="payments">Payments</option>' +
              '</select></div>' +
            '<div class="field"><label>&nbsp;</label>' +
              '<button type="button" class="btn block" data-act="import-csv">Choose CSV file…</button></div>' +
          '</div>' +
          '<p class="note">CSV import matches existing records (by barcode, name or id) and updates them, so re-importing is safe.</p>' +
        '</div>' +
      '</div>' +

      '<div class="panel">' +
        '<div class="panel-head"><h3>Danger zone</h3><span class="sub">These actions cannot be undone</span></div>' +
        '<div class="panel-body inline">' +
          '<button type="button" class="btn" data-act="load-sample">Reload sample data</button>' +
          '<button type="button" class="btn danger" data-act="clear-all">Erase all data</button>' +
        '</div>' +
      '</div>' +

      '<input type="file" id="backupFile" accept=".json,.csv,.txt,application/json,text/csv,text/plain" style="display:none">' +
    '</div>';
};

CHANGES.backupFile = function (input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const target = pendingImport;
  readTextFile(file, function (text) {
    input.value = '';
    if (target.kind === 'json') importJSON(text, target.mode);
    else importCSV(text, target.entity);
  });
};

ACTIONS['export-json'] = function () {
  const payload = {
    app: 'store-pos',
    version: DB_VERSION,
    exportedAt: new Date().toISOString(),
    settings: db.settings,
    items: db.items,
    sales: db.sales,
    clients: db.clients,
    charges: db.charges,
    payments: db.payments
  };
  saveFile('store-pos-backup-' + stamp() + '.json', JSON.stringify(payload, null, 2), 'application/json');
};

ACTIONS['import-json'] = function (t) {
  pendingImport = { kind: 'json', mode: t.getAttribute('data-mode') || 'replace' };
  const input = document.getElementById('backupFile');
  if (input) input.click();
};

ACTIONS['export-csv'] = function (t) { exportCSV(t.getAttribute('data-entity')); };

ACTIONS['import-csv'] = function () {
  const sel = document.getElementById('csvEntity');
  pendingImport = { kind: 'csv', entity: sel ? sel.value : 'items' };
  const input = document.getElementById('backupFile');
  if (input) input.click();
};

function importJSON(text, mode) {
  let data;
  try { data = JSON.parse(text); } catch (err) { toast('That file is not valid JSON', 'err'); return; }
  if (!data || typeof data !== 'object' ||
      (!Array.isArray(data.items) && !Array.isArray(data.sales) && !Array.isArray(data.clients))) {
    toast('That is not a Store POS backup file', 'err');
    return;
  }
  const incoming = migrate({
    settings: data.settings, items: data.items, sales: data.sales,
    clients: data.clients, charges: data.charges, payments: data.payments
  });
  const counts = (incoming.items.length + ' items, ' + incoming.sales.length + ' sales, ' +
    incoming.clients.length + ' clients');

  confirmDialog({
    title: mode === 'replace' ? 'Replace all data?' : 'Merge this backup?',
    message: mode === 'replace'
      ? 'Everything currently on this device will be replaced by the backup (' + counts + ').'
      : 'The backup (' + counts + ') will be merged into the current data.',
    detail: mode === 'replace' ? 'Export a backup first if you are not sure.' : '',
    confirmLabel: mode === 'replace' ? 'Replace data' : 'Merge data',
    kind: mode === 'replace' ? 'danger' : '',
    onConfirm: function () {
      if (mode === 'replace') {
        db = incoming;
        if (!db.settings.counter) db.settings.counter = db.sales.length + 1;
      } else {
        db.settings = Object.assign({}, db.settings, incoming.settings || {});
        mergeByKey(db.items, incoming.items, function (r) { return r.id || r.barcode || r.name; });
        mergeByKey(db.clients, incoming.clients, function (r) { return r.id || r.name; });
        mergeByKey(db.sales, incoming.sales, function (r) { return r.id || r.no; });
        mergeByKey(db.charges, incoming.charges, function (r) { return r.id; });
        mergeByKey(db.payments, incoming.payments, function (r) { return r.id; });
      }
      saveDB();
      render();
      toast('Backup restored', 'ok');
    }
  });
}

function mergeByKey(target, incoming, keyFn) {
  (incoming || []).forEach(function (rec) {
    if (!rec) return;
    const k = keyFn(rec);
    if (k == null) { target.push(rec); return; }
    let found = null;
    for (let i = 0; i < target.length; i++) {
      if (keyFn(target[i]) === k) { found = target[i]; break; }
    }
    if (found) Object.assign(found, rec);
    else target.push(rec);
  });
}

function exportCSV(entity) {
  const rows = [];
  if (entity === 'items') {
    rows.push(['name', 'barcode', 'sku', 'category', 'unit', 'cost', 'price', 'stock', 'reorder', 'active', 'id']);
    db.items.forEach(function (i) {
      rows.push([i.name, i.barcode || '', i.sku || '', i.category || '', i.unit,
        i.cost, i.price, i.stock, i.reorder, i.active === false ? 'false' : 'true', i.id]);
    });
  } else if (entity === 'clients') {
    rows.push(['name', 'phone', 'address', 'notes', 'balance', 'id']);
    db.clients.forEach(function (c) {
      rows.push([c.name, c.phone || '', c.address || '', c.notes || '', clientBalance(c.id), c.id]);
    });
  } else if (entity === 'sales') {
    rows.push(['invoice', 'date', 'method', 'client', 'item', 'unit', 'qty', 'price', 'cost', 'line_total',
      'discount', 'subtotal', 'total', 'received', 'change', 'voided', 'voided_at', 'void_reason',
      'refunded_qty', 'refund_log', 'id']);
    db.sales.forEach(function (s) {
      const client = s.clientId ? clientById(s.clientId) : null;
      const method = s.method === 'credit' ? 'account' : s.method === 'card' ? 'card' : 'cash';
      const refunded = refundState(s).byLine;
      const refundLog = writeRefundLog(s);
      (s.lines || []).forEach(function (l, li) {
        rows.push([s.no, s.date, method, client ? client.name : '',
          l.name, l.unit, l.qty, l.price, l.cost, l.total,
          s.discount, s.subtotal, s.total, s.received, s.change,
          s.voided ? 'true' : '', s.voidedAt || '', s.voidReason || '',
          refunded.get(li) || 0, refundLog, s.id]);
      });
    });
  } else if (entity === 'receivables') {
    rows.push(['date', 'client', 'description', 'amount', 'due_date', 'id']);
    db.charges.forEach(function (c) {
      const cl = clientById(c.clientId);
      rows.push([c.date, cl ? cl.name : '', c.description || '', c.amount, c.dueDate || '', c.id]);
    });
  } else if (entity === 'payments') {
    rows.push(['date', 'client', 'amount', 'method', 'reference', 'note', 'id']);
    db.payments.forEach(function (p) {
      const cl = clientById(p.clientId);
      rows.push([p.date, cl ? cl.name : '', p.amount, p.method || '', p.reference || '', p.note || '', p.id]);
    });
  }
  saveFile('store-pos-' + entity + '-' + stamp() + '.csv', toCSV(rows), 'text/csv;charset=utf-8');
}

/**
 * Map the "method" column of a sales CSV onto the app's three tenders.
 * Card is checked first because "Credit card" also contains "credit".
 */
function parseSaleMethod(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return 'cash';
  if (s.indexOf('card') !== -1) return 'card';
  if (s.indexOf('account') !== -1 || s.indexOf('credit') !== -1 ||
      s.indexOf('utang') !== -1 || s.indexOf('charge') !== -1) return 'credit';
  return 'cash';
}

/**
 * Refund records travel in the sales CSV as one JSON cell per sale body:
 * [{d: date, r: reason, l: [[lineIndex, qty, amount, cost], …]}].
 * Line indexes point at the invoice's rows in file order, which is how the
 * import rebuilds the lines anyway.
 */
function writeRefundLog(sale) {
  const refunds = saleRefunds(sale);
  if (!refunds.length) return '';
  return JSON.stringify(refunds.map(function (r) {
    return {
      d: r.date, r: r.reason || '',
      l: (r.lines || []).map(function (l) { return [l.idx, l.qty, l.amount, l.cost]; })
    };
  }));
}

function readRefundLog(raw, lines) {
  if (!raw) return [];
  let parsed;
  try { parsed = JSON.parse(raw); } catch (e) { return []; }
  if (!Array.isArray(parsed)) return [];

  return parsed.map(function (r) {
    const refundLines = (Array.isArray(r.l) ? r.l : []).map(function (e) {
      const idx = Number(e[0]);
      const line = lines[idx];
      const qty = round(Number(e[1]) || 0, 3);
      if (!line || !(qty > 0)) return null;
      return {
        idx: idx, itemId: line.itemId || '', name: line.name, unit: line.unit, qty: qty,
        amount: round2(Number(e[2]) || 0), cost: round2(Number(e[3]) || 0)
      };
    }).filter(Boolean);
    if (!refundLines.length) return null;

    return {
      id: uid('ref'), date: toDateSafe(r.d), reason: String(r.r || ''),
      amount: round2(refundLines.reduce(function (a, l) { return a + l.amount; }, 0)),
      cost: round2(refundLines.reduce(function (a, l) { return a + l.cost; }, 0)),
      lines: refundLines
    };
  }).filter(Boolean);
}

function importCSV(text, entity) {
  const rows = parseCSV(text);
  if (rows.length < 2) { toast('That CSV has no data rows', 'err'); return; }
  const objs = csvObjects(rows);
  let added = 0, updated = 0;

  function findClient(name) {
    const n = String(name || '').trim();
    if (!n) return null;
    let c = db.clients.filter(function (x) { return x.name.toLowerCase() === n.toLowerCase(); })[0];
    if (!c) {
      c = { id: uid('cli'), name: n, phone: '', address: '', notes: '', created: new Date().toISOString() };
      db.clients.push(c);
    }
    return c;
  }

  if (entity === 'items') {
    objs.forEach(function (o) {
      const name = (o.name || '').trim();
      if (!name) return;
      const barcode = (o.barcode || '').trim();
      const unit = (o.unit || 'pc').trim() || 'pc';
      const existing = (o.id && db.items.filter(function (i) { return i.id === o.id; })[0]) ||
        (barcode && db.items.filter(function (i) { return i.barcode === barcode; })[0]) ||
        db.items.filter(function (i) { return i.name.toLowerCase() === name.toLowerCase(); })[0];
      const data = {
        name: name, barcode: barcode, sku: (o.sku || '').trim(),
        category: (o.category || '').trim(), unit: unit,
        cost: round2(num(o.cost)), price: round2(num(o.price)),
        stock: clampQty(o.stock, unit), reorder: clampQty(o.reorder, unit),
        active: !/^(false|0|no)$/i.test((o.active || 'true').trim())
      };
      if (existing) { Object.assign(existing, data); updated++; }
      else {
        data.id = o.id || uid('itm');
        data.created = new Date().toISOString();
        db.items.push(data);
        added++;
      }
    });
  } else if (entity === 'clients') {
    objs.forEach(function (o) {
      const name = (o.name || '').trim();
      if (!name) return;
      const existing = (o.id && db.clients.filter(function (c) { return c.id === o.id; })[0]) ||
        db.clients.filter(function (c) { return c.name.toLowerCase() === name.toLowerCase(); })[0];
      const data = {
        name: name, phone: (o.phone || '').trim(), address: (o.address || '').trim(),
        notes: (o.notes || '').trim()
      };
      if (existing) { Object.assign(existing, data); updated++; }
      else {
        data.id = o.id || uid('cli');
        data.created = new Date().toISOString();
        db.clients.push(data);
        added++;
      }
    });
  } else if (entity === 'sales') {
    const groups = new Map();
    objs.forEach(function (o, idx) {
      const key = o.invoice || o.id || ('row-' + idx);
      if (!groups.has(key)) groups.set(key, { head: o, lines: [] });
      groups.get(key).lines.push(o);
    });
    groups.forEach(function (g) {
      const h = g.head;
      const no = (h.invoice || '').trim();
      if (no && db.sales.some(function (s) { return s.no === no; })) return;
      if (h.id && db.sales.some(function (s) { return s.id === h.id; })) return;
      const lines = g.lines.map(function (o) {
        const qty = num(o.qty);
        const price = num(o.price);
        return {
          itemId: '', name: (o.item || 'Item').trim(), unit: (o.unit || 'pc').trim(),
          qty: qty, price: price, cost: num(o.cost),
          total: round2(num(o.line_total) || qty * price)
        };
      });
      const subtotal = round2(num(h.subtotal) || lines.reduce(function (a, l) { return a + l.total; }, 0));
      const total = round2(num(h.total) || subtotal - num(h.discount));
      const sale = {
        id: h.id || uid('sal'),
        no: no || 'INV-' + String(db.settings.counter++).padStart(4, '0'),
        date: toDateSafe(h.date),
        lines: lines, subtotal: subtotal, discount: round2(num(h.discount)), total: total,
        cost: round2(lines.reduce(function (a, l) { return a + l.cost * l.qty; }, 0)),
        method: parseSaleMethod(h.method),
        clientId: null, received: num(h.received), change: num(h.change),
        voided: /^(true|1|yes|void|voided)$/i.test((h.voided || '').trim()),
        voidedAt: (h.voided_at || '').trim() || undefined,
        voidReason: (h.void_reason || '').trim() || undefined
      };
      const refunds = readRefundLog(h.refund_log, sale.lines);
      if (refunds.length) sale.refunds = refunds;
      db.sales.push(sale);
      added++;
    });
  } else if (entity === 'receivables') {
    objs.forEach(function (o) {
      const client = findClient(o.client);
      if (!client) return;
      const amount = round2(num(o.amount));
      if (!(amount > 0)) return;
      const existing = o.id && db.charges.filter(function (c) { return c.id === o.id; })[0];
      const data = {
        id: o.id || uid('chg'), clientId: client.id,
        date: toDateSafe(o.date),
        description: (o.description || 'Charge').trim(),
        amount: amount, dueDate: o.due_date || null, saleId: null
      };
      if (existing) { Object.assign(existing, data); updated++; }
      else { db.charges.push(data); added++; }
    });
  } else if (entity === 'payments') {
    objs.forEach(function (o) {
      const client = findClient(o.client);
      if (!client) return;
      const amount = round2(num(o.amount));
      if (!(amount > 0)) return;
      const existing = o.id && db.payments.filter(function (p) { return p.id === o.id; })[0];
      const data = {
        id: o.id || uid('pay'), clientId: client.id,
        date: toDateSafe(o.date),
        amount: amount, method: (o.method || 'Cash').trim(),
        reference: (o.reference || '').trim(), note: (o.note || '').trim()
      };
      if (existing) { Object.assign(existing, data); updated++; }
      else { db.payments.push(data); added++; }
    });
  }

  saveDB();
  render();
  toast(entity + ': ' + added + ' added, ' + updated + ' updated', 'ok');
}

ACTIONS['load-sample'] = function () {
  confirmDialog({
    title: 'Reload sample data?',
    message: 'This replaces everything with the demo store (8 items, sample sales and one client).',
    confirmLabel: 'Reload sample',
    kind: 'danger',
    onConfirm: function () {
      db = seedDB();
      saveDB();
      ui.sales.cart = [];
      ui.sales.discount = 0;
      render();
      toast('Sample data loaded', 'ok');
    }
  });
};

ACTIONS['clear-all'] = function () {
  confirmDialog({
    title: 'Erase all data?',
    message: 'Every item, sale, client and payment on this device will be deleted.',
    detail: 'Download a JSON backup first if you may need this data again.',
    confirmLabel: 'Erase everything',
    kind: 'danger',
    onConfirm: function () {
      const store = db.settings.storeName;
      db = blankDB();
      db.settings.storeName = store || 'My Store';
      db.settings.counter = 1;
      saveDB();
      ui.sales.cart = [];
      ui.sales.discount = 0;
      render();
      toast('All data erased', 'ok');
    }
  });
};

/* ------------------------------------------------------------------ */
/* settings                                                            */
/* ------------------------------------------------------------------ */
VIEWS.settings = function (main) {
  const s = db.settings;
  main.innerHTML =
    '<div class="view">' +
      '<div class="view-head"><div><h2>Settings</h2><p class="sub">Store identity, currency and app information.</p></div></div>' +
      '<div class="panel">' +
        '<div class="panel-head"><h3>Store profile</h3><span class="sub">Shown in the app bar and on exports</span></div>' +
        '<div class="panel-body stack">' +
          '<div class="field"><label for="sName">Store name</label>' +
            '<input class="input" id="sName" value="' + esc(s.storeName) + '" placeholder="e.g. Bagong Silang Sari-Sari Store"></div>' +
          '<div class="grid cols-2">' +
            '<div class="field"><label for="sOwner">Owner / cashier</label>' +
              '<input class="input" id="sOwner" value="' + esc(s.owner || '') + '" placeholder="Your name"></div>' +
            '<div class="field"><label for="sAddress">Address</label>' +
              '<input class="input" id="sAddress" value="' + esc(s.address || '') + '" placeholder="Street, barangay, city"></div>' +
          '</div>' +
          '<div class="grid cols-2">' +
            '<div class="field"><label for="sCurrency">Currency</label>' +
              '<select class="input" id="sCurrency">' +
                CURRENCIES.map(function (c) {
                  return '<option value="' + c[0] + '"' + (c[0] === s.currency ? ' selected' : '') + '>' +
                    c[0] + ' — ' + c[1] + ' (' + symbolOf(c[0]) + ')</option>';
                }).join('') + '</select>' +
              '<span class="hint">Philippine Peso (PHP) is the default.</span></div>' +
            '<div class="field"><label for="sFooter">Receipt footer</label>' +
              '<input class="input" id="sFooter" value="' + esc(s.footer || '') + '" placeholder="Thank you!"></div>' +
          '</div>' +
          '<div><button type="button" class="btn primary" data-act="save-settings">Save settings</button></div>' +
        '</div>' +
      '</div>' +

      '<div class="panel">' +
        '<div class="panel-head"><h3>Device data</h3><span class="sub">Stored offline on this device</span></div>' +
        '<div class="panel-body stack">' +
          '<div class="row-between small"><span class="muted">Inventory items</span><strong>' + db.items.length + '</strong></div>' +
          '<div class="row-between small"><span class="muted">Recorded sales</span><strong>' + db.sales.length + '</strong></div>' +
          '<div class="row-between small"><span class="muted">Clients</span><strong>' + db.clients.length + '</strong></div>' +
          '<div class="row-between small"><span class="muted">Data size</span><strong>' + Math.max(1, Math.round(new Blob([JSON.stringify(db)]).size / 1024)) + ' KB</strong></div>' +
          '<hr class="hr">' +
          '<div class="inline">' +
            '<button type="button" class="btn" data-act="export-json">Download backup</button>' +
            '<button type="button" class="btn" data-act="go-backup">Open backup screen</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="panel">' +
        '<div class="panel-head"><h3>About</h3></div>' +
        '<div class="panel-body stack small">' +
          '<p><strong>Store POS</strong> — offline retail point of sale for sari-sari and small stores.</p>' +
          '<p class="note">Sales, inventory with barcode scanning, cash change, client credit (utang), reports and CSV/JSON backup. All data stays on this device.</p>' +
          '<p class="note">Install on Android with the APK, or on iPhone/iPad with Safari → Share → Add to Home Screen.</p>' +
          '<button type="button" class="btn sm" data-act="help" style="align-self:flex-start">How to use</button>' +
        '</div>' +
      '</div>' +
    '</div>';
};

ACTIONS['save-settings'] = function () {
  const name = document.getElementById('sName').value.trim();
  if (!name) { toast('Store name cannot be empty', 'err'); return; }
  db.settings.storeName = name;
  db.settings.owner = document.getElementById('sOwner').value.trim();
  db.settings.address = document.getElementById('sAddress').value.trim();
  db.settings.currency = document.getElementById('sCurrency').value;
  db.settings.footer = document.getElementById('sFooter').value.trim();
  saveDB();
  render();
  toast('Settings saved', 'ok');
};

ACTIONS['go-backup'] = function () { show('backup'); };

ACTIONS.help = function () { openHelp(); };

function openHelp() {
  openModal({
    title: 'How to use Store POS',
    size: 'wide',
    body:
      '<div class="stack small">' +
        '<p><strong>Sales</strong> — tap a product or press <em>Scan barcode</em> to read an item with the camera. Adjust quantity with − and +, add a discount, then tap <em>Take payment</em>.</p>' +
        '<p><strong>Cash</strong> — type the amount handed over. The app shows the <span class="money-pos">change</span> due, or the <span class="money-neg">short amount</span> when the cash is not enough.</p>' +
        '<p><strong>Charge to account</strong> — puts the sale on a client\'s balance instead of taking cash.</p>' +
        '<p><strong>Inventory</strong> — add items with cost, price, stock and a reorder level (in pieces or by weight). Scanning inside Inventory opens the matching item. <em>Receive stock</em> updates the average cost.</p>' +
        '<p><strong>Receivables</strong> — every client\'s balance, charges, payments and a downloadable statement.</p>' +
        '<p><strong>Reports</strong> — daily, monthly and yearly sales, profit, top items and the reorder list. Download any report as CSV.</p>' +
        '<p><strong>Backup</strong> — download a JSON file for a full copy, or CSV per table. Restore on the same or a new phone.</p>' +
        '<p class="note">The camera needs permission. If scanning is unavailable, type the barcode — handheld USB/Bluetooth scanners work as keyboards.</p>' +
      '</div>',
    foot: '<button type="button" class="btn primary" data-act="modal-close">Got it</button>'
  });
}

/* ------------------------------------------------------------------ */
/* boot                                                                */
/* ------------------------------------------------------------------ */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:') return;
  if (location.hostname.indexOf('appassets') !== -1) return;
  navigator.serviceWorker.register('sw.js').catch(function () { /* offline cache is optional */ });
}

function boot() {
  db = loadDB();
  const now = new Date();
  ui.rep.day = dayKey(now);
  ui.rep.month = monthKey(now);
  ui.rep.year = String(now.getFullYear());
  saveDB();

  const helpBtn = document.getElementById('btnHelp');
  if (helpBtn) helpBtn.addEventListener('click', openHelp);

  show('sales');
  registerServiceWorker();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
