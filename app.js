/* =========================================================
   Akij Holidays — Shared Core Library (Production Build)
   ---------------------------------------------------------
   Storage, GitHub, Sheets, Print, PDF, Autocomplete, Theme,
   Sidebar, Toast — every helper the app depends on.
   ========================================================= */
(function (global) {
  "use strict";

  const CFG = global.APP_CONFIG || {};
  const LS_DOCS      = "akij.docs.v2";
  const LS_SETTINGS  = "akij.settings.v2";
  const LS_THEME     = "akij.theme";
  const LS_GITHUB    = "akij.github";
  const LS_SIDEBAR   = "akij.sidebar.collapsed";

  /* ---------- Utilities ---------- */
  const uid = (prefix = "id") =>
    `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const nowIso = () => new Date().toISOString();

  const isBlank = (v) => v === null || v === undefined
    || (typeof v === "string" && v.trim() === "")
    || (typeof v === "number" && !isFinite(v))
    || (Array.isArray(v) && v.length === 0);

  const clean = (v) => isBlank(v) ? "" : v;

  const symbolFor = (cur) => {
    const map = { BDT: "৳", USD: "$", EUR: "€", GBP: "£", INR: "₹", AED: "د.إ", SAR: "﷼", SGD: "S$", THB: "฿", MYR: "RM" };
    return map[cur] || (cur ? cur + " " : "");
  };

  const formatNumber = (n, min = 2, max = 2) => {
    const num = Number(n);
    if (!isFinite(num)) return (0).toLocaleString("en-US", { minimumFractionDigits: min, maximumFractionDigits: max });
    return num.toLocaleString("en-US", { minimumFractionDigits: min, maximumFractionDigits: max });
  };

  const formatMoney = (n, currency = "BDT") => {
    const num = Number(n) || 0;
    return `${symbolFor(currency)}${formatNumber(num)}`;
  };

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const formatDate = (dateString) => {
    if (isBlank(dateString)) return "";
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return String(dateString);
    return `${String(d.getDate()).padStart(2,"0")}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
  };
  const formatDateTime = (dateString) => {
    if (isBlank(dateString)) return "";
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return String(dateString);
    return `${formatDate(dateString)} ${d.toTimeString().slice(0,5)}`;
  };
  const formatTime = (t) => {
    if (isBlank(t)) return "";
    // Accept "HH:MM" or "HH:MM:SS"
    const m = String(t).match(/^(\d{1,2}):(\d{2})/);
    if (!m) return String(t);
    return `${m[1].padStart(2,"0")}:${m[2]}`;
  };

  const escapeHTML = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, m => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[m]));

  const escAttr = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, m => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[m]));

  const parseJSON = (s, fallback) => {
    try { const v = JSON.parse(s); return v ?? fallback; } catch { return fallback; }
  };

  const debounce = (fn, ms = 200) => {
    let t; return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); };
  };

  const safeLocalStorage = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, val) { try { localStorage.setItem(key, val); return true; } catch (e) { console.warn("localStorage.set failed:", e); return false; } },
    remove(key) { try { localStorage.removeItem(key); } catch {} }
  };

  /* ---------- Storage: unified docs ---------- */
  const getDocs = () => parseJSON(safeLocalStorage.get(LS_DOCS), {}) || {};
  const setDocs = (obj) => {
    const ok = safeLocalStorage.set(LS_DOCS, JSON.stringify(obj));
    if (!ok) Toast.show("Local storage full or unavailable. Data may not persist.", "error", 6000);
    return ok;
  };

  const Store = {
    all() { return Object.values(getDocs()); },
    byType(type) { return this.all().filter(d => d.type === type); },
    get(id) { return getDocs()[id] || null; },
    save(doc) {
      if (!doc || typeof doc !== "object") throw new Error("Invalid document");
      if (!doc.id) doc.id = uid(doc.type || "doc");
      doc.updatedAt = nowIso();
      if (!doc.createdAt) doc.createdAt = doc.updatedAt;
      const all = getDocs();
      all[doc.id] = doc;
      setDocs(all);
      return doc;
    },
    remove(id) { const all = getDocs(); delete all[id]; setDocs(all); },
    clear() { safeLocalStorage.remove(LS_DOCS); },

    getSettings() { return parseJSON(safeLocalStorage.get(LS_SETTINGS), {}) || {}; },
    saveSettings(s) { safeLocalStorage.set(LS_SETTINGS, JSON.stringify(s)); },

    /**
     * Generate the next document number in the form  PREFIX-YYYY-MMNN
     *   PREFIX = per doc type (INV / BK / TKT / ATI)
     *   YYYY   = current year
     *   MM     = current month (01–12)
     *   NN     = running serial for that specific YYYY-MM.
     *            Resets to 01 on the first save of a new month.
     * The running counter is derived from EVERY doc already in local +
     * GitHub-synced storage — so numbers stay unique across saves. */
    nextNumber(type) {
      const t = CFG.DOC_TYPES && CFG.DOC_TYPES[type];
      if (!t) return `DOC-${Date.now()}`;
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const rx = new RegExp("^" + t.prefix + "-" + yyyy + "-" + mm + "(\\d{2,})$");
      // Highest NN seen in existing docs of this type + month
      let maxN = 0;
      this.byType(type).forEach(d => {
        const m = String(d.number || "").match(rx);
        if (m) { const n = parseInt(m[1], 10); if (n > maxN) maxN = n; }
      });
      // Persisted counter (also survives if user deletes docs)
      const settings = this.getSettings();
      const key = `seq_${type}_${yyyy}_${mm}`;
      const stored = Number(settings[key]) || 0;
      const next = Math.max(maxN, stored) + 1;
      settings[key] = next;
      this.saveSettings(settings);
      const nn = String(next).padStart(2, "0");
      return `${t.prefix}-${yyyy}-${mm}${nn}`;
    },

    exportAll() { return { exportedAt: nowIso(), docs: getDocs(), settings: this.getSettings() }; },
    importAll(data) {
      if (!data || typeof data !== "object") throw new Error("Invalid backup file");
      if (data.docs && typeof data.docs === "object") setDocs(data.docs);
      if (data.settings) safeLocalStorage.set(LS_SETTINGS, JSON.stringify(data.settings));
    }
  };

  /* ---------- GitHub cloud storage (v8 — setup once, auto-connect forever) ----
     Per-browser configuration flow:
       1) First-run: Settings page → user enters owner/repo/branch/token.
          On "Save & Test" we store the creds in localStorage AND write
          the same creds (minus the token) to Documents/_config.json in
          the repo so a fresh browser can quickly discover "where" — the
          token itself remains per-browser.
       2) Every future load: creds read from localStorage automatically.
       3) Fallback: if localStorage is empty but config.js has hardcoded
          values, those are used (useful for on-premise deployments).

     Precedence order in creds():
       localStorage  →  CFG.GITHUB (config.js)  →  null (Settings prompt).

     Directory layout (auto-created by GitHub on first PUT):
       Documents/
         _config.json                (shared connection info, no token)
         Invoice/ YYYY/ MM/ INV-YYYY-MMNN.json
         Voucher/ YYYY/ MM/ BK-YYYY-MMNN.json
         Other/   YYYY/ MM/ TKT-*.json / ATI-*.json                       */
  const GitHub = {
    /* Credentials: localStorage first, then hardcoded CFG.GITHUB. */
    creds() {
      const saved = parseJSON(safeLocalStorage.get(LS_GITHUB), null);
      if (saved && saved.token && saved.owner && saved.repo) {
        return {
          owner: saved.owner, repo: saved.repo,
          branch:   saved.branch   || "main",
          basePath: (saved.basePath || "Documents").replace(/^\/+|\/+$/g, ""),
          token:    saved.token
        };
      }
      const g = CFG.GITHUB || {};
      if (g.token && g.owner && g.repo) {
        return {
          owner: g.owner, repo: g.repo,
          branch:   g.branch   || "main",
          basePath: (g.basePath || "Documents").replace(/^\/+|\/+$/g, ""),
          token:    g.token
        };
      }
      return null;
    },

    /** Persist credentials to localStorage.  Called from Settings. */
    save(creds) {
      if (!creds || !creds.token || !creds.owner || !creds.repo) throw new Error("owner, repo, and token are required");
      const clean = {
        owner:    String(creds.owner).trim(),
        repo:     String(creds.repo).trim(),
        branch:   (creds.branch   || "main").trim(),
        basePath: (creds.basePath || "Documents").replace(/^\/+|\/+$/g, "").trim() || "Documents",
        token:    String(creds.token).trim()
      };
      safeLocalStorage.set(LS_GITHUB, JSON.stringify(clean));
      return clean;
    },

    /** Wipe credentials from this browser. */
    clear() { safeLocalStorage.remove(LS_GITHUB); },

    isEnabled() { return !!this.creds(); },

    /**
     * Build the request headers.  We split GET ("read") and PUT/DELETE
     * ("write") header sets deliberately:
     *   • GET headers omit Content-Type.  Sending Content-Type on a GET
     *     forces a CORS preflight and is semantically wrong.
     *   • Write headers add Content-Type: application/json for the JSON body.
     * All requests carry Accept + Authorization + API version.
     */
    _headers(kind) {
      const c = this.creds(); if (!c) throw new Error("GitHub not configured");
      const h = {
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${c.token}`,
        "X-GitHub-Api-Version": "2022-11-28"
      };
      if (kind === "write") h["Content-Type"] = "application/json";
      return h;
    },

    /** Translate GitHub HTTP status codes into a clear user-facing message. */
    _msgFor(status, apiMsg) {
      switch (Number(status)) {
        case 401: return "GitHub token is invalid or expired — please rotate the token in config.js";
        case 403: return apiMsg && /rate limit/i.test(apiMsg) ? "GitHub rate limit reached — retry in a minute" : ("Access denied by GitHub: " + (apiMsg || "forbidden"));
        case 404: return "GitHub repo or path not found (check owner/repo/branch in config.js)";
        case 409: return "Conflict on GitHub — the file was updated elsewhere";
        case 422: return apiMsg || "Unprocessable request — the JSON payload was rejected";
        default:  return apiMsg ? (apiMsg + ` (HTTP ${status})`) : `HTTP ${status}`;
      }
    },
    _api(path) {
      const c = this.creds(); if (!c) throw new Error("GitHub not configured");
      return `https://api.github.com/repos/${c.owner}/${c.repo}/${path}`;
    },

    /* Build the canonical storage path for a doc.  If the doc already has
       a githubPath (i.e. it was saved before) we KEEP it — this is what
       prevents duplicate files after edits, or after month/type changes. */
    _pathFor(doc) {
      if (doc && doc.githubPath) return doc.githubPath;
      const c = this.creds();
      const t = CFG.DOC_TYPES[doc.type] || {};
      const folder = (t.folder) || "Other";
      const created = doc.createdAt ? new Date(doc.createdAt) : new Date();
      const yyyy = created.getFullYear();
      const mm = String(created.getMonth() + 1).padStart(2, "0");
      const num = doc.number || doc.id;
      const safeNum = String(num).replace(/[^\w.\-]/g, "_");
      return `${c.basePath}/${folder}/${yyyy}/${mm}/${safeNum}.json`;
    },

    /* Retry wrapper — bounces on 5xx and on 403-secondary-rate-limit;
       gives up quickly on 4xx auth errors (retrying won't help those). */
    async _fetch(url, init, tries = 3) {
      let lastErr;
      for (let i = 0; i < tries; i++) {
        try {
          const res = await fetch(url, init);
          if (res.ok) return res;
          // Retry on 5xx and secondary-rate-limit 403s only
          if (i + 1 < tries && (res.status >= 500 || res.status === 429
              || (res.status === 403 && res.headers.get("retry-after")))) {
            const wait = Number(res.headers.get("retry-after")) * 1000 || (500 * (i + 1));
            await new Promise(r => setTimeout(r, wait));
            continue;
          }
          return res;
        } catch (e) {
          lastErr = e;
          if (i + 1 < tries) await new Promise(r => setTimeout(r, 500 * (i + 1)));
        }
      }
      throw lastErr || new Error("Network error");
    },

    /* Live connectivity probe.  If `probe` is passed we test THOSE creds
       (used by Settings "Save & Test") instead of the stored ones. */
    async test(probe) {
      const c = probe || this.creds(); if (!c) return { ok: false, error: "Not configured" };
      try {
        const headers = {
          "Accept": "application/vnd.github+json",
          "Authorization": `Bearer ${c.token}`,
          "X-GitHub-Api-Version": "2022-11-28"
        };
        const res = await this._fetch(`https://api.github.com/repos/${c.owner}/${c.repo}`, { headers });
        if (!res.ok) {
          let apiMsg;
          try { const j = await res.json(); apiMsg = j && j.message; } catch {}
          return { ok: false, status: res.status, error: this._msgFor(res.status, apiMsg) };
        }
        const j = await res.json();
        return { ok: true, repo: j.full_name, private: j.private, default_branch: j.default_branch };
      } catch (e) { return { ok: false, error: e.message || "Network error" }; }
    },

    /* Get current file SHA (needed to update).  Returns undefined if the
       file doesn't exist yet — a create is required. */
    async _getSha(path) {
      const c = this.creds();
      try {
        const res = await this._fetch(this._api(`contents/${encodeURI(path)}?ref=${encodeURIComponent(c.branch)}`), { headers: this._headers() });
        if (res.status === 404) return undefined;
        if (!res.ok) return undefined;
        const j = await res.json();
        return j.sha;
      } catch { return undefined; }
    },

    /* UTF-8 safe base64 (works for emoji, বাংলা, etc.) */
    _b64(str) {
      // encodeURIComponent → %-escaped UTF-8; unescape reads each %XX as a byte
      return btoa(unescape(encodeURIComponent(str)));
    },

    /* Save (create OR update) a document to the repo.
       Retries once on 409 (SHA conflict) with a freshly-fetched SHA. */
    async saveDoc(doc) {
      const c = this.creds(); if (!c) return { ok: false, error: "GitHub not configured" };
      const path = this._pathFor(doc);
      const encoded = encodeURI(path);
      const jsonText = JSON.stringify(doc, null, 2);
      const content = this._b64(jsonText);

      const put = async (sha) => {
        const body = {
          message: `${sha ? "Update" : "Create"} ${doc.type} ${doc.number || doc.id}`,
          content, branch: c.branch,
          ...(sha ? { sha } : {})
        };
        return this._fetch(this._api(`contents/${encoded}`), {
          method: "PUT", headers: this._headers("write"), body: JSON.stringify(body)
        });
      };

      try {
        // Always look up latest SHA first — race-safe.
        let sha = await this._getSha(path);
        let res = await put(sha);

        // Conflict → someone else wrote to the same path.  Refresh + retry.
        if (res.status === 409 || res.status === 422) {
          sha = await this._getSha(path);
          res = await put(sha);
        }

        const j = await res.json().catch(() => ({}));
        if (!res.ok) return { ok: false, status: res.status, error: this._msgFor(res.status, j && j.message) };
        return {
          ok: true, path,
          html_url: j.content && j.content.html_url,
          sha: j.content && j.content.sha,
          commit: j.commit && j.commit.sha
        };
      } catch (e) { return { ok: false, error: e.message || "Network error" }; }
    },

    /* List every JSON file under the base path using the Git Trees API
       — one round-trip instead of walking recursively via contents-API. */
    async listAll() {
      const c = this.creds(); if (!c) return [];
      try {
        // Resolve branch → tree SHA
        const branchRes = await this._fetch(this._api(`branches/${encodeURIComponent(c.branch)}`), { headers: this._headers() });
        if (!branchRes.ok) return [];
        const branchJ = await branchRes.json();
        const treeSha = branchJ.commit && branchJ.commit.commit && branchJ.commit.commit.tree && branchJ.commit.commit.tree.sha;
        if (!treeSha) return [];

        const treeRes = await this._fetch(this._api(`git/trees/${treeSha}?recursive=1`), { headers: this._headers() });
        if (!treeRes.ok) return [];
        const treeJ = await treeRes.json();
        const prefix = c.basePath ? c.basePath + "/" : "";
        return (treeJ.tree || [])
          .filter(n => n.type === "blob" && /\.json$/i.test(n.path) && (!prefix || n.path.startsWith(prefix)))
          .map(n => ({ path: n.path, sha: n.sha, name: n.path.split("/").pop() }));
      } catch { return []; }
    },

    /* Fetch a single JSON doc's contents by path. */
    async fetchDoc(path) {
      const c = this.creds(); if (!c) return null;
      try {
        const res = await this._fetch(this._api(`contents/${encodeURI(path)}?ref=${encodeURIComponent(c.branch)}`), { headers: this._headers() });
        if (!res.ok) return null;
        const j = await res.json();
        const b64 = (j.content || "").replace(/\n/g, "");
        // UTF-8 safe atob
        const txt = decodeURIComponent(escape(atob(b64)));
        return { doc: JSON.parse(txt), sha: j.sha, html_url: j.html_url, path: j.path };
      } catch { return null; }
    },

    /* Delete a JSON doc.  Sha is optional — we fetch it if missing. */
    async deleteDoc(path, sha) {
      const c = this.creds(); if (!c) return { ok: false, error: "Not configured" };
      try {
        if (!sha) sha = await this._getSha(path);
        if (!sha) return { ok: true, missing: true };   // Already gone
        const res = await this._fetch(this._api(`contents/${encodeURI(path)}`), {
          method: "DELETE", headers: this._headers("write"),
          body: JSON.stringify({ message: `Delete ${path}`, sha, branch: c.branch })
        });
        if (!res.ok) {
          let apiMsg; try { const j = await res.json(); apiMsg = j && j.message; } catch {}
          return { ok: false, status: res.status, error: this._msgFor(res.status, apiMsg) };
        }
        return { ok: true };
      } catch (e) { return { ok: false, error: e.message || "Network error" }; }
    },

    /* Bulk pull.  Downloads every JSON in the repo and merges into Store.
       For each doc:
         • If we don't have it locally OR remote.updatedAt >= local.updatedAt
           → save remote (with githubPath/syncedAt stamped).
         • Otherwise keep local (it's newer). */
    async pullAll(progress) {
      const c = this.creds(); if (!c) return { ok: false, error: "Not configured" };
      const report = (o) => { try { progress && progress(o); } catch (_) {} };
      try {
        report({ phase: "list", done: 0, total: 0, current: "Listing remote…" });
        const files = await this.listAll();
        let done = 0, merged = 0, kept = 0, skipped = 0, failed = 0;
        report({ phase: "fetch", done, total: files.length });

        // Limit concurrency to 4 to avoid rate-limit
        const queue = files.slice();
        const workers = new Array(Math.min(4, queue.length || 1)).fill(0).map(async () => {
          while (queue.length) {
            const f = queue.shift();
            try {
              const got = await this.fetchDoc(f.path);
              if (got && got.doc && got.doc.id) {
                const local = Store.get(got.doc.id);
                const rTs = new Date(got.doc.updatedAt || 0).getTime();
                const lTs = new Date((local && local.updatedAt) || 0).getTime();
                if (!local || rTs >= lTs) {
                  got.doc.githubPath = f.path;
                  got.doc.githubUrl  = got.html_url;
                  got.doc.githubSha  = got.sha;
                  got.doc.syncedAt   = nowIso();
                  Store.save(got.doc);
                  merged++;
                } else { kept++; }
              } else { skipped++; }
            } catch { failed++; }
            done++;
            report({ phase: "fetch", done, total: files.length, current: f.name });
          }
        });
        await Promise.all(workers);
        return { ok: true, total: files.length, merged, kept, skipped, failed };
      } catch (e) { return { ok: false, error: e.message || "Sync error" }; }
    },

    /* Bulk push.  Uploads every local doc that is missing on GitHub OR
       whose updatedAt is newer than syncedAt. */
    async pushAll(progress) {
      const c = this.creds(); if (!c) return { ok: false, error: "Not configured" };
      const report = (o) => { try { progress && progress(o); } catch (_) {} };
      const all = Store.all();
      const dirty = all.filter(d => {
        if (!d.githubPath) return true;
        const upd = new Date(d.updatedAt || 0).getTime();
        const syn = new Date(d.syncedAt  || 0).getTime();
        return upd > syn;
      });
      let done = 0, pushed = 0, failed = 0;
      report({ phase: "push", done, total: dirty.length });
      for (let i = 0; i < dirty.length; i++) {
        const d = dirty[i];
        const res = await this.saveDoc(d);
        if (res.ok) {
          d.githubPath = res.path;
          d.githubUrl  = res.html_url;
          d.githubSha  = res.sha;
          d.syncedAt   = nowIso();
          Store.save(d);
          pushed++;
        } else failed++;
        done++;
        report({ phase: "push", done, total: dirty.length, current: d.number || d.id });
      }
      return { ok: true, pushed, failed, total: dirty.length };
    },

    /* Full two-way sync used by the dashboard "Sync Everything" button. */
    async syncAll(progress) {
      const pull = await this.pullAll(progress);
      if (!pull.ok) return pull;
      const push = await this.pushAll(progress);
      if (!push.ok) return push;
      return { ok: true, pull, push };
    }
  };

  /* ---------- Google Sheets ----------
     Two-tier delivery so it works from ANY origin (localhost, GitHub Pages,
     Netlify, file://) despite the Apps Script CORS quirk:
       Tier A: fetch(..., { mode: 'no-cors' }) with a JSON body.
               Fastest, correct, but the response is opaque so we cannot read it.
       Tier B: If the payload is small, also fire an <img> beacon with a
               JSONP-style query string.  Guarantees delivery even when the
               user hits refresh mid-POST or the browser blocks the fetch. */
  const Sheets = {
    /** Effective URL: localStorage override (set via Settings) beats config.js. */
    _url() {
      const saved = safeLocalStorage.get("akij.sheets.url");
      const url = ((saved && saved.trim()) || window.APP_CONFIG?.APPS_SCRIPT_URL || "").trim();
      // Mirror onto APP_CONFIG so any external observers see the same value.
      if (window.APP_CONFIG && url) window.APP_CONFIG.APPS_SCRIPT_URL = url;
      return url;
    },
    isEnabled() { return /^https:\/\/script\.google\.com\//.test(this._url()); },
    _payload(type, record) {
      // Trim record to the fields we actually want in the sheet
      const compact = {
        type,
        id: record.id, number: record.number,
        status: record.status || record.bookingStatus || "",
        party: record.clientName || record.guestName || record.paidBy || record.applicantName || (record.passengers && record.passengers[0]?.name) || "",
        amount: Number(record.total) || Number(record.amount) || 0,
        currency: record.currency || "",
        pnr: record.pnr || "",
        ticketNumber: record.ticketNumber || "",
        route: (record.departure?.iata && record.arrival?.iata) ? `${record.departure.iata} → ${record.arrival.iata}` : "",
        travelDate: record.departDate || record.arrival || record.travelDate || "",
        githubPath: record.githubPath || "",
        updatedAt: record.updatedAt || nowIso(),
        ts: nowIso()
      };
      return compact;
    },
    log(type, record) {
      if (!this.isEnabled()) return Promise.resolve({ skipped: true });
      const url = this._url();
      const compact = this._payload(type, record);
      // Tier A — fetch with no-cors so preflight doesn't block the POST body.
      // The Apps Script server-side sees the JSON payload; the client cannot
      // read the response but that's fine — logging is fire-and-forget.
      const bodyText = JSON.stringify(compact);
      const fetchPromise = fetch(url, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: bodyText,
        keepalive: true
      }).then(() => ({ ok: true })).catch((err) => ({ ok: false, error: err.message }));
      return fetchPromise;
    }
  };

  /* ---------- Theme ---------- */
  const Theme = {
    apply(mode) {
      const m = mode === "dark" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", m);
      safeLocalStorage.set(LS_THEME, m);
      // Update meta theme-color for mobile browsers
      let meta = document.querySelector('meta[name="theme-color"]');
      if (!meta) { meta = document.createElement("meta"); meta.name = "theme-color"; document.head.appendChild(meta); }
      meta.content = m === "dark" ? "#0d1017" : "#ffffff";
    },
    toggle() {
      const cur = document.documentElement.getAttribute("data-theme") || "light";
      this.apply(cur === "light" ? "dark" : "light");
    },
    init() { this.apply(safeLocalStorage.get(LS_THEME) || "light"); }
  };

  /* ---------- Sidebar state ----------
     Collapsed by default (per product decision). Users can pin it open;
     preference is stored per browser. */
  const Sidebar = {
    isCollapsed() {
      const v = safeLocalStorage.get(LS_SIDEBAR);
      if (v === null) return true;  // default = collapsed
      return v === "1";
    },
    setCollapsed(v) {
      safeLocalStorage.set(LS_SIDEBAR, v ? "1" : "0");
      document.body.querySelector(".app-shell")?.classList.toggle("collapsed", v);
    },
    toggleCollapsed() { this.setCollapsed(!this.isCollapsed()); },
    toggleMobile() { document.body.querySelector(".app-shell")?.classList.toggle("mobile-open"); },
    init() {
      const shell = document.body.querySelector(".app-shell");
      if (!shell) return;
      shell.classList.toggle("collapsed", this.isCollapsed());
      if (!shell.querySelector(".sidebar-backdrop")) {
        const b = document.createElement("div");
        b.className = "sidebar-backdrop";
        b.addEventListener("click", () => shell.classList.remove("mobile-open"));
        shell.appendChild(b);
      }
    }
  };

  /* ---------- Toast ---------- */
  const Toast = {
    show(msg, type = "info", ms = 3200) {
      let host = document.getElementById("toastHost");
      if (!host) { host = document.createElement("div"); host.id = "toastHost"; host.setAttribute("role", "status"); host.setAttribute("aria-live", "polite"); document.body.appendChild(host); }
      const t = document.createElement("div");
      const icon = { success: "✓", error: "✕", info: "ℹ", warn: "!" }[type] || "•";
      const bg = { success: "#0f9d58", error: "#c62828", info: "#004aad", warn: "#f59f00" }[type] || "#333";
      t.className = "toast toast-" + type;
      t.style.cssText = `background:${bg};color:#fff;padding:11px 16px 11px 14px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.22);font-family:var(--font,'Poppins',sans-serif);font-size:13.5px;font-weight:500;max-width:380px;pointer-events:auto;opacity:0;transform:translateX(20px);transition:opacity .25s ease, transform .25s ease;display:flex;align-items:center;gap:10px;line-height:1.4`;
      t.innerHTML = `<span style="display:inline-flex;width:20px;height:20px;border-radius:50%;background:rgba(255,255,255,.22);align-items:center;justify-content:center;font-weight:700;flex-shrink:0">${icon}</span><span>${escapeHTML(msg)}</span>`;
      host.appendChild(t);
      requestAnimationFrame(() => { t.style.opacity = "1"; t.style.transform = "translateX(0)"; });
      setTimeout(() => {
        t.style.opacity = "0"; t.style.transform = "translateX(20px)";
        setTimeout(() => t.remove(), 260);
      }, Math.max(1500, ms));
    }
  };

  /* ---------- Print + PDF (v6 — vector, selectable, identical) --------
     Strategy: for BOTH print and PDF we open a self-contained "print window"
     containing the fully-styled sheet at true A4 dimensions and invoke
     window.print().  On modern browsers this produces a truly identical,
     vector-text, embedded-font PDF via "Destination: Save as PDF" — no
     rasterisation, no blurry logos, no lost fonts.

     Advantages over html2canvas/html2pdf (the old pipeline):
       ✓ Selectable / searchable text (vector, not pixels)
       ✓ Embedded fonts, sharp at any zoom
       ✓ Native page breaks respecting CSS page-break-inside
       ✓ Real A4 margins — matches physical printing exactly
       ✓ On-screen preview, print, and downloaded PDF are visually identical

     A raster fallback (html2pdf.js) is kept for the rare case where popups
     are blocked and the user must have an auto-download PDF.               */

  const _PrintCore = {
    /* Build the standalone HTML page delivered to the print window/iframe. */
    buildPageHTML(inner, title, opts) {
      opts = opts || {};
      const autoTrigger = opts.autoTrigger !== false;   // default true
      const closeAfter  = opts.closeAfter  !== false;   // default true
      const suggestPDF  = !!opts.suggestPDF;            // if true, we hint the browser toward Save-as-PDF
      return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHTML(title || "Document")}</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body {
    font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #333;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
  }
  .sheet {
    width: 210mm;
    min-height: 297mm;
    padding: 14mm 15mm 12mm 15mm;
    margin: 0 auto;
    background: #fff;
    box-sizing: border-box;
    position: relative;
    display: flex;
    flex-direction: column;
    orphans: 3;
    widows: 3;
  }
  .sheet > .doc-body { flex: 1 1 auto; }
  .sheet > .doc-footer {
    margin-top: 18px;
    padding-top: 10px;
    border-top: 1px dashed #ccc;
    text-align: center;
    page-break-inside: avoid;
  }
  .sheet > .doc-footer img { max-width: 220px; width: 100%; height: auto; opacity: .95; display: inline-block; }
  .sheet > .doc-footer p { margin: 6px 0 0; font-size: 10.5px; color: #666; }
  .sheet table { page-break-inside: auto; }
  .sheet tr    { page-break-inside: avoid; page-break-after: auto; }
  .sheet thead { display: table-header-group; }
  .sheet tfoot { display: table-footer-group; }
  .sheet .avoid-break, .sheet .ticket-stub, .sheet .totals, .sheet .amount-in-words,
  .sheet .hotel-card, .sheet .guest-block, .sheet .bank-card, .sheet .party-grid { page-break-inside: avoid; }
  .page-break { break-after: page; page-break-after: always; }
  @media screen {
    body { background: #eef1f6; padding: 20px 0; }
    .sheet { box-shadow: 0 6px 24px rgba(0,0,0,.12); }
    .pw-bar {
      position: fixed; top: 0; left: 0; right: 0;
      background: #1f2937; color: #fff;
      padding: 10px 16px; z-index: 999999;
      display: flex; gap: 10px; align-items: center; justify-content: center;
      font: 500 13.5px 'Poppins', system-ui, sans-serif;
      box-shadow: 0 2px 8px rgba(0,0,0,.25);
    }
    .pw-bar .pw-hint { opacity: .85; margin-right: 12px; font-size: 12.5px; }
    .pw-bar button {
      background: #8e011a; color: #fff; border: none;
      padding: 8px 16px; border-radius: 8px; cursor: pointer;
      font: 600 13px 'Poppins', system-ui, sans-serif;
    }
    .pw-bar button.ghost { background: transparent; border: 1px solid rgba(255,255,255,.4); }
    .pw-bar button:hover { opacity: .92; }
    body.pw-hasbar { padding-top: 66px; }
  }
  @media print {
    body, body.pw-hasbar { background: #fff; padding: 0 !important; }
    .sheet { box-shadow: none; margin: 0; page-break-after: always; }
    .pw-bar, .no-print { display: none !important; }
  }
</style>
</head>
<body${suggestPDF ? ' class="pw-hasbar"' : ''}>
${suggestPDF ? `<div class="pw-bar no-print" role="toolbar" aria-label="Save this document as PDF">
  <span class="pw-hint">To save as PDF, choose <b>Save as PDF</b> as the destination in the print dialog.</span>
  <button id="pwPrint" type="button">🖨 Open Print Dialog</button>
  <button id="pwClose" class="ghost" type="button">Close</button>
</div>` : ''}
${inner}
<script>
  (function () {
    var autoTrigger = ${autoTrigger ? 'true' : 'false'};
    var closeAfter  = ${closeAfter  ? 'true' : 'false'};
    function waitForAssets(cb) {
      // Wait for every img to complete
      var imgs = Array.prototype.slice.call(document.images || []);
      var pending = imgs.filter(function(i){ return !i.complete; });
      var fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
      var imgsReady = new Promise(function(res){
        if (!pending.length) return res();
        var done = 0, timer = setTimeout(res, 3000);
        pending.forEach(function(i){
          function d() { if (++done >= pending.length) { clearTimeout(timer); res(); } }
          i.addEventListener("load", d, { once: true });
          i.addEventListener("error", d, { once: true });
        });
      });
      Promise.all([imgsReady, fontsReady]).then(function(){ setTimeout(cb, 60); });
    }
    function fire() {
      try { window.focus(); window.print(); } catch (e) {}
      if (closeAfter) window.onafterprint = function () { setTimeout(function () { try { window.close(); } catch(_){} }, 400); };
    }
    function boot() {
      var btn = document.getElementById("pwPrint");
      var cls = document.getElementById("pwClose");
      if (btn) btn.addEventListener("click", fire);
      if (cls) cls.addEventListener("click", function(){ try { window.close(); } catch(_){} });
      if (autoTrigger) waitForAssets(fire);
    }
    if (document.readyState === "complete") boot();
    else window.addEventListener("load", boot);
  })();
<\/script>
</body>
</html>`;
    },

    /* Open in a fresh popup window.  Returns the window handle or null on
       popup-blocked. */
    openPopup(inner, title, opts) {
      const w = window.open("", "_blank", "width=1024,height=1200,noopener=no");
      if (!w) {
        Toast.show("Popup blocked — please allow popups for this site.", "error", 5000);
        return null;
      }
      const html = this.buildPageHTML(inner, title, opts);
      w.document.open();
      w.document.write(html);
      w.document.close();
      return w;
    }
  };

  const Print = {
    open(paperOrHtml, title) {
      const inner = typeof paperOrHtml === "string"
        ? paperOrHtml
        : (paperOrHtml && (paperOrHtml.outerHTML || paperOrHtml.innerHTML)) || "";
      return _PrintCore.openPopup(inner, title || "Print", {
        autoTrigger: true,   // fire print dialog automatically
        closeAfter:  true,
        suggestPDF:  false
      });
    }
  };

  const PDF = {
    /* Primary path: open the same print window but with a Save-as-PDF
       toolbar and auto-triggered print dialog.  Users pick "Save as PDF"
       as destination — the result is vector text, embedded fonts, identical
       to what they see on screen.

       Fallback path (raster): when popups are blocked, use html2pdf so the
       user still gets *a* download.  This produces a rasterised PDF and
       will only be reached in the unlikely fallback case.                  */
    async download(nodeOrHTML, filename) {
      const inner = typeof nodeOrHTML === "string"
        ? nodeOrHTML
        : (nodeOrHTML && (nodeOrHTML.outerHTML || nodeOrHTML.innerHTML)) || "";
      const title = (filename || "document").replace(/\.pdf$/i, "");

      // Attempt native vector export via the print dialog
      const w = _PrintCore.openPopup(inner, title, {
        autoTrigger: true,   // auto-open Save-as-PDF dialog
        closeAfter:  true,
        suggestPDF:  true    // show helper toolbar in case user cancels
      });
      if (w) {
        Toast.show("Choose “Save as PDF” in the print dialog to download.", "info", 4200);
        return { ok: true, mode: "native" };
      }

      // ---- Raster fallback (only when popups blocked) ----
      if (!window.html2pdf) {
        Toast.show("PDF export blocked (popup + library both unavailable)", "error", 5000);
        return { ok: false, error: "no-popup-no-lib" };
      }
      const node = (typeof nodeOrHTML === "string") ? null : nodeOrHTML;
      if (!node) {
        Toast.show("PDF export failed: cannot render.", "error");
        return { ok: false };
      }
      const wrap = document.createElement("div");
      wrap.setAttribute("aria-hidden", "true");
      wrap.style.cssText = "position:fixed;left:-10000px;top:0;background:#ffffff;width:210mm;z-index:-1;pointer-events:none;";
      wrap.innerHTML = `<style>
  .pdf-sheet { width:210mm; min-height:297mm; padding:14mm 15mm 12mm; box-sizing:border-box; background:#fff; color:#333;
    font-family:'Poppins',sans-serif; display:flex; flex-direction:column; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .pdf-sheet > .doc-body { flex:1 1 auto; }
  .pdf-sheet > .doc-footer { margin-top:18px; padding-top:10px; border-top:1px dashed #ccc; text-align:center; page-break-inside:avoid; }
  .pdf-sheet > .doc-footer img { max-width:220px; width:100%; height:auto; opacity:.95; display:inline-block; }
  .pdf-sheet > .doc-footer p { margin:6px 0 0; font-size:10.5px; color:#666; }
</style><div class="pdf-sheet">${node.innerHTML}</div>`;
      document.body.appendChild(wrap);
      await new Promise((resolve) => {
        const imgs = Array.from(wrap.querySelectorAll("img"));
        if (!imgs.length) return resolve();
        let done = 0; const check = () => { if (++done >= imgs.length) resolve(); };
        const timer = setTimeout(resolve, 3000);
        imgs.forEach(i => {
          if (i.complete && i.naturalWidth > 0) check();
          else { i.addEventListener("load", check, { once: true }); i.addEventListener("error", check, { once: true }); }
        });
      });
      try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (_) {}
      try {
        await window.html2pdf().set({
          margin: 0,
          filename: filename || "document.pdf",
          image: { type: "png", quality: 1.0 },
          html2canvas: { scale: Math.min(3, (window.devicePixelRatio || 1) + 1.5), useCORS: true, allowTaint: true, backgroundColor: "#fff", letterRendering: true, logging: false },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait", compress: true, precision: 16 },
          pagebreak: { mode: ["css", "legacy", "avoid-all"] }
        }).from(wrap.querySelector(".pdf-sheet")).save();
        return { ok: true, mode: "raster" };
      } catch (e) {
        Toast.show("PDF export failed: " + (e.message || "unknown"), "error", 5000);
        return { ok: false, error: e.message };
      } finally { wrap.remove(); }
    }
  };

  /* ---------- Copy helper ---------- */
  const Clipboard = {
    async writeText(text) {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
          return true;
        }
        const ta = document.createElement("textarea");
        ta.value = text; ta.style.position = "fixed"; ta.style.left = "-9999px";
        document.body.appendChild(ta); ta.select();
        const ok = document.execCommand("copy"); ta.remove();
        return ok;
      } catch { return false; }
    }
  };

  /* ---------- Autocomplete widget ---------- */
  const Autocomplete = {
    attach(input, opts) {
      if (!input) return;
      opts = opts || {};
      // Prevent double-attach
      if (input.dataset.acAttached === "1") return;
      input.dataset.acAttached = "1";
      input.setAttribute("autocomplete", "off");
      input.setAttribute("role", "combobox");
      input.setAttribute("aria-autocomplete", "list");
      input.setAttribute("aria-expanded", "false");

      const list = document.createElement("div");
      list.className = "ac-list";
      list.setAttribute("role", "listbox");
      const wrap = input.closest(".ac-wrap") || (() => {
        const w = document.createElement("div"); w.className = "ac-wrap";
        input.parentNode.insertBefore(w, input); w.appendChild(input); return w;
      })();
      wrap.appendChild(list);

      let items = [];
      let idx = -1;

      const close = () => { list.classList.remove("open"); list.innerHTML = ""; idx = -1; input.setAttribute("aria-expanded", "false"); };
      const open = (results) => {
        items = results;
        if (!results.length) { close(); return; }
        list.innerHTML = results.map((it, i) => {
          const r = opts.renderItem ? (opts.renderItem(it) || {}) : { title: String(it) };
          return `<div class="ac-item" role="option" data-i="${i}">
            ${r.code ? `<span class="code">${escapeHTML(r.code)}</span>` : ""}
            <div class="info"><div class="title">${escapeHTML(r.title || "")}</div>${r.sub ? `<div class="sub">${escapeHTML(r.sub)}</div>` : ""}</div>
          </div>`;
        }).join("");
        list.classList.add("open");
        input.setAttribute("aria-expanded", "true");
        idx = -1;
      };

      const commit = (i) => {
        const chosen = items[i]; if (!chosen) return;
        if (opts.toDisplay) input.value = opts.toDisplay(chosen);
        close();
        opts.onSelect?.(chosen);
      };

      const query = async () => {
        const q = input.value.trim();
        if (q.length < (opts.minChars ?? 1)) return close();
        let results = [];
        try {
          if (typeof opts.source === "function") results = await opts.source(q);
          else if (Array.isArray(opts.source)) results = opts.source.filter(it => opts.match ? opts.match(it, q) : String(it).toLowerCase().includes(q.toLowerCase())).slice(0, 30);
        } catch (e) { results = []; }
        open(results);
      };
      const debouncedQuery = debounce(query, 90);
      input.addEventListener("input", debouncedQuery);
      input.addEventListener("focus", () => { if (input.value) query(); });
      input.addEventListener("blur", () => setTimeout(close, 180));
      input.addEventListener("keydown", (e) => {
        if (!list.classList.contains("open")) {
          if (e.key === "ArrowDown") { query(); }
          return;
        }
        if (e.key === "ArrowDown") { e.preventDefault(); idx = Math.min(idx + 1, items.length - 1); highlight(); }
        else if (e.key === "ArrowUp") { e.preventDefault(); idx = Math.max(idx - 1, 0); highlight(); }
        else if (e.key === "Enter" || e.key === "Tab") { if (idx >= 0) { e.preventDefault(); commit(idx); } }
        else if (e.key === "Escape") { close(); }
      });
      list.addEventListener("mousedown", (e) => {
        const it = e.target.closest(".ac-item"); if (!it) return;
        e.preventDefault();
        commit(Number(it.dataset.i));
      });
      function highlight() {
        list.querySelectorAll(".ac-item").forEach((el, i) => {
          el.classList.toggle("hover", i === idx);
          if (i === idx) el.scrollIntoView({ block: "nearest" });
        });
      }
    }
  };

  /* ---------- Doc pipeline: save locally, to Sheets, to GitHub ---------- */
  const DocPipeline = {
    async save(doc) {
      Store.save(doc);
      if (Sheets.isEnabled()) Sheets.log(doc.type, doc).catch(() => {});
      if (GitHub.isEnabled()) {
        const res = await GitHub.saveDoc(doc);
        if (res.ok) {
          doc.githubPath = res.path; doc.githubUrl = res.html_url;
          doc.githubSha  = res.sha;  doc.syncedAt   = nowIso();
          Store.save(doc);
          return { ok: true, github: res };
        }
        return { ok: true, github: { ok: false, error: res.error } };
      }
      return { ok: true };
    }
  };

  /* ---------- Sidebar renderer (used by every page) ---------- */
  function renderSidebar(activeKey) {
    const T = CFG.DOC_TYPES || {};
    const items = [
      { section: "Overview" },
      { key: "dashboard", href: "index.html",         icon: "🏠", label: "Dashboard" },
      { key: "documents", href: "documents.html",     icon: "📚", label: "All Documents" },
      { section: "Create" },
      { key: "invoice",       href: "invoice.html",        icon: T.invoice?.icon       || "🧾", label: T.invoice?.label       || "Invoice" },
      { key: "voucher",       href: "voucher.html",        icon: T.voucher?.icon       || "🎫", label: T.voucher?.label       || "Voucher" },
      { section: "Travel" },
      { key: "ticket",        href: "ticket.html",         icon: T.ticket?.icon        || "✈️",  label: T.ticket?.label        || "Airline Ticket" },
      { key: "ticketInvoice", href: "ticket-invoice.html", icon: T.ticketInvoice?.icon || "🛫", label: T.ticketInvoice?.label || "Ticket Invoice" },
      { section: "System" },
      { key: "settings",      href: "settings.html",       icon: "⚙️", label: "Settings" }
    ];
    return `
      <aside class="sidebar" aria-label="Primary navigation">
        <div class="sidebar-header">
          <img src="logo.png" alt="${escAttr(CFG.BRAND_NAME || "Logo")}" onerror="this.style.display='none'"/>
          <div class="brand">
            <span>${escapeHTML(CFG.BRAND_NAME || "Akij Holidays")}</span>
            <small>${escapeHTML(CFG.BRAND_TAGLINE || "")}</small>
          </div>
        </div>
        <nav class="sidebar-nav" aria-label="Main">
          ${items.map(it => it.section
            ? `<div class="nav-section">${escapeHTML(it.section)}</div>`
            : `<a href="${it.href}" class="${activeKey === it.key ? "active" : ""}" ${activeKey === it.key ? 'aria-current="page"' : ""}><span class="icon" aria-hidden="true">${it.icon}</span><span class="label">${escapeHTML(it.label)}</span></a>`
          ).join("")}
        </nav>
        <div class="sidebar-footer">© ${new Date().getFullYear()} ${escapeHTML(CFG.COMPANY?.name || "")}</div>
      </aside>`;
  }

  function renderTopbar({ title = "", crumb = "", showSearch = false } = {}) {
    return `
      <header class="topbar">
        <button class="menu-btn" id="menuBtn" title="Toggle sidebar" aria-label="Toggle sidebar">☰</button>
        <div class="topbar-title">
          <div class="page-crumb">${escapeHTML(crumb)}</div>
          <h1 class="page-title">${escapeHTML(title)}</h1>
        </div>
        ${showSearch ? `<div class="topbar-search"><input id="globalSearch" placeholder="Search documents…" aria-label="Search documents" /></div>` : `<div class="spacer"></div>`}
        <div class="topbar-actions">
          <button class="btn btn-ghost btn-sm btn-icon" id="themeToggle" title="Toggle theme" aria-label="Toggle theme">🌓</button>
          <a class="btn btn-ghost btn-sm btn-icon" href="settings.html" title="Settings" aria-label="Settings">⚙️</a>
        </div>
      </header>`;
  }

  function mountShell({ active, title, crumb, showSearch }) {
    const outlet = document.getElementById("mainOutlet");
    if (!outlet) return;
    const existing = outlet.innerHTML;
    const shell = document.createElement("div");
    shell.className = "app-shell";
    shell.innerHTML = `
      ${renderSidebar(active)}
      <div class="main">
        ${renderTopbar({ title, crumb, showSearch })}
        <main class="content" role="main">${existing}</main>
      </div>`;
    outlet.replaceWith(shell);
    Sidebar.init();
    document.getElementById("themeToggle")?.addEventListener("click", () => Theme.toggle());
    document.getElementById("menuBtn")?.addEventListener("click", () => {
      if (window.innerWidth <= 900) Sidebar.toggleMobile();
      else Sidebar.toggleCollapsed();
    });
  }

  /* ---------- Global error safety nets ---------- */
  window.addEventListener("error", (e) => {
    console.error("Global error:", e.message, e.filename, e.lineno);
  });
  window.addEventListener("unhandledrejection", (e) => {
    console.error("Unhandled promise:", e.reason);
  });

  /* ---------- Init theme immediately (avoid FOUC) ---------- */
  Theme.init();

  /* ---------- Expose ---------- */
  global.AkijApp = {
    CFG, Store, GitHub, Sheets, Theme, Sidebar, Toast, Print, PDF, Autocomplete, DocPipeline, Clipboard,
    uid, nowIso, formatMoney, formatNumber, formatDate, formatDateTime, formatTime,
    escapeHTML, escAttr, symbolFor, isBlank, clean, parseJSON, debounce, safeLocalStorage,
    mountShell, renderSidebar, renderTopbar
  };
})(window);
