/* =========================================================
   Akij Holidays — Doc Actions (Production Build)
   Common save / print / PDF / copy / share wiring
   used by every maker.
   ========================================================= */
(function (global) {
  "use strict";

  const A = global.AkijApp;
  if (!A) return;
  const { Store, Toast, Print, PDF, GitHub, Sheets, Clipboard, nowIso, debounce } = A;
  const { renderByType, decorateTicket } = global.DocRenderers;

  /**
   * @param {object} opts
   *   getDoc()         → returns the current record object (with type set)
   *   validate()       → returns null if OK, else an error string
   *   onSaved(doc)     → optional callback
   *   setStatus(str)   → optional status text setter
   *   btnSave, btnPrint, btnPDF, btnCopy — optional buttons to wire
   *   previewNode      — optional preview element to render into
   */
  function attach(opts) {
    const { getDoc, validate, onSaved, setStatus } = opts;
    let busy = false;

    async function doSave() {
      if (busy) return null;
      const err = validate ? validate() : null;
      if (err) { Toast.show(err, "error"); return null; }
      busy = true;
      try {
        const doc = getDoc();
        setStatus?.("Saving…", "working");

        // Local (always)
        let saved;
        try { saved = Store.save(doc); }
        catch (e) { setStatus?.("Local save failed", "error"); Toast.show("Local save failed: " + e.message, "error"); return null; }

        // Sheets (fire-and-forget)
        if (Sheets.isEnabled()) Sheets.log(doc.type, doc).catch(() => {});

        // GitHub
        if (GitHub.isEnabled()) {
          setStatus?.("Uploading to GitHub…", "working");
          try {
            const res = await GitHub.saveDoc(doc);
            if (res.ok) {
              doc.githubPath = res.path; doc.githubUrl = res.html_url;
              doc.githubSha  = res.sha;  doc.syncedAt = nowIso();
              Store.save(doc);
              setStatus?.("Saved · Cloud synced ✓", "ok");
              Toast.show("Saved & uploaded to GitHub", "success");
            } else {
              setStatus?.("Saved locally · GitHub sync failed", "error");
              Toast.show("GitHub sync failed: " + (res.error || "unknown"), "warn", 6000);
            }
          } catch (e) {
            setStatus?.("Saved locally · Network error", "error");
            Toast.show("GitHub upload error: " + e.message, "warn", 5000);
          }
        } else {
          setStatus?.("Saved locally", "ok");
          Toast.show("Saved locally", "success", 1800);
        }
        onSaved?.(doc);
        return doc;
      } finally {
        busy = false;
      }
    }

    async function doPrint() {
      const doc = await doSave();
      if (!doc) return;
      const rendered = renderByType(doc);
      // Materialise barcode/QR for tickets so print keeps them as SVG.
      let bodyHTML = rendered.body;
      if (doc.type === "ticket") {
        const host = document.createElement("div");
        host.style.cssText = "position:fixed;left:-99999px;top:0;width:210mm;background:#fff;z-index:-1;";
        host.innerHTML = rendered.body;
        document.body.appendChild(host);
        try {
          decorateTicket(host);
          await new Promise(r => setTimeout(r, 300));
          bodyHTML = host.innerHTML;
        } finally { host.remove(); }
      }
      Print.open(bodyHTML, rendered.filename.replace(/\.pdf$/i, ""));
    }

    async function doPDF() {
      const doc = await doSave();
      if (!doc) return;
      const rendered = renderByType(doc);
      // For tickets, the barcode/QR must be materialised BEFORE we send
      // the HTML to the print window (SVG survives print/PDF perfectly).
      let bodyHTML = rendered.body;
      if (doc.type === "ticket") {
        const host = document.createElement("div");
        host.style.cssText = "position:fixed;left:-99999px;top:0;width:210mm;background:#fff;z-index:-1;";
        host.innerHTML = rendered.body;
        document.body.appendChild(host);
        try {
          decorateTicket(host);
          await new Promise(r => setTimeout(r, 300));
          bodyHTML = host.innerHTML;
        } finally { host.remove(); }
      }
      Toast.show("Preparing PDF preview…", "info", 1400);
      await PDF.download(bodyHTML, rendered.filename);
    }

    async function doCopy() {
      const err = validate ? validate() : null;
      if (err) { Toast.show(err, "error"); return; }
      const doc = getDoc();
      // Build a plain-text summary of key fields
      const rendered = renderByType(doc);
      // Strip HTML tags for a plain-text copy
      const tmp = document.createElement("div");
      tmp.innerHTML = rendered.body;
      // Remove style blocks
      tmp.querySelectorAll("style").forEach(el => el.remove());
      const text = tmp.textContent.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
      const ok = await Clipboard.writeText(text);
      Toast.show(ok ? "Copied document text to clipboard" : "Copy failed — try Print instead", ok ? "success" : "error");
    }

    opts.btnSave  && opts.btnSave.addEventListener("click", doSave);
    opts.btnPrint && opts.btnPrint.addEventListener("click", doPrint);
    opts.btnPDF   && opts.btnPDF.addEventListener("click", doPDF);
    opts.btnCopy  && opts.btnCopy.addEventListener("click", doCopy);

    // Keyboard shortcuts: Ctrl/Cmd+S = save, Ctrl/Cmd+P = print
    document.addEventListener("keydown", (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === "s" || e.key === "S") { e.preventDefault(); doSave(); }
      else if (e.key === "p" || e.key === "P") { e.preventDefault(); doPrint(); }
    });

    return { save: doSave, print: doPrint, pdf: doPDF, copy: doCopy };
  }

  /* Live-preview helper — renders the current doc into the preview node.
     Debounced so rapid typing doesn't thrash rendering. */
  function renderPreview(previewNode, doc) {
    if (!previewNode) return;
    const rendered = renderByType(doc);
    previewNode.innerHTML = rendered.body;
    if (doc.type === "ticket") {
      // Give layout a tick, then decorate barcode/QR
      requestAnimationFrame(() => decorateTicket(previewNode));
    }
  }

  // Debounced factory — pages call this once per maker.
  function makeDebouncedPreview(previewNode, getDoc, wait = 120) {
    return debounce(() => {
      try { renderPreview(previewNode, getDoc()); }
      catch (e) { console.error("Preview render error:", e); }
    }, wait);
  }

  global.DocActions = { attach, renderPreview, makeDebouncedPreview };
})(window);
