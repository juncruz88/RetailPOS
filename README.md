# Store POS — retail sales & inventory (PHP)

An offline point-of-sale app for sari-sari and small retail stores, built as one HTML app
that runs as an **Android APK** and as an **installable iPhone/iPad web app**. All data is
stored on the device — no server, no account, no internet needed.

Currency defaults to **Philippine Peso (₱)** and can be changed in Settings.

## What you get

| File | What it is |
| --- | --- |
| [`dist/StorePOS.apk`](dist/StorePOS.apk) | Signed Android app (Android 7.0+, ~214 KB) — open the link, then tap **Download** |
| [`dist/store-pos.html`](dist/store-pos.html) | The whole app in one ~512 KB file (styles, scripts, icon inlined) — just open it |
| [`dist/store-pos-web.zip`](dist/store-pos-web.zip) | The same app as plain HTML/CSS/JS — host it or open it anywhere |
| `www/` | The HTML app source (edit this, then rebuild) |
| `android/` | Native WebView wrapper used to produce the APK |
| `scripts/build-apk.sh` | Rebuilds and signs the APK |
| `scripts/make-icons.py` | Regenerates all icons from one drawing |

## Install

**Android** — copy `dist/StorePOS.apk` to the phone, tap it, allow "install unknown apps"
when prompted. The app appears as **Store POS**.

**Any browser, no install** — open `dist/store-pos.html`. It is self-contained, so it works
straight from disk or from any static host. Data still lives in that browser's local storage,
so use the same file/origin every time and keep JSON backups.

**iPhone / iPad** — iOS cannot install an APK and an `.ipa` can only be built with Xcode on a
Mac. Use the web app instead: serve `www/` over HTTPS, open it in Safari, then
**Share → Add to Home Screen**. It then runs full-screen with its own icon, works offline and
can use the camera for scanning. (Serve over HTTPS or `localhost` — Safari blocks camera
access on plain `file://` pages.)

**Test on this machine**

```bash
python3 -m http.server 3000 --directory www   # then open http://localhost:3000
```

## Features

- **Sales** — tap a product or scan it; quantity in pieces or by weight (kg); line discounts;
  running total in ₱.
- **Barcode scanner** — camera scanning via `BarcodeDetector` where available, with the bundled
  ZXing decoder as the universal fallback (Android WebView, iPhone Safari). A text field also
  accepts handheld USB/Bluetooth scanners.
- **Cash payment** — enter the amount handed over and the app shows the **change** due, or the
  **short amount (discrepancy)** when the cash is not enough, blocking completion until covered.
- **Card payment** — settle the sale by credit/debit card on your own terminal, then mark it as a
  card payment. No approval details are recorded and no change is computed; the sale is stored at
  the full amount and counted separately from cash in reports. A sales CSV whose method reads
  "card", "credit card" or "debit card" imports as a card payment.
- **Charge to account** — put the sale on a client's balance instead of taking cash.
- **Void / refund** — in **Reports → Find a past sale**, search by invoice, item or client and open a
  sale. **Void sale** reverses the whole thing: stock goes back to inventory, any account charge is
  reversed, and the sale stays in history marked voided (excluded from report totals).
- **Refund single lines** — in the same sale window, tick one or more lines and tap **Refund**: only
  those quantities go back to stock and only their share of the total (discount included) is
  reversed, as cash out of the drawer, a card refund, or a credit on the client's account. The rest
  of the sale stays posted; refunded quantities are shown on each line and the sale is badged
  *Refunded* in history.
- **Undo a void or refund** — taps are cheap to undo: a voided sale shows **Undo** in history (and in
  its window), and each refund line in a sale has its own **Undo**. Undoing puts stock back the way it
  was, restores the totals and removes the reversal from the client's balance.

Refunds and voids reduce the sale they belong to, so they change the report of the day the sale was
rung up (not the day of the refund). Both backup formats keep refund records: JSON stores them
natively, and the sales CSV carries `refunded_qty` per line plus a `refund_log` cell and the void
date/reason, so a restored backup still shows refunded and voided sales at their real (net) value.
- **Inventory** — name, barcode, SKU, category, unit, cost, selling price, stock, reorder level,
  margin and status. Reorder levels work in pieces **and** weight. *Receive stock* updates the
  weighted-average cost.
- **Accounts receivable** — client list with balances, charge and payment ledger, partial and
  over-payments, statement download, opening balances.
- **Reports** — daily, monthly and yearly: gross sales, cost of goods, profit, transactions,
  items sold, discounts, average sale, cash / card / account split, top items, receivables
  activity and the reorder list. Any report exports to CSV.
- **Backup & restore** — full JSON backup (everything) plus CSV per table
  (items, clients, sales, receivables, payments). Restore by replacing or merging; CSV import
  matches existing records so re-importing is safe.
- **Settings** — store name, owner/cashier, address, currency, receipt footer.

Data lives in `localStorage` inside the app. Backups go to the phone's **Downloads** folder on
Android (the app has a small native bridge for that); clearing app data deletes the store, so
keep a JSON backup.

## Rebuild the APK

Needs JDK 17+ and Android SDK `platforms;android-34` + `build-tools;34.0.0`:

```bash
export ANDROID_SDK_ROOT=$HOME/android-sdk
export JAVA_HOME=$HOME/tools/jdk
bash scripts/build-apk.sh
```

The script compiles resources with `aapt2`, compiles and dexes the Java wrapper with
`javac`/`d8`, aligns and signs it — no Gradle project needed.

Signing uses a self-signed key created once at `~/.storepos/storepos.keystore` (that key is fine
for sideloading; for Google Play, generate your own upload key and pass
`STOREPOS_KEYSTORE`, `STOREPOS_STOREPASS`, `STOREPOS_ALIAS`).

## Project layout

```
www/                 the app (HTML + CSS + 4 JS modules + ZXing bundle, PWA manifest, service worker)
  index.html         shell and navigation
  js/core.js         helpers, storage, modal, router, currency formatting
  js/pos.js          sales, cart, cash payment, scanner, inventory
  js/books.js        receivables and reports
  js/data.js         backup/restore CSV+JSON, settings, boot
android/             WebView wrapper (serves www over https://appassets.local so the camera works)
dist/                built APK and web zip
```
