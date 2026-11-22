/* Store POS — sales, payments, scanning, inventory */
'use strict';

/* ------------------------------------------------------------------ */
/* small icons                                                         */
/* ------------------------------------------------------------------ */
function iconSearch() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4"/></svg>';
}
function iconScan() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M4 12h16"/></svg>';
}

/* ------------------------------------------------------------------ */
/* cart model                                                          */
/* ------------------------------------------------------------------ */
function cartCalc() {
  let subtotal = 0;
  let cost = 0;
  const lines = [];
  ui.sales.cart.forEach(function (l) {
    const it = itemById(l.itemId);
    if (!it) return;
    const total = round2(it.price * l.qty);
    subtotal += total;
    cost += (Number(it.cost) || 0) * l.qty;
    lines.push({
      itemId: it.id, name: it.name, unit: it.unit, qty: l.qty,
      price: Number(it.price) || 0, cost: Number(it.cost) || 0, total: total
    });
  });
  subtotal = round2(subtotal);
  const discount = Math.max(0, Math.min(round2(num(ui.sales.discount)), subtotal));
  return {
    lines: lines,
    subtotal: subtotal,
    discount: discount,
    total: round2(subtotal - discount),
    cost: round2(cost),
    count: round(lines.reduce(function (a, l) { return a + l.qty; }, 0), 3)
  };
}

function addToCart(itemId, qty) {
  const it = itemById(itemId);
  if (!it) return;
  if (it.active === false) { toast(it.name + ' is inactive', 'err'); return; }
  if (Number(it.stock) <= 0) { toast(it.name + ' is out of stock', 'err'); return; }
  const step = qty || 1;
  const line = ui.sales.cart.filter(function (l) { return l.itemId === itemId; })[0];
  const current = line ? line.qty : 0;
  const want = round(current + step, 3);
  let allowed = want;
  if (allowed > it.stock) {
    allowed = it.stock;
    toast('Only ' + fmtQty(it.stock, it.unit) + ' ' + it.unit + ' of ' + it.name + ' left', 'err');
  }
  if (line) line.qty = clampQty(allowed, it.unit);
  else ui.sales.cart.push({ itemId: itemId, qty: clampQty(allowed, it.unit) });
  renderCart();
}

function changeQty(itemId, delta) {
  const it = itemById(itemId);
  const line = ui.sales.cart.filter(function (l) { return l.itemId === itemId; })[0];
  if (!it || !line) return;
  const next = round(line.qty + delta, 3);
  if (next <= 0) {
    ui.sales.cart = ui.sales.cart.filter(function (l) { return l.itemId !== itemId; });
    renderCart();
    return;
  }
  if (next > it.stock) { toast('Only ' + fmtQty(it.stock, it.unit) + ' ' + it.unit + ' in stock', 'err'); return; }
  line.qty = clampQty(next, it.unit);
  renderCart();
}

function cartLineHtml(l) {
  const step = isDecimalUnit(l.unit) ? 0.5 : 1;
  const id = esc(l.itemId);
  return '<div class="cart-line" data-id="' + id + '">' +
    '<div>' +
      '<div class="cl-name">' + esc(l.name) + '</div>' +
      '<div class="cl-sub">' + fmtQty(l.qty, l.unit) + ' ' + esc(l.unit) + ' × ' + money(l.price) + '</div>' +
    '</div>' +
    '<div class="cl-total">' + money(l.total) + '</div>' +
    '<button type="button" class="cl-remove" data-act="cart-remove" data-id="' + id + '" aria-label="Remove">×</button>' +
    '<div class="cl-ctrl">' +
      '<button type="button" data-act="qty-dec" data-id="' + id + '" aria-label="Less">−</button>' +
      '<input class="cart-qty" data-id="' + id + '" data-step="' + step + '" type="number" inputmode="decimal" step="' + step + '" min="0" value="' + l.qty + '" aria-label="Quantity">' +
      '<button type="button" data-act="qty-inc" data-id="' + id + '" aria-label="More">+</button>' +
    '</div>' +
  '</div>';
}

function renderCart() {
  const box = document.getElementById('cartList');
  if (!box) return;
  const calc = cartCalc();
  box.innerHTML = calc.lines.length
    ? calc.lines.map(cartLineHtml).join('')
    : '<div class="empty"><strong>No items yet</strong>Scan a barcode or tap a product to start.</div>';
  updateCartFooter();
}

function updateCartFooter() {
  const calc = cartCalc();
  const totals = document.getElementById('cartTotals');
  if (totals) {
    totals.innerHTML =
      '<div class="row"><span class="lbl">Items</span><span class="amt">' + calc.count + '</span></div>' +
      '<div class="row"><span class="lbl">Subtotal</span><span class="amt">' + money(calc.subtotal) + '</span></div>' +
      (calc.discount ? '<div class="row"><span class="lbl">Discount</span><span class="amt">−' + money(calc.discount) + '</span></div>' : '') +
      '<div class="row total"><span class="lbl">Total</span><span class="amt">' + money(calc.total) + '</span></div>';
  }
  const btn = document.getElementById('checkoutBtn');
  if (btn) {
    btn.disabled = !calc.lines.length;
    btn.textContent = calc.lines.length ? 'Take payment · ' + money(calc.total) : 'Take payment';
  }
  const bar = document.getElementById('mobileCart');
  if (bar) {
    bar.hidden = !calc.lines.length;
    const count = document.getElementById('mcCount');
    if (count) count.textContent = calc.lines.length + (calc.lines.length === 1 ? ' item in cart' : ' items in cart');
    const total = document.getElementById('mcTotal');
    if (total) total.textContent = money(calc.total);
  }
}

function matchItem(it, q) {
  const hay = [it.name, it.barcode, it.sku, it.category, it.unit].filter(Boolean).join(' ').toLowerCase();
  return hay.indexOf(q) !== -1;
}

function stockBadge(it) {
  const stock = Number(it.stock) || 0;
  const reorder = Number(it.reorder) || 0;
  if (stock <= 0) return '<span class="badge out">Out</span>';
  if (stock <= reorder) return '<span class="badge low">Low</span>';
  return '<span class="badge ok">In stock</span>';
}

/* ------------------------------------------------------------------ */
/* sales view                                                          */
/* ------------------------------------------------------------------ */
VIEWS.sales = function (main) {
  main.innerHTML =
    '<div class="view">' +
      '<div class="view-head">' +
        '<div><h2>Sales</h2><p class="sub">Scan or tap an item, then take payment in cash or charge it to a client account.</p></div>' +
        '<div class="head-actions">' +
          '<button type="button" class="btn" data-act="open-scanner" data-mode="sale">' + iconScan() + ' Scan barcode</button>' +
        '</div>' +
      '</div>' +
      '<div class="sales-grid">' +
        '<section class="panel products">' +
          '<div class="panel-head">' +
            '<div class="search">' + iconSearch() +
              '<input id="saleSearch" type="search" placeholder="Search name, barcode or category" autocomplete="off" value="' + esc(ui.sales.search) + '">' +
              '<button type="button" class="scan-btn" data-act="open-scanner" data-mode="sale">' + iconScan() + 'Scan</button>' +
            '</div>' +
            '<span class="sub" id="productCount"></span>' +
          '</div>' +
          '<div class="product-grid" id="productGrid"></div>' +
        '</section>' +
        '<aside class="panel cart">' +
          '<div class="panel-head">' +
            '<h3>Current sale</h3>' +
            '<button type="button" class="btn ghost sm" data-act="clear-cart">Clear</button>' +
          '</div>' +
          '<div class="cart-list" id="cartList"></div>' +
          '<div class="cart-foot">' +
            '<div class="discount-row">' +
              '<span>Discount</span>' +
              '<input class="input" id="cartDiscount" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00" value="' + (ui.sales.discount ? ui.sales.discount : '') + '">' +
              '<button type="button" class="btn sm" data-act="clear-discount">Reset</button>' +
            '</div>' +
            '<div class="totals" id="cartTotals"></div>' +
            '<button type="button" class="btn primary block lg" id="checkoutBtn" data-act="checkout">Take payment</button>' +
          '</div>' +
        '</aside>' +
      '</div>' +
      '<div class="mobile-cart" id="mobileCart" hidden>' +
        '<button type="button" class="mc-info" data-act="scroll-cart">' +
          '<span class="mc-count" id="mcCount">0 items</span>' +
          '<span class="mc-total" id="mcTotal"></span>' +
        '</button>' +
        '<button type="button" class="btn primary" data-act="checkout">Take payment</button>' +
      '</div>' +
    '</div>';
  renderProducts();
  renderCart();
};

function renderProducts() {
  const box = document.getElementById('productGrid');
  if (!box) return;
  const q = ui.sales.search.trim().toLowerCase();
  const list = db.items.filter(function (it) {
    return it.active !== false && (!q || matchItem(it, q));
  }).sort(function (a, b) { return a.name.localeCompare(b.name); });

  const counter = document.getElementById('productCount');
  if (counter) {
    const activeCount = db.items.filter(function (x) { return x.active !== false; }).length;
    counter.textContent = list.length + ' of ' + activeCount + ' items';
  }

  if (!list.length) {
    box.innerHTML = '<div class="empty" style="grid-column:1/-1"><strong>No items found</strong>Try another search, scan a barcode, or add the item in Inventory.</div>';
    return;
  }
  box.innerHTML = list.map(function (it) {
    const out = Number(it.stock) <= 0;
    return '<button type="button" class="product' + (out ? ' out' : '') + '" data-act="add-to-cart" data-id="' + esc(it.id) + '"' + (out ? ' disabled' : '') + '>' +
      '<span class="p-name">' + esc(it.name) + '</span>' +
      '<span class="p-price">' + money(it.price) + '<span class="small muted"> /' + esc(it.unit) + '</span></span>' +
      '<span class="p-meta"><span>' + fmtQty(it.stock, it.unit) + ' ' + esc(it.unit) + '</span>' + stockBadge(it) + '</span>' +
    '</button>';
  }).join('');
}

INPUTS.saleSearch = function (input) {
  ui.sales.search = input.value;
  renderProducts();
};
INPUTS.cartDiscount = function (input) {
  ui.sales.discount = num(input.value);
  updateCartFooter();
};

CHANGES.cartDiscount = function (input) {
  ui.sales.discount = num(input.value);
  if (ui.sales.discount < 0) { ui.sales.discount = 0; input.value = ''; }
  updateCartFooter();
};

document.addEventListener('input', function (e) {
  const input = e.target;
  if (!input.classList || !input.classList.contains('cart-qty')) return;
  const id = input.getAttribute('data-id');
  const it = itemById(id);
  const line = ui.sales.cart.filter(function (l) { return l.itemId === id; })[0];
  if (!it || !line) return;
  let v = parseFloat(input.value);
  if (isNaN(v)) return;
  if (v > Number(it.stock)) {
    v = Number(it.stock);
    input.value = v;
    toast('Only ' + fmtQty(it.stock, it.unit) + ' ' + it.unit + ' in stock', 'err');
  }
  line.qty = clampQty(v, it.unit);
  const row = input.closest('.cart-line');
  if (row) {
    const tot = row.querySelector('.cl-total');
    if (tot) tot.textContent = money(it.price * line.qty);
    const sub = row.querySelector('.cl-sub');
    if (sub) sub.textContent = fmtQty(line.qty, it.unit) + ' ' + it.unit + ' × ' + money(it.price);
  }
  updateCartFooter();
});

document.addEventListener('change', function (e) {
  const input = e.target;
  if (!input.classList || !input.classList.contains('cart-qty')) return;
  const id = input.getAttribute('data-id');
  const it = itemById(id);
  const line = ui.sales.cart.filter(function (l) { return l.itemId === id; })[0];
  if (!line) return;
  if (!(line.qty > 0)) {
    ui.sales.cart = ui.sales.cart.filter(function (l) { return l.itemId !== id; });
    renderCart();
    return;
  }
  if (it) input.value = clampQty(line.qty, it.unit);
  renderCart();
});

ACTIONS['add-to-cart'] = function (t) { addToCart(t.getAttribute('data-id'), 1); };
ACTIONS['qty-inc'] = function (t) {
  const it = itemById(t.getAttribute('data-id'));
  changeQty(t.getAttribute('data-id'), it && isDecimalUnit(it.unit) ? 0.5 : 1);
};
ACTIONS['qty-dec'] = function (t) {
  const it = itemById(t.getAttribute('data-id'));
  changeQty(t.getAttribute('data-id'), it && isDecimalUnit(it.unit) ? -0.5 : -1);
};
ACTIONS['cart-remove'] = function (t) {
  const id = t.getAttribute('data-id');
  ui.sales.cart = ui.sales.cart.filter(function (l) { return l.itemId !== id; });
  renderCart();
};
ACTIONS['clear-cart'] = function () {
  if (!ui.sales.cart.length) return;
  ui.sales.cart = [];
  ui.sales.discount = 0;
  render();
};
ACTIONS['clear-discount'] = function () {
  ui.sales.discount = 0;
  render();
};
ACTIONS.checkout = function () { openCheckout(); };
ACTIONS['scroll-cart'] = function () {
  const cart = document.querySelector('.cart');
  if (cart) cart.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

/* ------------------------------------------------------------------ */
/* checkout                                                            */
/* ------------------------------------------------------------------ */
function cashSuggestions(total) {
  const out = [];
  function add(v) {
    v = round2(v);
    if (v >= total && out.indexOf(v) === -1) out.push(v);
  }
  add(total);
  add(Math.ceil(total / 20) * 20);
  add(Math.ceil(total / 50) * 50);
  add(Math.ceil(total / 100) * 100);
  [100, 200, 500, 1000, 2000].forEach(add);
  return out.slice(0, 5);
}

function openCheckout() {
  const calc = cartCalc();
  if (!calc.lines.length) { toast('Add an item to the sale first', 'err'); return; }
  const total = calc.total;
  const clients = db.clients.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
  const suggestions = cashSuggestions(total);
  let method = 'cash';

  openModal({
    title: 'Take payment',
    body:
      '<div class="pay-total">' +
        '<div class="k">Amount due</div>' +
        '<div class="v">' + money(total) + '</div>' +
        '<p class="note">' + calc.lines.length + ' line' + (calc.lines.length === 1 ? '' : 's') + ' · ' + currencyCode() + '</p>' +
      '</div>' +
      '<div class="tabs" id="payTabs">' +
        '<button type="button" class="active" data-method="cash">Cash</button>' +
        '<button type="button" data-method="card">Card</button>' +
        '<button type="button" data-method="credit">On account</button>' +
      '</div>' +
      '<div id="payCashPane" class="stack">' +
        '<div class="field">' +
          '<label for="payReceived">Cash received</label>' +
          '<input class="input big" id="payReceived" type="number" inputmode="decimal" step="0.01" min="0" value="' + total.toFixed(2) + '">' +
          '<span class="hint">Amount handed over by the customer.</span>' +
        '</div>' +
        '<div class="chips">' + suggestions.map(function (v) {
          return '<button type="button" class="chip" data-cash="' + v + '">' + (v === total ? 'Exact · ' + money(v) : money(v)) + '</button>';
        }).join('') + '</div>' +
      '</div>' +
      '<div id="payCardPane" class="stack" hidden>' +
        '<p class="note">Charge the full amount on your card terminal, then tap Complete sale. ' +
          'No approval details are recorded and no change is computed.</p>' +
      '</div>' +
      '<div id="payCreditPane" class="stack" hidden>' +
        (clients.length
          ? '<div class="field"><label for="payClient">Charge to client</label><select class="input" id="payClient">' +
              clients.map(function (c) {
                return '<option value="' + esc(c.id) + '">' + esc(c.name) + ' — balance ' + money(clientBalance(c.id)) + '</option>';
              }).join('') + '</select></div>'
          : '<div class="empty"><strong>No clients yet</strong>Add a client in Receivables to sell on credit.</div>') +
        '<div class="field"><label for="payDue">Due date (optional)</label><input class="input" id="payDue" type="date"></div>' +
        '<p class="note">The full amount is added to the client\'s balance and can be settled later in Receivables.</p>' +
      '</div>' +
      '<div class="pay-readout ok" id="payReadout"></div>',
    foot:
      '<button type="button" class="btn" data-act="modal-close">Cancel</button>' +
      '<button type="button" class="btn primary" id="payConfirm">Complete sale</button>',
    onMount: function (root) {
      const receivedEl = root.querySelector('#payReceived');
      const readout = root.querySelector('#payReadout');
      const confirmBtn = root.querySelector('#payConfirm');
      const cashPane = root.querySelector('#payCashPane');
      const cardPane = root.querySelector('#payCardPane');
      const creditPane = root.querySelector('#payCreditPane');
      const tabs = $$('#payTabs button', root);

      function update() {
        if (method === 'cash') {
          const received = num(receivedEl.value);
          const diff = round2(received - total);
          if (diff >= 0) {
            readout.className = 'pay-readout ok';
            readout.innerHTML = '<div class="k">Change</div><div class="v">' + money(diff) + '</div>';
            confirmBtn.disabled = false;
          } else {
            readout.className = 'pay-readout short';
            readout.innerHTML = '<div class="k">Discrepancy — short</div><div class="v">' + money(Math.abs(diff)) + '</div>';
            confirmBtn.disabled = true;
          }
          return;
        }
        if (method === 'card') {
          readout.className = 'pay-readout neutral';
          readout.innerHTML = '<div class="k">Card payment</div><div class="v">' + money(total) + '</div>';
          confirmBtn.disabled = false;
          return;
        }
        readout.className = 'pay-readout neutral';
        readout.innerHTML = '<div class="k">To be charged</div><div class="v">' + money(total) + '</div>';
        confirmBtn.disabled = !clients.length;
      }

      tabs.forEach(function (b) {
        b.addEventListener('click', function () {
          method = b.getAttribute('data-method');
          tabs.forEach(function (x) { x.classList.toggle('active', x === b); });
          cashPane.hidden = method !== 'cash';
          cardPane.hidden = method !== 'card';
          creditPane.hidden = method !== 'credit';
          update();
        });
      });

      receivedEl.addEventListener('input', update);
      receivedEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); confirmBtn.click(); }
      });
      $$('[data-cash]', root).forEach(function (chip) {
        chip.addEventListener('click', function () {
          receivedEl.value = chip.getAttribute('data-cash');
          update();
        });
      });
      confirmBtn.addEventListener('click', function () {
        if (method === 'cash') {
          const received = num(receivedEl.value);
          if (round2(received) + 0.005 < total) {
            toast('Cash received is short by ' + money(total - received), 'err');
            return;
          }
          completeSale('cash', { received: received });
        } else if (method === 'card') {
          completeSale('card', {});
        } else {
          const sel = root.querySelector('#payClient');
          if (!sel) { toast('Add a client first', 'err'); return; }
          const dueEl = root.querySelector('#payDue');
          completeSale('credit', { clientId: sel.value, due: dueEl ? dueEl.value : '' });
        }
      });
      update();
      setTimeout(function () { receivedEl.focus(); receivedEl.select(); }, 80);
    }
  });
}

function completeSale(method, opts) {
  const calc = cartCalc();
  if (!calc.lines.length) { toast('The sale is empty', 'err'); return; }

  for (let i = 0; i < calc.lines.length; i++) {
    const l = calc.lines[i];
    const it = itemById(l.itemId);
    if (it && l.qty > Number(it.stock) + 0.0001) {
      toast('Not enough stock for ' + it.name, 'err');
      return;
    }
  }

  const isCash = method === 'cash';
  const received = isCash ? round2(num(opts.received)) : (method === 'card' ? calc.total : 0);
  const sale = {
    id: uid('sal'),
    no: 'INV-' + String(db.settings.counter || 1).padStart(4, '0'),
    date: new Date().toISOString(),
    lines: calc.lines.map(function (l) {
      return { itemId: l.itemId, name: l.name, unit: l.unit, qty: l.qty, price: l.price, cost: l.cost, total: l.total };
    }),
    subtotal: calc.subtotal,
    discount: calc.discount,
    total: calc.total,
    cost: calc.cost,
    method: method,
    clientId: method === 'credit' ? opts.clientId : null,
    received: received,
    change: isCash ? round2(received - calc.total) : 0
  };

  db.settings.counter = (Number(db.settings.counter) || 1) + 1;
  db.sales.push(sale);

  calc.lines.forEach(function (l) {
    const it = itemById(l.itemId);
    if (it) it.stock = Math.max(0, round(Number(it.stock) - l.qty, 3));
  });

  let balance = 0;
  if (method === 'credit' && opts.clientId) {
    db.charges.push({
      id: uid('chg'), clientId: opts.clientId, date: sale.date,
      description: 'Credit sale ' + sale.no, amount: sale.total,
      dueDate: opts.due || null, saleId: sale.id
    });
    balance = clientBalance(opts.clientId);
  }

  saveDB();
  ui.sales.cart = [];
  ui.sales.discount = 0;
  closeModal();
  showSaleSuccess(sale, balance);
  render();
}

function showSaleSuccess(sale, balance) {
  const client = sale.clientId ? clientById(sale.clientId) : null;
  openModal({
    title: 'Sale completed',
    body:
      '<div class="success-mark">✓</div>' +
      '<div class="pay-total">' +
        '<div class="k">' + esc(sale.no) + '</div>' +
        '<div class="v">' + money(sale.total) + '</div>' +
        '<p class="note">' + fmtDateTime(sale.date) + '</p>' +
      '</div>' +
      (sale.method === 'cash'
        ? '<div class="grid cols-2">' +
            '<div class="stat"><div class="k">Cash received</div><div class="v">' + money(sale.received) + '</div></div>' +
            '<div class="stat ' + (sale.change > 0 ? 'ok' : '') + '"><div class="k">Change</div><div class="v">' + money(sale.change) + '</div></div>' +
          '</div>' +
          (sale.change > 0 ? '' : '<p class="note right">Exact payment — no change due.</p>')
        : sale.method === 'card'
          ? '<div class="stat"><div class="k">Card payment</div><div class="v">' + money(sale.total) + '</div>' +
              '<div class="n">Settled in full</div></div>'
          : '<div class="stat"><div class="k">Charged to ' + esc(client ? client.name : 'client account') + '</div>' +
              '<div class="v">' + money(sale.total) + '</div>' +
              '<div class="n">New balance ' + money(balance) + '</div></div>'),
    foot: '<button type="button" class="btn primary block" data-act="modal-close">New sale</button>'
  });
}

/* ------------------------------------------------------------------ */
/* barcode scanner                                                     */
/* ------------------------------------------------------------------ */
let scanSession = null;

function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 1180;
    gain.gain.value = 0.06;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(function () { osc.stop(); ctx.close(); }, 90);
  } catch (err) { /* silent */ }
}

function openScanner(mode) {
  openModal({
    title: mode === 'inventory' ? 'Scan an item' : 'Scan item to sell',
    body:
      '<div class="scanner-stage">' +
        '<video id="scanVideo" playsinline autoplay muted></video>' +
        '<div class="scanner-frame"></div>' +
        '<div class="scanner-hint">Hold the barcode inside the frame</div>' +
      '</div>' +
      '<p class="scanner-status" id="scanStatus">Starting camera…</p>' +
      '<div class="field">' +
        '<label for="scanManual">Or type a barcode / use a handheld scanner</label>' +
        '<div class="input-group">' +
          '<input class="input mono" id="scanManual" placeholder="Barcode" autocomplete="off" inputmode="numeric">' +
          '<button type="button" class="btn" id="scanManualGo">Add</button>' +
        '</div>' +
      '</div>',
    foot: '<button type="button" class="btn" data-act="modal-close">Close</button>',
    onMount: function (root) { startScanner(root, mode); },
    onClose: function () { stopScanner(); }
  });
}

function startScanner(root, mode) {
  const video = root.querySelector('#scanVideo');
  const status = root.querySelector('#scanStatus');
  const manual = root.querySelector('#scanManual');
  const session = { mode: mode, stopped: false, stream: null, reader: null, timer: null };
  scanSession = session;

  function setStatus(msg) { if (status) status.textContent = msg; }

  function accept(code) {
    if (session.stopped) return;
    stopScanner();
    closeModal();
    scanResult(String(code || '').trim(), mode);
  }

  manual.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (manual.value.trim()) accept(manual.value.trim());
    }
  });
  const go = root.querySelector('#scanManualGo');
  if (go) go.addEventListener('click', function () { if (manual.value.trim()) accept(manual.value.trim()); });

  if ('BarcodeDetector' in window) {
    startNative();
  } else if (window.ZXing && window.ZXing.BrowserMultiFormatReader) {
    startZXing();
  } else {
    setStatus('Camera scanning is not supported here — type the barcode below.');
  }

  async function startNative() {
    try {
      session.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } }, audio: false
      });
      video.srcObject = session.stream;
      await video.play();
      let detector;
      try {
        detector = new window.BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'codabar', 'qr_code']
        });
      } catch (err) {
        detector = new window.BarcodeDetector();
      }
      setStatus('Point the camera at the barcode.');
      const tick = async function () {
        if (session.stopped) return;
        try {
          const codes = await detector.detect(video);
          if (codes && codes.length && codes[0].rawValue) { accept(codes[0].rawValue); return; }
        } catch (err) { /* keep scanning */ }
        session.timer = setTimeout(tick, 130);
      };
      tick();
    } catch (err) {
      setStatus('Camera unavailable (' + (err && err.name ? err.name : 'error') + '). Type the barcode below.');
    }
  }

  function startZXing() {
    try {
      const reader = new window.ZXing.BrowserMultiFormatReader();
      session.reader = reader;
      setStatus('Point the camera at the barcode.');
      reader.decodeFromVideoDevice(
        null, video,
        function (result) {
          if (session.stopped) return;
          if (result && typeof result.getText === 'function') accept(result.getText());
        },
        { video: { facingMode: { ideal: 'environment' } }, audio: false }
      ).catch(function (err) {
        setStatus('Camera unavailable (' + (err && err.name ? err.name : 'error') + '). Type the barcode below.');
      });
    } catch (err) {
      setStatus('Camera unavailable. Type the barcode below.');
    }
  }
}

function stopScanner() {
  const session = scanSession;
  scanSession = null;
  if (!session) return;
  session.stopped = true;
  if (session.timer) clearTimeout(session.timer);
  if (session.reader) { try { session.reader.reset(); } catch (err) { /* ignore */ } }
  if (session.stream) {
    session.stream.getTracks().forEach(function (tr) { try { tr.stop(); } catch (err) { /* ignore */ } });
  }
  const video = document.getElementById('scanVideo');
  if (video) {
    try { video.pause(); } catch (err) { /* ignore */ }
    video.srcObject = null;
  }
}

function scanResult(code, mode) {
  if (!code) return;
  beep();
  const it = db.items.filter(function (i) {
    return (i.barcode && i.barcode === code) || (i.sku && i.sku === code);
  })[0];

  if (mode === 'sale') {
    if (!it) { toast('No item with barcode ' + code, 'err'); return; }
    addToCart(it.id, 1);
    toast(it.name + ' added to sale', 'ok');
  } else if (it) {
    openItemModal(it);
  } else {
    toast('New item — barcode ' + code + ' filled in');
    openItemModal(null, code);
  }
}

ACTIONS['open-scanner'] = function (t) { openScanner(t.getAttribute('data-mode') || 'sale'); };

/* ------------------------------------------------------------------ */
/* inventory                                                           */
/* ------------------------------------------------------------------ */
VIEWS.inventory = function (main) {
  const low = lowStockItems().length;
  const value = round2(db.items.reduce(function (a, i) { return a + (Number(i.cost) || 0) * (Number(i.stock) || 0); }, 0));
  main.innerHTML =
    '<div class="view">' +
      '<div class="view-head">' +
        '<div><h2>Inventory</h2><p class="sub">' + db.items.length + ' items · stock value ' + money(value) + ' · ' + low + ' need reorder</p></div>' +
        '<div class="head-actions">' +
          '<button type="button" class="btn" data-act="open-scanner" data-mode="inventory">' + iconScan() + ' Scan item</button>' +
          '<button type="button" class="btn primary" data-act="new-item">+ Add item</button>' +
        '</div>' +
      '</div>' +
      (low ? '<div class="panel"><div class="panel-body row-between" style="padding:10px 14px">' +
        '<span class="small"><strong>' + low + ' item' + (low === 1 ? '' : 's') + '</strong> at or below reorder level.</span>' +
        '<button type="button" class="btn sm" data-act="show-low">Show reorder list</button>' +
      '</div></div>' : '') +
      '<div class="panel">' +
        '<div class="panel-head">' +
          '<div class="search">' + iconSearch() +
            '<input id="invSearch" type="search" placeholder="Search name, barcode or category" autocomplete="off" value="' + esc(ui.inv.search) + '">' +
            '<button type="button" class="scan-btn" data-act="open-scanner" data-mode="inventory">' + iconScan() + 'Scan</button>' +
          '</div>' +
          '<div class="chips">' +
            ['all', 'low', 'out', 'inactive'].map(function (f) {
              return '<button type="button" class="chip' + (ui.inv.filter === f ? ' on' : '') + '" data-act="inv-filter" data-filter="' + f + '">' +
                (f === 'all' ? 'All' : f === 'low' ? 'Low stock' : f === 'out' ? 'Out' : 'Inactive') + '</button>';
            }).join('') +
          '</div>' +
        '</div>' +
        '<div class="panel-body tight"><div class="table-wrap" id="invList"></div></div>' +
      '</div>' +
    '</div>';
  renderInvList();
};

function renderInvList() {
  const box = document.getElementById('invList');
  if (!box) return;
  const q = ui.inv.search.trim().toLowerCase();
  let list = db.items.slice();
  if (ui.inv.filter === 'low') list = list.filter(function (i) { return Number(i.stock) > 0 && Number(i.stock) <= Number(i.reorder || 0); });
  if (ui.inv.filter === 'out') list = list.filter(function (i) { return Number(i.stock) <= 0; });
  if (ui.inv.filter === 'inactive') list = list.filter(function (i) { return i.active === false; });
  if (q) list = list.filter(function (i) { return matchItem(i, q); });
  list.sort(function (a, b) { return a.name.localeCompare(b.name); });

  if (!list.length) {
    box.innerHTML = '<div class="empty"><strong>No items to show</strong>Add an item or change the filter.</div>';
    return;
  }

  box.innerHTML = '<table class="table"><thead><tr>' +
      '<th>Item</th><th class="num">Stock</th><th class="num">Reorder</th>' +
      '<th class="num">Cost</th><th class="num">Price</th><th class="num">Margin</th><th>Status</th>' +
    '</tr></thead><tbody>' +
    list.map(function (it) {
      const cost = Number(it.cost) || 0;
      const price = Number(it.price) || 0;
      const margin = price > 0 ? Math.round((price - cost) / price * 100) : 0;
      return '<tr class="clickable" data-act="edit-item" data-id="' + esc(it.id) + '">' +
        '<td class="name"><strong>' + esc(it.name) + '</strong><span>' + esc(it.category || 'Uncategorized') +
          (it.barcode ? ' · ' + esc(it.barcode) : '') + (it.active === false ? ' · inactive' : '') + '</span></td>' +
        '<td class="num">' + fmtQty(it.stock, it.unit) + ' ' + esc(it.unit) + '</td>' +
        '<td class="num">' + fmtQty(it.reorder || 0, it.unit) + ' ' + esc(it.unit) + '</td>' +
        '<td class="num">' + money(cost) + '</td>' +
        '<td class="num">' + money(price) + '</td>' +
        '<td class="num">' + margin + '%</td>' +
        '<td>' + stockBadge(it) + '</td>' +
      '</tr>';
    }).join('') +
    '</tbody></table>';
}

INPUTS.invSearch = function (input) {
  ui.inv.search = input.value;
  renderInvList();
};

ACTIONS['inv-filter'] = function (t) {
  ui.inv.filter = t.getAttribute('data-filter');
  render();
};
ACTIONS['show-low'] = function () {
  ui.inv.filter = 'low';
  render();
};
ACTIONS['new-item'] = function () { openItemModal(null, ''); };
ACTIONS['edit-item'] = function (t) {
  const it = itemById(t.getAttribute('data-id'));
  if (it) openItemModal(it);
};

function unitOptions(selected) {
  return UNITS.map(function (u) {
    return '<option value="' + u[0] + '"' + (u[0] === selected ? ' selected' : '') + '>' + u[0] + ' — ' + u[1] + '</option>';
  }).join('');
}

function openItemModal(item, prefillBarcode) {
  const isNew = !item;
  const it = item || {
    name: '', barcode: prefillBarcode || '', sku: '', category: '',
    unit: 'pc', cost: 0, price: 0, stock: 0, reorder: 0, active: true
  };
  const decimal = isDecimalUnit(it.unit);
  const step = decimal ? '0.001' : '1';

  openModal({
    title: isNew ? 'New item' : 'Edit item',
    body:
      '<div class="field"><label for="fName">Item name</label>' +
        '<input class="input" id="fName" value="' + esc(it.name) + '" placeholder="e.g. Lucky Me Pancit Canton" autocomplete="off"></div>' +
      '<div class="grid cols-2">' +
        '<div class="field"><label for="fBarcode">Barcode</label>' +
          '<input class="input mono" id="fBarcode" value="' + esc(it.barcode || '') + '" placeholder="Scan or type" autocomplete="off"></div>' +
        '<div class="field"><label for="fSku">SKU / code</label>' +
          '<input class="input mono" id="fSku" value="' + esc(it.sku || '') + '" autocomplete="off"></div>' +
      '</div>' +
      '<div class="grid cols-2">' +
        '<div class="field"><label for="fCategory">Category</label>' +
          '<input class="input" id="fCategory" value="' + esc(it.category || '') + '" placeholder="e.g. Grocery"></div>' +
        '<div class="field"><label for="fUnit">Unit of measure</label>' +
          '<select class="input" id="fUnit">' + unitOptions(it.unit) + '</select></div>' +
      '</div>' +
      '<div class="grid cols-2">' +
        '<div class="field"><label for="fCost">Unit cost</label>' +
          '<input class="input" id="fCost" type="number" inputmode="decimal" min="0" step="0.01" value="' + (Number(it.cost) || 0) + '"></div>' +
        '<div class="field"><label for="fPrice">Selling price</label>' +
          '<input class="input" id="fPrice" type="number" inputmode="decimal" min="0" step="0.01" value="' + (Number(it.price) || 0) + '"></div>' +
      '</div>' +
      '<div class="grid cols-2">' +
        '<div class="field"><label for="fStock">Stock on hand</label>' +
          '<input class="input" id="fStock" type="number" inputmode="decimal" min="0" step="' + step + '" value="' + (Number(it.stock) || 0) + '">' +
          '<span class="hint">In ' + esc(it.unit) + ' — decimals allowed for weight.</span></div>' +
        '<div class="field"><label for="fReorder">Reorder level</label>' +
          '<input class="input" id="fReorder" type="number" inputmode="decimal" min="0" step="' + step + '" value="' + (Number(it.reorder) || 0) + '">' +
          '<span class="hint">Alert when stock falls to this ' + (decimal ? 'weight' : 'amount') + '.</span></div>' +
      '</div>' +
      '<label class="inline small" style="gap:8px"><input type="checkbox" id="fActive"' + (it.active === false ? '' : ' checked') + '> Item is active and sellable</label>' +
      (isNew ? '' :
        '<hr class="hr">' +
        '<div class="panel" style="box-shadow:none;background:var(--surface-2)"><div class="panel-body stack">' +
          '<strong class="small">Receive stock (updates average cost)</strong>' +
          '<div class="grid cols-2">' +
            '<div class="field"><label for="fReceiveQty">Quantity in ' + esc(it.unit) + '</label>' +
              '<input class="input" id="fReceiveQty" type="number" inputmode="decimal" min="0" step="' + step + '" placeholder="0"></div>' +
            '<div class="field"><label for="fReceiveCost">Unit cost paid</label>' +
              '<input class="input" id="fReceiveCost" type="number" inputmode="decimal" min="0" step="0.01" value="' + (Number(it.cost) || 0) + '"></div>' +
          '</div>' +
          '<button type="button" class="btn sm" id="receiveBtn">Add to stock</button>' +
          '<p class="note" id="receiveNote"></p>' +
        '</div></div>'),
    foot:
      '<button type="button" class="btn" data-act="modal-close">Cancel</button>' +
      (isNew ? '' : '<button type="button" class="btn danger" data-act="delete-item" data-id="' + esc(it.id) + '">Delete</button>') +
      '<button type="button" class="btn primary" id="saveItem">' + (isNew ? 'Add item' : 'Save changes') + '</button>',
    onMount: function (root) {
      root.querySelector('#saveItem').addEventListener('click', function () { saveItem(root, item); });

      const receiveBtn = root.querySelector('#receiveBtn');
      if (receiveBtn) {
        receiveBtn.addEventListener('click', function () {
          const qty = num(root.querySelector('#fReceiveQty').value);
          const cost = num(root.querySelector('#fReceiveCost').value);
          if (!(qty > 0)) { toast('Enter the quantity received', 'err'); return; }
          const ownStock = num(root.querySelector('#fStock').value);
          const ownCost = num(root.querySelector('#fCost').value);
          const newStock = round(ownStock + qty, 3);
          const newCost = newStock > 0 ? round2((ownCost * ownStock + cost * qty) / newStock) : cost;
          root.querySelector('#fStock').value = newStock;
          root.querySelector('#fCost').value = newCost;
          root.querySelector('#fReceiveQty').value = '';
          const note = root.querySelector('#receiveNote');
          if (note) note.textContent = 'Added ' + fmtQty(qty, it.unit) + ' ' + it.unit + ' at ' + money(cost) +
            ' → new average cost ' + money(newCost) + '. Save changes to apply.';
        });
      }
      if (isNew) setTimeout(function () { root.querySelector('#fName').focus(); }, 70);
    }
  });
}

function saveItem(root, original) {
  const name = root.querySelector('#fName').value.trim();
  if (!name) { toast('Item name is required', 'err'); return; }
  const unit = root.querySelector('#fUnit').value;
  const barcode = root.querySelector('#fBarcode').value.trim();
  const cost = num(root.querySelector('#fCost').value);
  const price = num(root.querySelector('#fPrice').value);

  if (barcode) {
    const dup = db.items.filter(function (i) {
      return i.barcode === barcode && (!original || i.id !== original.id);
    })[0];
    if (dup) { toast('Barcode already used by ' + dup.name, 'err'); return; }
  }

  const data = {
    name: name,
    barcode: barcode,
    sku: root.querySelector('#fSku').value.trim(),
    category: root.querySelector('#fCategory').value.trim(),
    unit: unit,
    cost: round2(cost),
    price: round2(price),
    stock: clampQty(root.querySelector('#fStock').value, unit),
    reorder: clampQty(root.querySelector('#fReorder').value, unit),
    active: root.querySelector('#fActive').checked
  };

  if (original) {
    Object.assign(original, data);
  } else {
    data.id = uid('itm');
    data.created = new Date().toISOString();
    db.items.push(data);
  }
  saveDB();
  closeModal();
  toast(original ? 'Item updated' : 'Item added', 'ok');
  render();
}

ACTIONS['delete-item'] = function (t) {
  const it = itemById(t.getAttribute('data-id'));
  if (!it) return;
  closeModal();
  confirmDialog({
    title: 'Delete item',
    message: 'Delete "' + it.name + '" from inventory?',
    detail: 'Past sales keep their own copy of the item name, so reports stay intact.',
    confirmLabel: 'Delete item',
    kind: 'danger',
    onConfirm: function () {
      db.items = db.items.filter(function (x) { return x.id !== it.id; });
      ui.sales.cart = ui.sales.cart.filter(function (l) { return l.itemId !== it.id; });
      saveDB();
      toast('Item deleted');
      render();
    }
  });
};
