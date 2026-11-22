/* Store POS — receivables (client accounts) and reports */
'use strict';

/* ------------------------------------------------------------------ */
/* receivables                                                         */
/* ------------------------------------------------------------------ */
VIEWS.receivables = function (main) {
  const outstanding = totalReceivable();
  const withBalance = db.clients.filter(function (c) { return clientBalance(c.id) > 0.005; }).length;
  const todayKey = dayKey(new Date());
  const collected = round2(db.payments.filter(function (p) { return dayKey(p.date) === todayKey; })
    .reduce(function (a, p) { return a + (Number(p.amount) || 0); }, 0));
  const charged = round2(db.charges.filter(function (c) { return dayKey(c.date) === todayKey; })
    .reduce(function (a, c) { return a + (Number(c.amount) || 0); }, 0));

  main.innerHTML =
    '<div class="view">' +
      '<div class="view-head">' +
        '<div><h2>Receivables</h2><p class="sub">Client accounts, balances and payments received.</p></div>' +
        '<div class="head-actions"><button type="button" class="btn primary" data-act="new-client">+ Add client</button></div>' +
      '</div>' +
      '<div class="grid cols-4">' +
        '<div class="stat accent"><div class="k">Total outstanding</div><div class="v">' + money(outstanding) + '</div><div class="n">' + withBalance + ' client' + (withBalance === 1 ? '' : 's') + ' with a balance</div></div>' +
        '<div class="stat"><div class="k">Collected today</div><div class="v">' + money(collected) + '</div><div class="n">Payments received</div></div>' +
        '<div class="stat"><div class="k">Charged today</div><div class="v">' + money(charged) + '</div><div class="n">New credit given</div></div>' +
        '<div class="stat"><div class="k">Clients</div><div class="v">' + db.clients.length + '</div><div class="n">On file</div></div>' +
      '</div>' +
      '<div class="panel">' +
        '<div class="panel-head">' +
          '<div class="search">' + iconSearch() +
            '<input id="arSearch" type="search" placeholder="Search client name or phone" autocomplete="off" value="' + esc(ui.ar.search) + '">' +
          '</div>' +
        '</div>' +
        '<div class="panel-body tight"><div class="table-wrap" id="clientList"></div></div>' +
      '</div>' +
    '</div>';
  renderClients();
};

function lastActivity(clientId) {
  let latest = null;
  db.charges.forEach(function (c) {
    if (c.clientId !== clientId) return;
    if (!latest || new Date(c.date) > new Date(latest)) latest = c.date;
  });
  db.payments.forEach(function (p) {
    if (p.clientId !== clientId) return;
    if (!latest || new Date(p.date) > new Date(latest)) latest = p.date;
  });
  return latest;
}

function renderClients() {
  const box = document.getElementById('clientList');
  if (!box) return;
  const q = ui.ar.search.trim().toLowerCase();
  let list = db.clients.slice();
  if (q) {
    list = list.filter(function (c) {
      return (String(c.name) + ' ' + String(c.phone || '') + ' ' + String(c.address || '')).toLowerCase().indexOf(q) !== -1;
    });
  }
  list.sort(function (a, b) {
    const d = clientBalance(b.id) - clientBalance(a.id);
    return d !== 0 ? d : a.name.localeCompare(b.name);
  });

  if (!list.length) {
    box.innerHTML = '<div class="empty"><strong>No clients yet</strong>Add a client to track balances and payments.</div>';
    return;
  }

  box.innerHTML = '<table class="table"><thead><tr>' +
      '<th>Client</th><th class="num">Balance</th><th class="num">Last activity</th><th class="num">Actions</th>' +
    '</tr></thead><tbody>' +
    list.map(function (c) {
      const bal = clientBalance(c.id);
      const last = lastActivity(c.id);
      return '<tr class="clickable" data-act="view-client" data-id="' + esc(c.id) + '">' +
        '<td class="name"><strong>' + esc(c.name) + '</strong><span>' + esc(c.phone || 'No contact') +
          (c.address ? ' · ' + esc(c.address) : '') + '</span></td>' +
        '<td class="num"><strong class="' + (bal > 0.005 ? 'money-neg' : bal < -0.005 ? 'money-pos' : 'muted') + '">' + money(bal) + '</strong></td>' +
        '<td class="num">' + (last ? fmtDate(last) : '—') + '</td>' +
        '<td><div class="row-actions">' +
          '<button type="button" class="btn sm" data-act="client-payment" data-id="' + esc(c.id) + '">Payment</button>' +
          '<button type="button" class="btn sm" data-act="view-client" data-id="' + esc(c.id) + '">Ledger</button>' +
        '</div></td>' +
      '</tr>';
    }).join('') +
    '</tbody></table>';
}

INPUTS.arSearch = function (input) {
  ui.ar.search = input.value;
  renderClients();
};

ACTIONS['view-client'] = function (t) {
  const c = clientById(t.getAttribute('data-id'));
  if (c) openClientModal(c);
};

function openClientModal(client) {
  const bal = clientBalance(client.id);
  const entries = ledgerEntries(client.id);
  openModal({
    title: client.name,
    size: 'wide',
    body:
      '<div class="row-between">' +
        '<div>' +
          '<div class="k small muted" style="text-transform:uppercase;letter-spacing:.06em;font-weight:700">Outstanding balance</div>' +
          '<div style="font-size:27px;font-weight:750;letter-spacing:-.02em">' + money(bal) + '</div>' +
          '<p class="note">' + esc(client.phone || 'No contact') + (client.address ? ' · ' + esc(client.address) : '') + '</p>' +
        '</div>' +
        '<div class="inline">' +
          '<button type="button" class="btn primary" data-act="client-payment" data-id="' + esc(client.id) + '">Record payment</button>' +
          '<button type="button" class="btn" data-act="client-charge" data-id="' + esc(client.id) + '">Add charge</button>' +
        '</div>' +
      '</div>' +
      '<hr class="hr">' +
      (entries.length
        ? '<div class="ledger">' + entries.map(function (e) {
            return '<div class="lrow">' +
              '<div><div class="lt">' + esc(e.label) + '</div><div class="ld">' + fmtDate(e.date) + ' · ' + fmtTime(e.date) + '</div></div>' +
              '<div class="la ' + (e.debit > 0 ? 'debit' : 'credit') + '">' + (e.debit > 0 ? '+' : '−') + money(e.debit > 0 ? e.debit : e.credit) + '</div>' +
              '<div class="ld" style="grid-column:1">Balance</div>' +
              '<div class="la muted">' + money(e.balance) + '</div>' +
            '</div>';
          }).join('') + '</div>'
        : '<div class="empty"><strong>No activity yet</strong>Charges and payments will appear here.</div>') +
      (client.notes ? '<p class="note">' + esc(client.notes) + '</p>' : ''),
    foot:
      '<button type="button" class="btn" data-act="modal-close">Close</button>' +
      '<button type="button" class="btn" data-act="client-statement" data-id="' + esc(client.id) + '">Statement CSV</button>' +
      '<button type="button" class="btn" data-act="client-edit" data-id="' + esc(client.id) + '">Edit</button>' +
      '<button type="button" class="btn danger" data-act="client-delete" data-id="' + esc(client.id) + '">Delete</button>'
  });
}

function ledgerEntries(clientId) {
  const rows = [];
  db.charges.forEach(function (c) {
    if (c.clientId !== clientId) return;
    const amount = round2(Number(c.amount) || 0);
    rows.push({
      date: c.date,
      label: c.description || (amount < 0 ? 'Reversal' : 'Charge'),
      debit: amount > 0 ? amount : 0,
      credit: amount < 0 ? -amount : 0
    });
  });
  db.payments.forEach(function (p) {
    if (p.clientId !== clientId) return;
    rows.push({
      date: p.date,
      label: 'Payment — ' + (p.method || 'Cash') + (p.reference ? ' (' + p.reference + ')' : ''),
      debit: 0, credit: Number(p.amount) || 0
    });
  });
  rows.sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
  let run = 0;
  rows.forEach(function (r) {
    run = round2(run + r.debit - r.credit);
    r.balance = run;
  });
  return rows.reverse();
}

ACTIONS['new-client'] = function () {
  openModal({
    title: 'New client',
    body:
      '<div class="field"><label for="cName">Client name</label>' +
        '<input class="input" id="cName" placeholder="e.g. Aling Nena — Purok 2" autocomplete="off"></div>' +
      '<div class="field"><label for="cPhone">Contact number</label>' +
        '<input class="input" id="cPhone" inputmode="tel" placeholder="0917 000 0000"></div>' +
      '<div class="field"><label for="cAddress">Address</label>' +
        '<input class="input" id="cAddress" placeholder="Street / barangay"></div>' +
      '<div class="field"><label for="cNotes">Notes</label>' +
        '<textarea class="input" id="cNotes" placeholder="Payment terms, reminders…"></textarea></div>' +
      '<div class="field"><label for="cOpening">Opening balance (optional)</label>' +
        '<input class="input" id="cOpening" type="number" inputmode="decimal" min="0" step="0.01" value="">' +
        '<span class="hint">Recorded as a starting charge on the account.</span></div>',
    foot: '<button type="button" class="btn" data-act="modal-close">Cancel</button>' +
      '<button type="button" class="btn primary" id="saveClient">Save client</button>',
    onMount: function (root) {
      root.querySelector('#saveClient').addEventListener('click', function () {
        const name = root.querySelector('#cName').value.trim();
        if (!name) { toast('Client name is required', 'err'); return; }
        const client = {
          id: uid('cli'), name: name,
          phone: root.querySelector('#cPhone').value.trim(),
          address: root.querySelector('#cAddress').value.trim(),
          notes: root.querySelector('#cNotes').value.trim(),
          created: new Date().toISOString()
        };
        db.clients.push(client);
        const opening = num(root.querySelector('#cOpening').value);
        if (opening > 0) {
          db.charges.push({
            id: uid('chg'), clientId: client.id, date: new Date().toISOString(),
            description: 'Opening balance', amount: round2(opening), dueDate: null, saleId: null
          });
        }
        saveDB();
        closeModal();
        toast('Client added', 'ok');
        render();
      });
    }
  });
};

ACTIONS['client-edit'] = function (t) {
  const client = clientById(t.getAttribute('data-id'));
  if (!client) return;
  closeModal();
  openModal({
    title: 'Edit client',
    body:
      '<div class="field"><label for="cName">Client name</label><input class="input" id="cName" value="' + esc(client.name) + '"></div>' +
      '<div class="field"><label for="cPhone">Contact number</label><input class="input" id="cPhone" inputmode="tel" value="' + esc(client.phone || '') + '"></div>' +
      '<div class="field"><label for="cAddress">Address</label><input class="input" id="cAddress" value="' + esc(client.address || '') + '"></div>' +
      '<div class="field"><label for="cNotes">Notes</label><textarea class="input" id="cNotes">' + esc(client.notes || '') + '</textarea></div>',
    foot: '<button type="button" class="btn" data-act="modal-close">Cancel</button>' +
      '<button type="button" class="btn primary" id="saveClient">Save changes</button>',
    onMount: function (root) {
      root.querySelector('#saveClient').addEventListener('click', function () {
        const name = root.querySelector('#cName').value.trim();
        if (!name) { toast('Client name is required', 'err'); return; }
        client.name = name;
        client.phone = root.querySelector('#cPhone').value.trim();
        client.address = root.querySelector('#cAddress').value.trim();
        client.notes = root.querySelector('#cNotes').value.trim();
        saveDB();
        closeAllModals();
        toast('Client updated', 'ok');
        render();
        openClientModal(client);
      });
    }
  });
};

ACTIONS['client-delete'] = function (t) {
  const client = clientById(t.getAttribute('data-id'));
  if (!client) return;
  const bal = clientBalance(client.id);
  closeModal();
  if (Math.abs(bal) > 0.005) {
    toast('Settle the balance of ' + money(bal) + ' before deleting', 'err');
    return;
  }
  confirmDialog({
    title: 'Delete client',
    message: 'Delete ' + client.name + '?',
    detail: 'Their charge and payment history will also be removed. This cannot be undone.',
    confirmLabel: 'Delete client',
    kind: 'danger',
    onConfirm: function () {
      db.clients = db.clients.filter(function (c) { return c.id !== client.id; });
      db.charges = db.charges.filter(function (c) { return c.clientId !== client.id; });
      db.payments = db.payments.filter(function (p) { return p.clientId !== client.id; });
      saveDB();
      toast('Client deleted');
      render();
    }
  });
};

ACTIONS['client-payment'] = function (t) {
  const client = clientById(t.getAttribute('data-id'));
  if (client) openPaymentModal(client);
};

function openPaymentModal(client) {
  const bal = clientBalance(client.id);
  openModal({
    title: 'Record payment',
    body:
      '<div class="pay-total"><div class="k">Balance of ' + esc(client.name) + '</div><div class="v">' + money(bal) + '</div></div>' +
      '<div class="field"><label for="pmAmount">Amount received</label>' +
        '<input class="input big" id="pmAmount" type="number" inputmode="decimal" min="0" step="0.01" value="' + (bal > 0 ? bal.toFixed(2) : '') + '"></div>' +
      '<div class="chips">' +
        [bal, 100, 200, 500, 1000].filter(function (v, i, arr) { return v > 0 && arr.indexOf(v) === i; })
          .map(function (v) { return '<button type="button" class="chip" data-amt="' + round2(v) + '">' + money(v) + '</button>'; }).join('') +
      '</div>' +
      '<div class="grid cols-2">' +
        '<div class="field"><label for="pmMethod">Method</label><select class="input" id="pmMethod">' +
          AR_PAY_METHODS.map(function (m) { return '<option>' + m + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><label for="pmRef">Reference</label><input class="input" id="pmRef" placeholder="OR / ref no."></div>' +
      '</div>' +
      '<div class="field"><label for="pmDate">Date received</label><input class="input" id="pmDate" type="date" value="' + todayInput() + '"></div>' +
      '<div class="field"><label for="pmNote">Note</label><input class="input" id="pmNote" placeholder="Optional"></div>' +
      '<p class="note" id="pmHint"></p>',
    foot: '<button type="button" class="btn" data-act="modal-close">Cancel</button>' +
      '<button type="button" class="btn primary" id="savePayment">Save payment</button>',
    onMount: function (root) {
      const amountEl = root.querySelector('#pmAmount');
      const hint = root.querySelector('#pmHint');
      function updateHint() {
        const v = num(amountEl.value);
        if (!(v > 0)) { hint.textContent = ''; return; }
        const after = round2(bal - v);
        hint.textContent = after > 0.005
          ? 'Remaining balance after this payment: ' + money(after)
          : after < -0.005
            ? 'Overpayment of ' + money(Math.abs(after)) + ' — the client will have a credit balance.'
            : 'This settles the account in full.';
      }
      amountEl.addEventListener('input', updateHint);
      updateHint();
      $$('[data-amt]', root).forEach(function (chip) {
        chip.addEventListener('click', function () {
          amountEl.value = chip.getAttribute('data-amt');
          updateHint();
        });
      });
      root.querySelector('#savePayment').addEventListener('click', function () {
        const amount = round2(num(amountEl.value));
        if (!(amount > 0)) { toast('Enter the amount received', 'err'); return; }
        const dateStr = root.querySelector('#pmDate').value;
        const d = dateStr ? parseDayKey(dateStr) : new Date();
        db.payments.push({
          id: uid('pay'), clientId: client.id,
          date: d.toISOString(), amount: amount,
          method: root.querySelector('#pmMethod').value,
          reference: root.querySelector('#pmRef').value.trim(),
          note: root.querySelector('#pmNote').value.trim()
        });
        saveDB();
        closeAllModals();
        toast('Payment of ' + money(amount) + ' recorded', 'ok');
        render();
        openClientModal(client);
      });
    }
  });
}

ACTIONS['client-charge'] = function (t) {
  const client = clientById(t.getAttribute('data-id'));
  if (!client) return;
  openModal({
    title: 'Add charge to ' + client.name,
    body:
      '<div class="field"><label for="chDesc">Description</label>' +
        '<input class="input" id="chDesc" value="Goods on credit" placeholder="What was taken on credit"></div>' +
      '<div class="field"><label for="chAmount">Amount</label>' +
        '<input class="input big" id="chAmount" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00"></div>' +
      '<div class="grid cols-2">' +
        '<div class="field"><label for="chDate">Date</label><input class="input" id="chDate" type="date" value="' + todayInput() + '"></div>' +
        '<div class="field"><label for="chDue">Due date (optional)</label><input class="input" id="chDue" type="date"></div>' +
      '</div>',
    foot: '<button type="button" class="btn" data-act="modal-close">Cancel</button>' +
      '<button type="button" class="btn primary" id="saveCharge">Add charge</button>',
    onMount: function (root) {
      root.querySelector('#saveCharge').addEventListener('click', function () {
        const amount = round2(num(root.querySelector('#chAmount').value));
        if (!(amount > 0)) { toast('Enter the amount to charge', 'err'); return; }
        const dEl = root.querySelector('#chDate').value;
        const d = dEl ? parseDayKey(dEl) : new Date();
        db.charges.push({
          id: uid('chg'), clientId: client.id, date: new Date(d.getTime() + 12 * 3600 * 1000).toISOString(),
          description: root.querySelector('#chDesc').value.trim() || 'Charge',
          amount: amount,
          dueDate: root.querySelector('#chDue').value || null,
          saleId: null
        });
        saveDB();
        closeAllModals();
        toast('Charge added', 'ok');
        render();
        openClientModal(client);
      });
    }
  });
}

ACTIONS['client-statement'] = function (t) {
  const client = clientById(t.getAttribute('data-id'));
  if (!client) return;
  const entries = ledgerEntries(client.id).slice().reverse();
  const rows = [
    ['Statement of account'],
    ['Client', client.name],
    ['Contact', client.phone || ''],
    ['Address', client.address || ''],
    ['Generated', new Date().toISOString()],
    ['Balance', clientBalance(client.id)],
    [],
    ['Date', 'Type', 'Description', 'Debit', 'Credit', 'Balance']
  ];
  entries.forEach(function (e) {
    const type = e.debit > 0 ? 'Charge' : (e.label.indexOf('Void') === 0 ? 'Void' : 'Payment');
    rows.push([fmtDate(e.date), type, e.label, e.debit || '', e.credit || '', e.balance]);
  });
  saveFile('statement-' + String(client.name).replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '-' + stamp() + '.csv',
    toCSV(rows), 'text/csv;charset=utf-8');
};

/* ------------------------------------------------------------------ */
/* reports                                                             */
/* ------------------------------------------------------------------ */
function reportRange() {
  const mode = ui.rep.mode;
  if (mode === 'monthly') {
    const m = parseMonthKey(ui.rep.month || monthKey(new Date()));
    return {
      mode: mode, key: monthKey(m),
      from: new Date(m.getFullYear(), m.getMonth(), 1),
      to: endOfDay(new Date(m.getFullYear(), m.getMonth() + 1, 0)),
      label: MONTHS[m.getMonth()] + ' ' + m.getFullYear()
    };
  }
  if (mode === 'yearly') {
    const y = Number(ui.rep.year || new Date().getFullYear());
    return {
      mode: mode, key: String(y),
      from: new Date(y, 0, 1), to: endOfDay(new Date(y, 11, 31)),
      label: String(y)
    };
  }
  const d = parseDayKey(ui.rep.day || todayInput());
  return { mode: 'daily', key: dayKey(d), from: startOfDay(d), to: endOfDay(d), label: fmtDate(d) };
}

function summarizeSales(sales) {
  let gross = 0, cost = 0, qty = 0, discount = 0, cash = 0, card = 0, onAccount = 0;
  sales.forEach(function (s) {
    const rf = refundState(s);
    const net = round2((Number(s.total) || 0) - rf.amount);
    gross += net;
    cost += (Number(s.cost) || 0) - rf.cost;
    discount += Number(s.discount) || 0;
    (s.lines || []).forEach(function (l, idx) {
      qty += Math.max(0, (Number(l.qty) || 0) - (rf.byLine.get(idx) || 0));
    });
    if (s.method === 'credit') onAccount += net;
    else if (s.method === 'card') card += net;
    else cash += net;
  });
  gross = round2(gross);
  cost = round2(cost);
  return {
    count: sales.length, gross: gross, cost: cost, profit: round2(gross - cost),
    qty: round(qty, 3), discount: round2(discount),
    cash: round2(cash), card: round2(card), onAccount: round2(onAccount),
    avg: sales.length ? round2(gross / sales.length) : 0
  };
}

function breakdownRows(sales, mode) {
  if (mode === 'daily') {
    return sales.slice().sort(function (a, b) { return new Date(a.date) - new Date(b.date); }).map(function (s) {
      const rf = refundState(s);
      let qty = 0;
      (s.lines || []).forEach(function (l, idx) {
        qty += Math.max(0, (Number(l.qty) || 0) - (rf.byLine.get(idx) || 0));
      });
      const net = round2((Number(s.total) || 0) - rf.amount);
      return {
        label: fmtTime(s.date), sub: s.no + (rf.amount > 0 ? ' · refunded' : ''), count: 1, qty: round(qty, 3),
        gross: net,
        profit: round2(net - ((Number(s.cost) || 0) - rf.cost)),
        extra: s.method === 'credit' ? 'Account' : s.method === 'card' ? 'Card' : 'Cash'
      };
    });
  }
  const map = new Map();
  sales.forEach(function (s) {
    const d = new Date(s.date);
    const k = mode === 'yearly' ? d.getFullYear() + '-' + pad2(d.getMonth() + 1) : dayKey(d);
    if (!map.has(k)) map.set(k, { key: k, count: 0, qty: 0, gross: 0, profit: 0 });
    const row = map.get(k);
    const rf = refundState(s);
    const net = round2((Number(s.total) || 0) - rf.amount);
    row.count += 1;
    (s.lines || []).forEach(function (l, idx) {
      row.qty += Math.max(0, (Number(l.qty) || 0) - (rf.byLine.get(idx) || 0));
    });
    row.gross += net;
    row.profit += net - ((Number(s.cost) || 0) - rf.cost);
  });
  return Array.from(map.values()).sort(function (a, b) { return a.key < b.key ? -1 : 1; }).map(function (row) {
    return {
      label: mode === 'yearly' ? fmtMonthLabel(row.key) : fmtDayLabel(row.key),
      sub: row.key, count: row.count, qty: round(row.qty, 3),
      gross: round2(row.gross), profit: round2(row.profit), extra: ''
    };
  });
}

function topItems(sales) {
  const map = new Map();
  sales.forEach(function (s) {
    const rf = refundState(s);
    (s.lines || []).forEach(function (l, idx) {
      const qty = Math.max(0, (Number(l.qty) || 0) - (rf.byLine.get(idx) || 0));
      if (qty <= 0) return;
      const key = l.itemId || l.name;
      if (!map.has(key)) map.set(key, { name: l.name, unit: l.unit || 'pc', qty: 0, revenue: 0, profit: 0 });
      const r = map.get(key);
      r.qty += qty;
      r.revenue += (Number(l.price) || 0) * qty;
      r.profit += ((Number(l.price) || 0) - (Number(l.cost) || 0)) * qty;
    });
  });
  return Array.from(map.values()).sort(function (a, b) { return b.revenue - a.revenue; });
}

function buildReport() {
  const range = reportRange();
  const allSales = db.sales.filter(function (s) {
    const t = new Date(s.date);
    return t >= range.from && t <= range.to;
  }).sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
  const sales = allSales.filter(function (s) { return !s.voided; });
  const voidedSales = allSales.filter(function (s) { return s.voided; });

  const charges = db.charges.filter(function (c) {
    const t = new Date(c.date);
    return t >= range.from && t <= range.to;
  });
  const payments = db.payments.filter(function (p) {
    const t = new Date(p.date);
    return t >= range.from && t <= range.to;
  });

  return {
    range: range,
    sales: sales,
    sum: summarizeSales(sales),
    credit: {
      charged: round2(charges.reduce(function (a, c) { return a + (Number(c.amount) || 0); }, 0)),
      collected: round2(payments.reduce(function (a, p) { return a + (Number(p.amount) || 0); }, 0))
    },
    rows: breakdownRows(sales, range.mode),
    top: topItems(sales),
    voided: {
      count: voidedSales.length,
      amount: round2(voidedSales.reduce(function (a, s) { return a + saleNetTotal(s); }, 0))
    },
    refunded: (function () {
      let count = 0, amount = 0;
      allSales.forEach(function (s) {
        const rf = refundState(s);
        if (rf.amount > 0.004) { count += 1; amount += rf.amount; }
      });
      return { count: count, amount: round2(amount) };
    })(),
    low: lowStockItems()
  };
}

function yearOptions() {
  const years = {};
  db.sales.forEach(function (s) { years[new Date(s.date).getFullYear()] = true; });
  years[new Date().getFullYear()] = true;
  return Object.keys(years).map(Number).sort(function (a, b) { return b - a; });
}

VIEWS.reports = function (main) {
  const rep = buildReport();
  const s = rep.sum;
  const mode = ui.rep.mode;

  main.innerHTML =
    '<div class="view">' +
      '<div class="view-head">' +
        '<div><h2>Reports</h2><p class="sub">' + esc(rep.range.label) + ' · ' + s.count + ' transaction' + (s.count === 1 ? '' : 's') + '</p></div>' +
        '<div class="head-actions"><button type="button" class="btn primary" data-act="rep-export">Download CSV</button></div>' +
      '</div>' +
      '<div class="panel"><div class="panel-body row-between">' +
        '<div class="tabs" style="max-width:340px">' +
          '<button type="button" class="' + (mode === 'daily' ? 'active' : '') + '" data-act="rep-mode" data-mode="daily">Daily</button>' +
          '<button type="button" class="' + (mode === 'monthly' ? 'active' : '') + '" data-act="rep-mode" data-mode="monthly">Monthly</button>' +
          '<button type="button" class="' + (mode === 'yearly' ? 'active' : '') + '" data-act="rep-mode" data-mode="yearly">Yearly</button>' +
        '</div>' +
        '<div class="inline">' +
          (mode === 'daily'
            ? '<input class="input" id="repDay" type="date" value="' + esc(ui.rep.day || todayInput()) + '" style="max-width:180px">'
            : mode === 'monthly'
              ? '<input class="input" id="repMonth" type="month" value="' + esc(ui.rep.month || monthKey(new Date())) + '" style="max-width:180px">'
              : '<select class="input" id="repYear" style="max-width:140px">' +
                  yearOptions().map(function (y) {
                    return '<option value="' + y + '"' + (String(y) === String(ui.rep.year || new Date().getFullYear()) ? ' selected' : '') + '>' + y + '</option>';
                  }).join('') + '</select>') +
        '</div>' +
      '</div></div>' +

      '<div class="grid cols-4">' +
        '<div class="stat accent"><div class="k">Gross sales</div><div class="v">' + money(s.gross) + '</div><div class="n">' + s.count + ' transactions</div></div>' +
        '<div class="stat"><div class="k">Gross profit</div><div class="v">' + money(s.profit) + '</div><div class="n">Cost of goods ' + money(s.cost) + '</div></div>' +
        '<div class="stat"><div class="k">Cash collected</div><div class="v">' + money(s.cash) + '</div><div class="n">Counter sales</div></div>' +
        '<div class="stat"><div class="k">Card payments</div><div class="v">' + money(s.card) + '</div><div class="n">Settled by card</div></div>' +
      '</div>' +

      '<div class="grid cols-4">' +
        '<div class="stat"><div class="k">On account</div><div class="v">' + money(s.onAccount) + '</div><div class="n">Charged to clients</div></div>' +
        '<div class="stat"><div class="k">Items sold</div><div class="v">' + s.qty + '</div><div class="n">Units and weight sold</div></div>' +
        '<div class="stat"><div class="k">Discounts</div><div class="v">' + money(s.discount) + '</div><div class="n">Given this period</div></div>' +
        '<div class="stat"><div class="k">Average sale</div><div class="v">' + money(s.avg) + '</div><div class="n">Per transaction</div></div>' +
      '</div>' +

      '<div class="panel">' +
        '<div class="panel-head"><h3>' + (mode === 'daily' ? 'Transactions' : mode === 'monthly' ? 'Sales per day' : 'Sales per month') + '</h3>' +
          '<span class="sub">' + esc(rep.range.label) + '</span></div>' +
        '<div class="panel-body tight"><div class="table-wrap">' +
          (rep.rows.length
            ? '<table class="table"><thead><tr><th>Period</th><th class="num">Txns</th><th class="num">Qty</th><th class="num">Sales</th><th class="num">Profit</th>' + (mode === 'daily' ? '<th>Payment</th>' : '') + '</tr></thead><tbody>' +
              rep.rows.map(function (r) {
                return '<tr><td class="name"><strong>' + esc(r.label) + '</strong><span>' + esc(r.sub || '') + '</span></td>' +
                  '<td class="num">' + r.count + '</td><td class="num">' + r.qty + '</td>' +
                  '<td class="num">' + money(r.gross) + '</td><td class="num">' + money(r.profit) + '</td>' +
                  (mode === 'daily' ? '<td><span class="badge ' + (r.extra === 'Account' ? 'info' : 'muted') + '">' + esc(r.extra) + '</span></td>' : '') +
                '</tr>';
              }).join('') + '</tbody></table>'
            : '<div class="empty"><strong>No sales in this period</strong>Try another date or make a sale first.</div>') +
        '</div></div>' +
      '</div>' +

      '<div class="panel">' +
        '<div class="panel-head">' +
          '<div><h3>Find a past sale</h3><span class="sub">Search by invoice, item or client, then void or refund it</span></div>' +
          '<div class="search" style="max-width:330px">' + iconSearch() +
            '<input id="salesQ" type="search" placeholder="Invoice no, item or client" autocomplete="off" value="' + esc(ui.rep.salesQ || '') + '">' +
          '</div>' +
        '</div>' +
        '<div class="panel-body" style="padding-bottom:0">' +
          '<div class="chips">' +
            [['today', 'Today'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['all', 'All sales']].map(function (r) {
              return '<button type="button" class="chip' + ((ui.rep.histRange || '30') === r[0] ? ' on' : '') +
                '" data-act="sales-range" data-range="' + r[0] + '">' + r[1] + '</button>';
            }).join('') +
          '</div>' +
        '</div>' +
        '<div class="panel-body tight" style="padding-top:0"><div class="table-wrap" id="salesHistory"></div></div>' +
      '</div>' +

      '<div class="grid cols-2">' +
        '<div class="panel">' +
          '<div class="panel-head"><h3>Top items</h3><span class="sub">By sales value</span></div>' +
          '<div class="panel-body tight"><div class="table-wrap">' +
            (rep.top.length
              ? '<table class="table"><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Sales</th><th class="num">Profit</th></tr></thead><tbody>' +
                rep.top.slice(0, 10).map(function (t) {
                  return '<tr><td class="name"><strong>' + esc(t.name) + '</strong><span>' + fmtQty(t.qty, t.unit) + ' ' + esc(t.unit) + '</span></td>' +
                    '<td class="num">' + fmtQty(t.qty, t.unit) + '</td>' +
                    '<td class="num">' + money(t.revenue) + '</td>' +
                    '<td class="num">' + money(t.profit) + '</td></tr>';
                }).join('') + '</tbody></table>'
              : '<div class="empty">No items sold in this period.</div>') +
          '</div></div>' +
        '</div>' +
        '<div class="panel">' +
          '<div class="panel-head"><h3>Receivables in period</h3><span class="sub">Credit activity</span></div>' +
          '<div class="panel-body stack">' +
            '<div class="row-between"><span class="small muted">Charged to clients</span><strong>' + money(rep.credit.charged) + '</strong></div>' +
            '<div class="row-between"><span class="small muted">Payments collected</span><strong class="money-pos">' + money(rep.credit.collected) + '</strong></div>' +
            '<hr class="hr">' +
            '<div class="row-between"><span class="small muted">Outstanding now</span><strong>' + money(totalReceivable()) + '</strong></div>' +
            (rep.voided.count
              ? '<div class="row-between"><span class="small muted">Voided this period</span><strong class="money-neg">' + money(rep.voided.amount) + '</strong></div>'
              : '') +
            (rep.refunded.count
              ? '<div class="row-between"><span class="small muted">Refunded lines (' + rep.refunded.count + ' sale' + (rep.refunded.count === 1 ? '' : 's') + ')</span><strong class="money-neg">' + money(rep.refunded.amount) + '</strong></div>'
              : '') +
            '<hr class="hr">' +
            '<strong class="small">Reorder list (' + rep.low.length + ')</strong>' +
            (rep.low.length
              ? '<div class="stack" style="gap:6px">' + rep.low.slice(0, 6).map(function (i) {
                  return '<div class="row-between small"><span class="truncate">' + esc(i.name) + '</span>' +
                    '<span class="badge ' + (Number(i.stock) <= 0 ? 'out' : 'low') + '">' + fmtQty(i.stock, i.unit) + ' / ' + fmtQty(i.reorder || 0, i.unit) + ' ' + esc(i.unit) + '</span></div>';
                }).join('') + '</div>'
              : '<p class="note">Everything is above its reorder level.</p>') +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  renderSalesHistory();
};

ACTIONS['rep-mode'] = function (t) {
  ui.rep.mode = t.getAttribute('data-mode');
  render();
};
CHANGES.repDay = function (input) { ui.rep.day = input.value; render(); };
CHANGES.repMonth = function (input) { ui.rep.month = input.value; render(); };
CHANGES.repYear = function (input) { ui.rep.year = input.value; render(); };

ACTIONS['rep-export'] = function () {
  const rep = buildReport();
  const rows = [];
  rows.push(['Store', db.settings.storeName]);
  rows.push(['Report', rep.range.mode]);
  rows.push(['Period', rep.range.label]);
  rows.push(['Generated', new Date().toISOString()]);
  rows.push(['Currency', currencyCode()]);
  rows.push([]);
  rows.push(['Gross sales', rep.sum.gross]);
  rows.push(['Cost of goods', rep.sum.cost]);
  rows.push(['Gross profit', rep.sum.profit]);
  rows.push(['Transactions', rep.sum.count]);
  rows.push(['Items sold', rep.sum.qty]);
  rows.push(['Discounts', rep.sum.discount]);
  rows.push(['Voided sales (excluded)', rep.voided.amount]);
  rows.push(['Refunded lines', rep.refunded.amount]);
  rows.push(['Cash collected', rep.sum.cash]);
  rows.push(['Card payments', rep.sum.card]);
  rows.push(['On account', rep.sum.onAccount]);
  rows.push(['Receivables charged', rep.credit.charged]);
  rows.push(['Receivables collected', rep.credit.collected]);
  rows.push([]);
  rows.push(['Breakdown']);
  rows.push(['Period', 'Reference', 'Transactions', 'Qty', 'Sales', 'Profit']);
  rep.rows.forEach(function (r) { rows.push([r.label, r.sub || '', r.count, r.qty, r.gross, r.profit]); });
  rows.push([]);
  rows.push(['Top items']);
  rows.push(['Item', 'Qty', 'Unit', 'Sales', 'Profit']);
  rep.top.forEach(function (t) { rows.push([t.name, round(t.qty, 3), t.unit, round2(t.revenue), round2(t.profit)]); });
  saveFile('report-' + rep.range.mode + '-' + rep.range.key + '.csv', toCSV(rows), 'text/csv;charset=utf-8');
};

/* ------------------------------------------------------------------ */
/* sales history + void / refund                                       */
/* ------------------------------------------------------------------ */
function findSale(id) {
  for (let i = 0; i < db.sales.length; i++) if (db.sales[i].id === id) return db.sales[i];
  return null;
}

function saleMethodLabel(sale) {
  if (sale.method === 'credit') return 'On account';
  if (sale.method === 'card') return 'Card';
  return 'Cash';
}

function methodBadge(sale) {
  if (sale.method === 'credit') return '<span class="badge info">Account</span>';
  if (sale.method === 'card') return '<span class="badge">Card</span>';
  return '<span class="badge ok">Cash</span>';
}

function historyRangeStart() {
  const r = ui.rep.histRange || '30';
  if (r === 'all') return null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (r !== 'today') d.setDate(d.getDate() - Number(r));
  return d;
}

function filteredSalesForHistory() {
  const q = String(ui.rep.salesQ || '').trim().toLowerCase();
  const from = historyRangeStart();
  return db.sales.filter(function (s) {
    if (from && new Date(s.date) < from) return false;
    if (!q) return true;
    const client = s.clientId ? clientById(s.clientId) : null;
    const hay = [s.no, saleMethodLabel(s), client ? client.name : '']
      .concat((s.lines || []).map(function (l) { return l.name; }))
      .join(' ').toLowerCase();
    return hay.indexOf(q) !== -1;
  }).sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
}

function renderSalesHistory() {
  const box = document.getElementById('salesHistory');
  if (!box) return;
  const list = filteredSalesForHistory();
  if (!list.length) {
    box.innerHTML = '<div class="empty"><strong>No sales found</strong>Try a different search or range.</div>';
    return;
  }
  const shown = list.slice(0, 60);
  box.innerHTML = '<table class="table"><thead><tr>' +
      '<th>Invoice</th><th>Payment</th><th class="num">Lines</th><th class="num">Total</th><th>Status</th><th></th>' +
    '</tr></thead><tbody>' +
    shown.map(function (s) {
      const rf = refundState(s);
      const net = saleNetTotal(s);
      const status = s.voided
        ? '<span class="badge out">Voided</span>'
        : (rf.amount > 0 ? '<span class="badge low">Refunded</span>' : '<span class="badge muted">Posted</span>');
      return '<tr class="clickable" data-act="view-sale" data-id="' + esc(s.id) + '">' +
        '<td class="name"><strong>' + esc(s.no) + '</strong><span>' + fmtDateTime(s.date) + '</span></td>' +
        '<td>' + methodBadge(s) + '</td>' +
        '<td class="num">' + (s.lines || []).length + '</td>' +
        '<td class="num">' + money(net) +
          (rf.amount > 0 ? '<span class="muted" style="display:block;font-size:11px">was ' + money(s.total) + '</span>' : '') + '</td>' +
        '<td>' + status + '</td>' +
        '<td><div class="row-actions">' +
          (s.voided
            ? '<button type="button" class="btn sm" data-act="undo-void" data-id="' + esc(s.id) + '">Undo</button>'
            : '<button type="button" class="btn sm danger" data-act="void-sale" data-id="' + esc(s.id) + '">Void</button>') +
        '</div></td>' +
      '</tr>';
    }).join('') +
    '</tbody></table>' +
    (list.length > shown.length
      ? '<p class="note" style="padding:10px 12px">Showing the latest ' + shown.length + ' of ' + list.length + ' sales — narrow the range or search.</p>'
      : '');
}

/* ---- refund / void helpers ------------------------------------------ */
function saleRefunds(sale) {
  return sale && Array.isArray(sale.refunds) ? sale.refunds : [];
}

/**
 * One pass over a sale's refunds: quantity refunded per line index,
 * money reversed, and how many lines still have quantity left.
 */
function refundState(sale) {
  const byLine = new Map();
  let amount = 0, cost = 0;
  saleRefunds(sale).forEach(function (r) {
    amount += Number(r.amount) || 0;
    cost += Number(r.cost) || 0;
    (r.lines || []).forEach(function (l) {
      byLine.set(l.idx, (byLine.get(l.idx) || 0) + (Number(l.qty) || 0));
    });
  });
  const left = (sale.lines || []).filter(function (l, idx) {
    return (Number(l.qty) || 0) - (byLine.get(idx) || 0) > 0.0001;
  }).length;
  return { byLine: byLine, amount: round2(amount), cost: round2(cost), left: left };
}

function lineRemaining(sale, idx) {
  const l = (sale.lines || [])[idx];
  if (!l) return 0;
  const refunded = refundState(sale).byLine.get(idx) || 0;
  return round(Math.max(0, (Number(l.qty) || 0) - refunded), 3);
}

/* what a line is worth after its share of the sale discount */
function lineShareAmount(sale, idx, qty) {
  const l = (sale.lines || [])[idx];
  if (!l) return 0;
  const factor = Number(sale.subtotal) > 0 ? (Number(sale.total) || 0) / Number(sale.subtotal) : 1;
  return round2((Number(l.price) || 0) * qty * factor);
}

function saleNetTotal(sale) {
  return round2((Number(sale.total) || 0) - refundState(sale).amount);
}

/* the lines still on the sale, without what was already refunded */
function remainingLines(sale) {
  const byLine = refundState(sale).byLine;
  return (sale.lines || []).map(function (l, idx) {
    const qty = round(Math.max(0, (Number(l.qty) || 0) - (byLine.get(idx) || 0)), 3);
    return { itemId: l.itemId, qty: qty };
  }).filter(function (r) { return r.qty > 0; });
}

/* every stock move goes through here: dir 1 puts goods back, -1 takes them out */
function adjustStock(rows, dir) {
  (rows || []).forEach(function (r) {
    const it = itemById(r.itemId);
    if (!it) return;
    const next = Number(it.stock) + dir * Number(r.qty);
    it.stock = round(dir < 0 ? Math.max(0, next) : next, 3);
  });
}

/* what happens to the money, in words, for the sale's tender */
function tenderEffect(sale, amount) {
  const client = sale.clientId ? clientById(sale.clientId) : null;
  if (sale.method === 'credit' && client) {
    return 'Reverse the charge on ' + esc(client.name) + ' — balance becomes ' +
      money(round2(clientBalance(client.id) - amount)) + '.';
  }
  if (sale.method === 'card') {
    return 'Refund ' + money(amount) + ' on your card terminal if the card was already charged.';
  }
  return 'Refund ' + money(amount) + ' in cash from the drawer.';
}

/* the negative ledger entry a void or refund leaves on a client account */
function reverseCharge(sale, description, amount, link) {
  if (!(amount > 0) || sale.method !== 'credit') return;
  if (!sale.clientId || !clientById(sale.clientId)) return;
  db.charges.push(Object.assign({
    id: uid('chg'), clientId: sale.clientId, date: new Date().toISOString(),
    description: description, amount: -round2(amount), dueDate: null, saleId: sale.id
  }, link || {}));
}

function openSaleModal(sale) {
  const client = sale.clientId ? clientById(sale.clientId) : null;
  const rf = refundState(sale);
  const net = round2((Number(sale.total) || 0) - rf.amount);

  const rows = (sale.lines || []).map(function (l, idx) {
    const refunded = rf.byLine.get(idx) || 0;
    const left = round(Math.max(0, (Number(l.qty) || 0) - refunded), 3);
    return '<tr>' +
      '<td style="width:28px">' +
        (!sale.voided && left > 0
          ? '<input type="checkbox" class="line-pick" data-idx="' + idx + '" aria-label="Select ' + esc(l.name) + '">'
          : '') +
      '</td>' +
      '<td class="name"><strong>' + esc(l.name) + '</strong><span>' +
        fmtQty(l.qty, l.unit) + ' ' + esc(l.unit) + ' × ' + money(l.price) +
        (refunded > 0 ? ' · ' + fmtQty(refunded, l.unit) + ' refunded' : '') + '</span></td>' +
      '<td class="num">' + money(l.total) + '</td></tr>';
  }).join('');

  const refundList = saleRefunds(sale).map(function (r) {
    return '<div class="row-between small" style="align-items:flex-start;gap:10px">' +
        '<div><strong class="money-neg">' + money(r.amount) + '</strong> ' +
          '<span class="muted">' + fmtDateTime(r.date) + '</span>' +
          '<div class="muted">' + (r.lines || []).map(function (l) {
            return esc(l.name) + ' ' + fmtQty(l.qty, l.unit) + ' ' + esc(l.unit);
          }).join(', ') + (r.reason ? ' — ' + esc(r.reason) : '') + '</div></div>' +
        (sale.voided ? '' :
          '<button type="button" class="btn sm" data-act="undo-refund" data-sale="' + esc(sale.id) +
            '" data-refund="' + esc(r.id) + '">Undo</button>') +
      '</div>';
  }).join('');

  const status = sale.voided
    ? '<span class="badge out">Voided</span>'
    : (rf.amount > 0 ? '<span class="badge low">Partly refunded</span>' : '<span class="badge ok">Posted</span>');

  let note = '';
  if (sale.voided) {
    note = 'Voided' + (sale.voidedAt ? ' ' + fmtDateTime(sale.voidedAt) : '') +
      (sale.voidReason ? ' — ' + esc(sale.voidReason) : '') +
      '. Stock was returned and any receivable reversed.';
  } else if (rf.left === 0) {
    note = 'Everything on this sale has been refunded.';
  }

  openModal({
    title: sale.no,
    size: 'wide',
    footClass: 'split',
    body:
      '<div class="row-between">' +
        '<div><p class="note">' + fmtDateTime(sale.date) + '</p>' +
          '<p class="small"><strong>' + esc(saleMethodLabel(sale)) + '</strong>' +
          (client ? ' · ' + esc(client.name) : '') + '</p></div>' + status +
      '</div>' +
      '<div class="table-wrap"><table class="table"><thead><tr><th></th><th>Item</th><th class="num">Amount</th></tr></thead><tbody>' +
        rows + '</tbody></table></div>' +
      '<div class="totals">' +
        '<div class="row"><span class="lbl">Subtotal</span><span class="amt">' + money(sale.subtotal) + '</span></div>' +
        (sale.discount ? '<div class="row"><span class="lbl">Discount</span><span class="amt">−' + money(sale.discount) + '</span></div>' : '') +
        '<div class="row total"><span class="lbl">Total</span><span class="amt">' + money(sale.total) + '</span></div>' +
        (rf.amount > 0
          ? '<div class="row"><span class="lbl">Refunded</span><span class="amt money-neg">−' + money(rf.amount) + '</span></div>' +
            '<div class="row total"><span class="lbl">Net</span><span class="amt">' + money(net) + '</span></div>'
          : '') +
        (sale.method === 'cash'
          ? '<div class="row"><span class="lbl">Cash received</span><span class="amt">' + money(sale.received) + '</span></div>' +
            '<div class="row"><span class="lbl">Change</span><span class="amt">' + money(sale.change) + '</span></div>'
          : '') +
      '</div>' +
      (note ? '<p class="note">' + note + '</p>' : '') +
      (refundList
        ? '<hr class="hr"><strong class="small">Refunds on this sale</strong><div class="stack small">' + refundList + '</div>'
        : ''),
    foot: '<button type="button" class="btn" data-act="modal-close">Close</button>' +
      (sale.voided
        ? '<button type="button" class="btn primary" id="undoVoidDetail">Undo void</button>'
        : '<button type="button" class="btn danger" id="voidDetail">Void sale</button>' +
          '<button type="button" class="btn primary" id="refundSelected" disabled>' +
            (rf.left > 0 ? 'Refund selected' : 'Nothing left to refund') + '</button>'),
    onMount: function (root) {
      const voidBtn = root.querySelector('#voidDetail');
      if (voidBtn) voidBtn.addEventListener('click', function () { closeModal(); openVoidModal(sale); });
      const undoBtn = root.querySelector('#undoVoidDetail');
      if (undoBtn) undoBtn.addEventListener('click', function () { closeModal(); openUndoVoidModal(sale); });

      const go = root.querySelector('#refundSelected');
      if (!go) return;
      const boxes = root.querySelectorAll('.line-pick');

      function selected() {
        const idxs = [];
        Array.prototype.forEach.call(boxes, function (b) {
          if (b.checked) idxs.push(Number(b.getAttribute('data-idx')));
        });
        return idxs;
      }
      function relabel() {
        const idxs = selected();
        const total = round2(idxs.reduce(function (a, idx) {
          return a + lineShareAmount(sale, idx, lineRemaining(sale, idx));
        }, 0));
        go.disabled = !idxs.length;
        go.textContent = idxs.length ? 'Refund ' + money(total) : 'Refund selected';
      }
      Array.prototype.forEach.call(boxes, function (b) { b.addEventListener('change', relabel); });
      go.addEventListener('click', function () {
        const idxs = selected();
        if (!idxs.length) return;
        closeModal();
        openRefundModal(sale, idxs);
      });
    }
  });
}

function openRefundModal(sale, idxs) {
  const picks = (idxs || []).filter(function (idx) { return lineRemaining(sale, idx) > 0; });
  if (!sale || !picks.length) { toast('Select at least one line to refund', 'err'); return; }

  const rows = picks.map(function (idx) {
    const l = sale.lines[idx];
    const qty = lineRemaining(sale, idx);
    return '<div class="row-between small"><span class="truncate">' + esc(l.name) +
        ' <span class="muted">· ' + fmtQty(qty, l.unit) + ' ' + esc(l.unit) + '</span></span>' +
      '<strong>' + money(lineShareAmount(sale, idx, qty)) + '</strong></div>';
  }).join('');

  const amount = round2(picks.reduce(function (a, idx) {
    return a + lineShareAmount(sale, idx, lineRemaining(sale, idx));
  }, 0));

  openModal({
    title: 'Refund ' + (picks.length === 1 ? 'line' : picks.length + ' lines') + ' · ' + sale.no,
    body:
      '<div class="pay-total"><div class="k">Refund amount</div><div class="v">' + money(amount) + '</div>' +
        '<p class="note">' + esc(saleMethodLabel(sale)) + ' · ' + fmtDateTime(sale.date) + '</p></div>' +
      '<div class="stack small">' +
        '<div class="panel" style="box-shadow:none;background:var(--surface-2)"><div class="panel-body stack">' + rows + '</div></div>' +
        '<div>' + tenderEffect(sale, amount) + '</div>' +
        '<div>These quantities go back to stock.</div>' +
        '<p class="note">The rest of the sale is untouched, and the refund is listed in sales history so you can undo it.</p>' +
      '</div>' +
      '<div class="field"><label for="refundReason">Reason (optional)</label>' +
        '<input class="input" id="refundReason" placeholder="e.g. damaged item, wrong size"></div>',
    foot: '<button type="button" class="btn" data-act="modal-close">Cancel</button>' +
      '<button type="button" class="btn primary" id="confirmRefund">Refund ' + money(amount) + '</button>',
    onMount: function (root) {
      root.querySelector('#confirmRefund').addEventListener('click', function () {
        const reason = root.querySelector('#refundReason');
        refundLines(sale, picks, reason ? reason.value : '');
      });
    }
  });
}

function refundLines(sale, idxs, reason) {
  if (!sale || sale.voided) return;
  const lines = [];

  (idxs || []).forEach(function (idx) {
    const l = (sale.lines || [])[idx];
    const qty = lineRemaining(sale, idx);
    if (!l || qty <= 0) return;
    lines.push({
      idx: idx, itemId: l.itemId, name: l.name, unit: l.unit, qty: qty,
      amount: lineShareAmount(sale, idx, qty),
      cost: round2((Number(l.cost) || 0) * qty)
    });
  });
  if (!lines.length) { toast('Nothing left to refund on this sale', 'err'); return; }

  function sum(key) {
    return round2(lines.reduce(function (a, l) { return a + l[key]; }, 0));
  }
  const refund = {
    id: uid('ref'), date: new Date().toISOString(),
    reason: String(reason || '').trim(),
    amount: sum('amount'), cost: sum('cost'), lines: lines
  };
  if (!Array.isArray(sale.refunds)) sale.refunds = [];
  sale.refunds.push(refund);
  adjustStock(lines, 1);
  reverseCharge(sale, 'Refund of ' + sale.no + ' — ' + lines.map(function (l) { return l.name; }).join(', '),
    refund.amount, { refundOf: refund.id });

  saveDB();
  closeAllModals();
  toast('Refunded ' + money(refund.amount) + ' on ' + sale.no, 'ok');
  render();
}

function undoRefund(sale, refundId) {
  if (!sale || sale.voided || !Array.isArray(sale.refunds)) return;
  const i = sale.refunds.findIndex(function (r) { return r.id === refundId; });
  if (i === -1) return;
  const refund = sale.refunds[i];

  adjustStock(refund.lines, -1);
  db.charges = db.charges.filter(function (c) { return c.refundOf !== refundId; });
  sale.refunds.splice(i, 1);
  if (!sale.refunds.length) delete sale.refunds;

  saveDB();
  closeAllModals();
  toast('Refund undone — ' + money(refund.amount) + ' back on ' + sale.no, 'ok');
  render();
}

function openUndoVoidModal(sale) {
  if (!sale || !sale.voided) return;
  const amount = saleNetTotal(sale);
  askConfirm(
    'Undo void ' + sale.no + '?',
    'The sale goes back to normal: ' + money(amount) + ' returns to your totals and stock goes back down' +
      (sale.method === 'credit' ? ', and the reversal is removed from the client&rsquo;s balance' : '') +
      '. The void record is deleted.',
    'Undo void',
    function () { undoVoid(sale); }
  );
}

function undoVoid(sale) {
  if (!sale || !sale.voided) return;

  adjustStock(remainingLines(sale), -1);
  sale.voided = false;
  delete sale.voidedAt;
  delete sale.voidReason;
  db.charges = db.charges.filter(function (c) { return c.voidOf !== sale.id; });

  saveDB();
  closeAllModals();
  toast('Void undone — ' + sale.no + ' is active again', 'ok');
  render();
}

function askConfirm(title, message, label, onYes) {
  openModal({
    title: title,
    body: '<p class="small">' + message + '</p>',
    foot: '<button type="button" class="btn" data-act="modal-close">Cancel</button>' +
      '<button type="button" class="btn danger" id="doConfirm">' + esc(label) + '</button>',
    onMount: function (root) {
      root.querySelector('#doConfirm').addEventListener('click', onYes);
    }
  });
}

function openVoidModal(sale) {
  if (!sale) return;
  if (sale.voided) { toast('Sale ' + sale.no + ' is already voided', 'err'); return; }
  const amount = saleNetTotal(sale);
  if (!(amount > 0)) { toast('Everything on ' + sale.no + ' is already refunded', 'err'); return; }
  const rf = refundState(sale);

  const lines = (sale.lines || []).map(function (l, idx) {
    const left = round(Math.max(0, (Number(l.qty) || 0) - (rf.byLine.get(idx) || 0)), 3);
    return '<div class="row-between small"><span class="truncate">' + esc(l.name) + '</span><span>' +
      (left > 0
        ? fmtQty(left, l.unit) + ' ' + esc(l.unit)
        : '<span class="muted">already refunded</span>') + '</span></div>';
  }).join('');

  openModal({
    title: 'Void ' + sale.no + '?',
    body:
      '<div class="pay-total"><div class="k">Amount to reverse</div><div class="v">' + money(amount) + '</div>' +
        '<p class="note">' + esc(saleMethodLabel(sale)) + ' · ' + fmtDateTime(sale.date) + '</p></div>' +
      '<div class="stack small">' +
        '<div>' + tenderEffect(sale, amount) + '</div>' +
        '<div>Return to stock:</div>' +
        '<div class="panel" style="box-shadow:none;background:var(--surface-2)"><div class="panel-body stack">' +
          (lines || '<span class="muted">No line items</span>') + '</div></div>' +
        (rf.amount > 0 ? '<p class="note">' + money(rf.amount) + ' was already refunded on this sale; only the rest is reversed.</p>' : '') +
        '<p class="note">The sale stays in your records as voided: it drops out of report totals but remains in sales history.</p>' +
      '</div>' +
      '<div class="field"><label for="voidReason">Reason (optional)</label>' +
        '<input class="input" id="voidReason" placeholder="e.g. wrong item, customer changed mind"></div>',
    foot: '<button type="button" class="btn" data-act="modal-close">Cancel</button>' +
      '<button type="button" class="btn danger" id="confirmVoid">Void sale</button>',
    onMount: function (root) {
      root.querySelector('#confirmVoid').addEventListener('click', function () {
        const reason = root.querySelector('#voidReason');
        voidSale(sale, reason ? reason.value : '');
      });
    }
  });
}

function voidSale(sale, reason) {
  if (!sale || sale.voided) return;
  const amount = saleNetTotal(sale);
  if (!(amount > 0)) { toast('Everything on ' + sale.no + ' is already refunded', 'err'); return; }

  sale.voided = true;
  sale.voidedAt = new Date().toISOString();
  sale.voidReason = String(reason || '').trim();
  adjustStock(remainingLines(sale), 1);
  reverseCharge(sale, 'Void of ' + sale.no, amount, { voidOf: sale.id });

  saveDB();
  closeAllModals();
  toast('Sale ' + sale.no + ' voided', 'ok');
  render();
}

INPUTS.salesQ = function (input) {
  ui.rep.salesQ = input.value;
  renderSalesHistory();
};

ACTIONS['sales-range'] = function (t) {
  ui.rep.histRange = t.getAttribute('data-range');
  render();
};
ACTIONS['view-sale'] = function (t) {
  const sale = findSale(t.getAttribute('data-id'));
  if (sale) openSaleModal(sale);
};
ACTIONS['void-sale'] = function (t) {
  const sale = findSale(t.getAttribute('data-id'));
  if (sale) openVoidModal(sale);
};
ACTIONS['undo-void'] = function (t) {
  const sale = findSale(t.getAttribute('data-id'));
  if (sale) openUndoVoidModal(sale);
};
ACTIONS['undo-refund'] = function (t) {
  const sale = findSale(t.getAttribute('data-sale'));
  if (!sale || sale.voided) return;
  const refundId = t.getAttribute('data-refund');
  askConfirm(
    'Undo this refund?',
    'The lines go back onto the sale and stock goes back down. The refund record is deleted.',
    'Undo refund',
    function () { undoRefund(sale, refundId); }
  );
};
