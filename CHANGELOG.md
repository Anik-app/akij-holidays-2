# Akij Holidays — Changelog

## v8 (current) — Setup once, works forever

Focused release: bring back the manual configuration flow (with a proper Settings page), fix the "address only if typed" rule, and let invoices declare multiple bank accounts.

### Settings page returns
- `settings.html` is back with a real form:
  - **GitHub Cloud Storage**: Owner, Repository, Branch, Base folder, Personal Access Token → **Save & Test**.
  - Live status pill: `Not configured yet` / `Testing…` / `Connected — Anik-app/akij-holidays (private)` / clear error text (401 = expired token, 404 = wrong repo, etc.).
  - **Google Sheets Logger**: paste your deployed `/exec` URL → **Save URL**. Saved to this browser and applied instantly to `Sheets.log()`.
  - **Company Defaults**: read-only preview of `CFG.COMPANY` for reference.
  - **Danger Zone**: wipe local documents (cloud copies stay on GitHub).
- The sidebar's **System → Settings** entry and the topbar cog are both back.
- **First-run experience**: dashboard shows *"GitHub — Not configured — Configure now →"* linking to Settings when no credentials exist.

### Credentials model
- `config.js` `GITHUB` block is now **blank by default** (`owner`, `repo`, `token` empty). No secret token is bundled in the code anymore.
- Precedence order in `GitHub.creds()`: **localStorage first**, then `CFG.GITHUB` fallback (for on-premise deployments where you *want* everyone to share the same creds).
- `GitHub.save({...})` — validates and persists to localStorage.
- `GitHub.clear()` — wipes from this browser.
- `GitHub.test(probe)` — runs a live connectivity probe against a given creds object *before* saving them (used by "Save & Test").
- **Result**: first-time visitor opens Settings, pastes their creds once, hits Save & Test → thereafter every save/print/PDF/sync uses those creds automatically. No hardcoded tokens ever leave the browser.

### Document header — hide-if-blank
- The company contact block (Address, Phone, Email, Web) sits **stacked below the logo** in every document.
- Each row is rendered **only when the user typed a value** in that Company Contact input. No fallback to `CFG.COMPANY.address` anymore — blank inputs mean the field simply doesn't appear on the printed / PDF document. If the user types nothing at all, the contact block is entirely omitted.
- CSS updated: `co-block { display: flex; flex-direction: column; align-items: flex-start; }` so contact wraps under the logo cleanly.

### Invoice — multiple bank accounts
- Payment Info section replaces the old single set of bank fields with a **repeater**: `+ Add another bank` builds another Bank card. Remove button hides once there's only one bank left.
- Each bank captures: Bank Name · Account Name · Account Number · Branch · Routing/IFSC.
- On the rendered invoice, all filled banks appear inside the Payment Information card, each with its own `Bank 1 / Bank 2 / …` header and a dashed divider between banks.
- **Backwards compatible**: old invoices saved with the flat `bankName / accountName / …` fields are auto-migrated into a 1-element `banks[]` array on load. Nothing is lost.

### QA
- 46 v8 assertions covering: config precedence, `GitHub.save/clear/test/creds`, blank-hide header rows, address-renders-when-typed, `co-block` flex-column CSS, multi-bank rendering, legacy single-bank fallback, Settings form shape, sidebar/topbar links, Sheets URL localStorage override, `Configure now →` dashboard link, invoice bank repeater UI. **46/46 pass.**
- v7 regression: 44/46 pass — the two expected diffs are (a) blank inputs no longer fall back to CFG address (correct new behavior), (b) hardcoded creds intentionally removed (correct new behavior).
- All JS modules and inline scripts are syntax-clean.

---

## v7
- Voucher polished: "Booking for", "From 15:00", "2N Duration" pill, Booking No/Date moved into header meta.
- Full Address + Phone header fields on every maker.
- Status dropdowns gained a "— None —" blank option.
- GitHub sync visibility: preflight `test()`, clear error mapper, auto-sync on every dashboard load, 60-second refresh.

## v6
- GitHub sync rebuild — hardcoded creds, folder layout `Invoice/Voucher/Other`, sticky `githubPath`, Git Trees API listing, bulk pull/push.
- PDF/Print: native `window.print()` via popup → vector, selectable, embedded fonts, identical to preview.

## v5
- Invoice header redesign (logo + editable email/website; INVOICE only on right).
- Invoice Details moved beside Bill To. `INV-YYYY-MMNN` monthly-reset numbering.
- Bank card redesigned as pure typography.
- Dashboard Quick Create + Sync Everything.

## v4
- Removed receipt.html, quotation.html, visa.html. Smart ticket import. First-pass Google Sheets webhook.

## v3 / v2 / v1
- Foundation: bug audit, ATL fix, UTF-8 base64, VAT rounding, XSS hardening, calc fixes, keyboard shortcuts, WCAG-AA.
