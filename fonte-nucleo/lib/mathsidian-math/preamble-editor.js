// Mathsidian: janela flutuante pra editar os preâmbulos.
// - Abre/fecha pelo comando "Editar preâmbulos" ou pelo ícone Σ da barra lateral.
// - Mostra as camadas do preâmbulo da nota ativa (cofre, pastas, arquivos citados, LaTeX da nota)
//   e segue a nota que você abrir. Dá pra arrastar pelo título e redimensionar pelo canto.
// - Ctrl+S salva; depois de salvar, o TeX verifica se o preâmbulo compila.
// - Rascunhos não salvos ficam guardados por aba (trocar de aba ou de nota não perde nada).
(function () {
  "use strict";

  var POS_KEY = "mathsidian-preamble-editor-pos";
  var M = null; // window.MathsidianMath

  var ui = null; // elementos da janela
  var notePath = null; // nota ativa
  var layers = []; // camadas da nota ativa
  var extras = []; // camadas abertas pelo "Outros arquivos"
  var drafts = new Map(); // id -> {layer, text, saved}
  var currentId = null;
  var stale = true; // algo mudou enquanto a janela estava fechada

  // ---------- camadas ----------

  function layerId(l) {
    return l.kind === "inline" ? "inline:" + l.path : l.path;
  }

  function dirOf(p) {
    return p.split("/").slice(0, -1).join("/");
  }

  function label(l) {
    if (l.kind === "vault") return "Cofre";
    if (l.kind === "folder") return dirOf(l.path).split("/").pop() + "/";
    if (l.kind === "inline") return "Esta nota";
    return l.path.split("/").pop();
  }

  function scope(l) {
    if (l.kind === "vault") return "preamble.tex: vale para todas as notas do cofre.";
    if (l.kind === "folder") return l.path + ": vale para as notas de " + dirOf(l.path) + "/ e das subpastas.";
    if (l.kind === "inline") return "LaTeX na propriedade preamble de " + l.path + ": vale só para esta nota.";
    return l.path + ": vale para as notas que o citam na propriedade preamble.";
  }

  function fileLayer(path) {
    var name = M.PREAMBLE_NAME;
    if (path === name) return { kind: "vault", path: path };
    if (path.endsWith("/" + name)) return { kind: "folder", path: path };
    return { kind: "link", path: path };
  }

  function exists(path) {
    return !!window.app.vault.getAbstractFileByPath(path);
  }

  // Abas: as camadas da nota, mais as extras e as que têm rascunho não salvo.
  function tabs() {
    var list = layers.slice();
    var ids = new Set(list.map(layerId));
    var add = function (l) {
      if (!ids.has(layerId(l))) {
        ids.add(layerId(l));
        list.push(l);
      }
    };
    extras.forEach(add);
    drafts.forEach(function (d) {
      if (d.text !== d.saved) add(d.layer);
    });
    return list;
  }

  function readLayer(l) {
    if (l.kind === "inline") return Promise.resolve(l.text || "");
    var file = window.app.vault.getAbstractFileByPath(l.path);
    return file ? window.app.vault.read(file) : Promise.resolve("");
  }

  function isDirty(id) {
    var d = drafts.get(id);
    return !!d && d.text !== d.saved;
  }

  // ---------- janela ----------

  function savePos() {
    try {
      var r = ui.win.getBoundingClientRect();
      localStorage.setItem(POS_KEY, JSON.stringify({ x: r.left, y: r.top, w: r.width, h: r.height }));
    } catch (e) {}
  }

  function clamp() {
    var r = ui.win.getBoundingClientRect();
    var x = Math.min(Math.max(0, r.left), Math.max(0, window.innerWidth - 120));
    var y = Math.min(Math.max(0, r.top), Math.max(0, window.innerHeight - 40));
    ui.win.style.left = x + "px";
    ui.win.style.top = y + "px";
  }

  function build() {
    var win = document.body.createDiv({ cls: "mathsidian-pe" });
    var head = win.createDiv({ cls: "mathsidian-pe-head" });
    head.createSpan({ cls: "mathsidian-pe-title", text: "Σ Preâmbulos" });
    var note = head.createSpan({ cls: "mathsidian-pe-note" });
    var close = head.createEl("button", { cls: "mathsidian-pe-close", text: "×", attr: { "aria-label": "Fechar" } });
    var tabsEl = win.createDiv({ cls: "mathsidian-pe-tabs" });
    var scopeEl = win.createDiv({ cls: "mathsidian-pe-scope" });
    var text = win.createEl("textarea", { cls: "mathsidian-pe-text", attr: { spellcheck: "false" } });
    var foot = win.createDiv({ cls: "mathsidian-pe-foot" });
    var status = foot.createDiv({ cls: "mathsidian-pe-status" });
    var others = foot.createEl("select", { cls: "dropdown mathsidian-pe-others" });
    var check = foot.createEl("button", { text: "Verificar" });
    var save = foot.createEl("button", { cls: "mod-cta", text: "Salvar" });
    ui = { win: win, note: note, tabs: tabsEl, scope: scopeEl, text: text, status: status, others: others, save: save };

    try {
      var pos = JSON.parse(localStorage.getItem(POS_KEY) || "null");
      if (pos) {
        win.style.left = pos.x + "px";
        win.style.top = pos.y + "px";
        win.style.width = pos.w + "px";
        win.style.height = pos.h + "px";
      }
    } catch (e) {}

    close.addEventListener("click", hide);
    check.addEventListener("click", function () {
      verify();
    });
    save.addEventListener("click", function () {
      saveCurrent();
    });

    text.addEventListener("input", function () {
      var d = drafts.get(currentId);
      if (!d) return;
      d.text = text.value;
      renderTabs();
      setStatus(isDirty(currentId) ? "Não salvo" : "", "");
    });
    text.addEventListener("keydown", function (evt) {
      if (evt.key === "Tab" && !evt.ctrlKey && !evt.altKey && !evt.metaKey) {
        evt.preventDefault();
        var s = text.selectionStart;
        text.setRangeText("  ", s, text.selectionEnd, "end");
        text.dispatchEvent(new Event("input"));
      }
    });

    others.addEventListener("change", function () {
      var path = others.value;
      others.value = "";
      if (!path) return;
      var l = fileLayer(path);
      l.exists = exists(path);
      if (!extras.some((e) => layerId(e) === layerId(l))) extras.push(l);
      select(l);
    });

    // arrastar pelo título
    head.addEventListener("pointerdown", function (evt) {
      if (evt.button !== 0 || evt.target.closest("button")) return;
      var r = win.getBoundingClientRect();
      var dx = evt.clientX - r.left;
      var dy = evt.clientY - r.top;
      head.setPointerCapture(evt.pointerId);
      var move = function (e) {
        win.style.left = e.clientX - dx + "px";
        win.style.top = e.clientY - dy + "px";
      };
      var up = function () {
        head.removeEventListener("pointermove", move);
        head.removeEventListener("pointerup", up);
        clamp();
        savePos();
      };
      head.addEventListener("pointermove", move);
      head.addEventListener("pointerup", up);
    });
    // redimensionar (resize: both no CSS): guarda o tamanho
    var sizeTimer = 0;
    new ResizeObserver(function () {
      clearTimeout(sizeTimer);
      sizeTimer = setTimeout(savePos, 300);
    }).observe(win);
    window.addEventListener("resize", function () {
      if (isOpen()) clamp();
    });
  }

  function isOpen() {
    return !!ui && ui.win.isShown();
  }

  function show() {
    if (!ui) build();
    ui.win.show();
    clamp();
    if (stale) refresh();
    ui.text.focus();
  }

  function hide() {
    if (ui) ui.win.hide();
  }

  function toggle() {
    if (isOpen()) hide();
    else show();
  }

  function setStatus(msg, kind) {
    ui.status.empty();
    ui.status.className = "mathsidian-pe-status" + (kind ? " is-" + kind : "");
    if (msg) ui.status.setText(msg);
  }

  // ---------- conteúdo ----------

  function activeNote() {
    var file = window.app.workspace.getActiveFile();
    return file && file.extension === "md" ? file.path : null;
  }

  // Relê as camadas da nota ativa e mantém a aba atual se ela ainda fizer sentido.
  function refresh() {
    stale = false;
    notePath = activeNote();
    layers = M.preambleLayers(notePath);
    ui.note.setText(notePath ? notePath.replace(/\.md$/, "") : "nenhuma nota aberta");
    // camadas sem rascunho alterado acompanham o arquivo/propriedade
    layers.forEach(function (l) {
      var d = drafts.get(layerId(l));
      if (d) {
        d.layer = l;
        if (l.kind === "inline" && d.text === d.saved) d.text = d.saved = l.text || "";
      }
    });
    renderOthers();
    var list = tabs();
    var keep = list.find(function (l) {
      return layerId(l) === currentId;
    });
    select(keep || list[0], true);
  }

  function renderTabs() {
    ui.tabs.empty();
    tabs().forEach(function (l) {
      var id = layerId(l);
      var tab = ui.tabs.createEl("button", { cls: "mathsidian-pe-tab", text: label(l) });
      tab.setAttribute("title", scope(l));
      if (id === currentId) tab.addClass("is-active");
      if (!l.exists && !isDirty(id)) tab.addClass("is-missing");
      if (isDirty(id)) tab.addClass("is-dirty");
      tab.addEventListener("click", function () {
        select(l);
      });
    });
  }

  function renderOthers() {
    var shown = new Set(tabs().map(layerId));
    ui.others.empty();
    ui.others.createEl("option", { text: "Outros arquivos…", value: "" });
    window.app.vault
      .getFiles()
      .filter(function (f) {
        return f.extension === "tex" && !shown.has(f.path);
      })
      .sort(function (a, b) {
        return a.path.localeCompare(b.path);
      })
      .forEach(function (f) {
        ui.others.createEl("option", { text: f.path, value: f.path });
      });
  }

  function select(l, quiet) {
    if (!l) return;
    var id = layerId(l);
    currentId = id;
    renderTabs();
    ui.scope.setText(scope(l) + (l.exists || l.kind === "inline" ? "" : " Ainda não existe: salvar cria o arquivo."));
    var d = drafts.get(id);
    var show = function (d) {
      if (currentId !== id) return;
      if (ui.text.value !== d.text) ui.text.value = d.text;
      ui.text.placeholder =
        l.kind === "inline" ? "\\newcommand{\\X}{...}   (só esta nota)" : "\\newcommand{\\R}{\\mathbb{R}}";
      if (!quiet) setStatus(isDirty(id) ? "Não salvo" : "", "");
    };
    if (d) return show(d);
    readLayer(l).then(function (src) {
      var d2 = drafts.get(id) || { layer: l, text: src, saved: src };
      drafts.set(id, d2);
      show(d2);
    });
  }

  // ---------- salvar ----------

  function flatten(v) {
    if (Array.isArray(v))
      return v.reduce(function (acc, x) {
        return acc.concat(flatten(x));
      }, []);
    return v == null || v === "" || v === false ? [] : [String(v)];
  }

  function writeLayer(l, text) {
    var app = window.app;
    if (l.kind === "inline") {
      var file = app.vault.getAbstractFileByPath(l.path);
      if (!file) return Promise.reject(new Error("a nota não existe mais"));
      var src = text.replace(/\s+$/, "");
      return app.fileManager.processFrontMatter(file, function (fm) {
        // mantém os arquivos citados; troca só o LaTeX direto
        var links = flatten(fm[M.PREAMBLE_PROP]).filter(function (e) {
          return e.indexOf("\\") < 0;
        });
        var value = src ? links.concat([src]) : links;
        if (!value.length) delete fm[M.PREAMBLE_PROP];
        else fm[M.PREAMBLE_PROP] = value.length === 1 ? value[0] : value;
      });
    }
    var existing = app.vault.getAbstractFileByPath(l.path);
    if (existing) return app.vault.modify(existing, text);
    var dir = dirOf(l.path);
    var ready = dir && !app.vault.getAbstractFileByPath(dir) ? app.vault.createFolder(dir) : Promise.resolve();
    return ready.then(function () {
      return app.vault.create(l.path, text);
    });
  }

  function saveCurrent() {
    var id = currentId;
    var d = drafts.get(id);
    if (!d) return;
    var text = d.text;
    setStatus("Salvando…", "");
    return writeLayer(d.layer, text).then(
      function () {
        d.saved = text;
        d.layer.exists = true;
        if (d.layer.kind === "inline") d.layer.text = text;
        renderTabs();
        renderOthers();
        return verify("Salvo. ");
      },
      function (err) {
        setStatus("Não deu pra salvar: " + (err && err.message ? err.message : err), "error");
      }
    );
  }

  // ---------- verificar ----------

  // Monta o preâmbulo como ficaria com os rascunhos e compila com o TeX.
  function verify(prefix) {
    prefix = prefix || "";
    if (!M.hasTex) {
      setStatus(prefix + "Sem TeX aqui: não dá pra verificar.", "");
      return Promise.resolve();
    }
    var d = drafts.get(currentId);
    if (!d) return Promise.resolve();
    // a aba atual pode não ser da nota ativa: verifica no lugar dela
    var l = d.layer;
    var inChain = layers.some(function (x) {
      return layerId(x) === currentId;
    });
    var source = notePath;
    if (!inChain) source = l.kind === "folder" ? dirOf(l.path) + "/_.md" : l.kind === "inline" ? l.path : null;
    var overrides = new Map();
    drafts.forEach(function (x) {
      if (x.layer.kind !== "inline") overrides.set(x.layer.path, x.text);
    });
    var noteDraft = source && drafts.get("inline:" + source);
    if (noteDraft) overrides.set(M.INLINE, noteDraft.text);
    var pre = M.preambleFor(source, overrides);
    if (!inChain && l.kind === "link") pre += "\n" + d.text;
    var id = currentId;
    setStatus(prefix + "Verificando com o TeX…", "");
    return M.checkPreamble(pre).then(function (err) {
      if (currentId !== id) return;
      if (!err) setStatus(prefix + "✓ O preâmbulo compila.", "ok");
      else setStatus(prefix + "✗ Erro no preâmbulo:\n" + err, "error");
    });
  }

  // ---------- eventos ----------

  function onFileChange(file) {
    if (!file || !ui) return;
    if (file.extension === "tex") {
      var d = drafts.get(file.path);
      // só recarrega se não há rascunho: senão o texto do usuário ganha
      if (d && d.text === d.saved)
        window.app.vault.read(file).then(function (src) {
          d.saved = d.text = src;
          if (currentId === file.path && ui.text.value !== src) ui.text.value = src;
        });
      else if (d && d.text !== d.saved && currentId === file.path && isOpen())
        setStatus("O arquivo mudou fora do editor. Salvar sobrescreve.", "error");
    }
    if (isOpen()) refresh();
    else stale = true;
  }

  function setup() {
    var app = window.app;
    M = window.MathsidianMath;
    if (!app || !app.workspace || !app.commands || !app.vault || !app.metadataCache || !M)
      return setTimeout(setup, 500);
    app.commands.addCommand({
      id: "mathsidian:edit-preambles",
      name: "Editar preâmbulos",
      callback: toggle,
    });
    app.workspace.onLayoutReady(function () {
      if (app.workspace.leftRibbon)
        app.workspace.leftRibbon.addRibbonItemButton("mathsidian:edit-preambles", "sigma", "Editar preâmbulos", toggle);
      var later = function () {
        if (isOpen()) refresh();
        else stale = true;
      };
      app.workspace.on("file-open", later);
      // editar uma nota não muda as camadas (a propriedade chega pelo metadataCache)
      app.vault.on("modify", function (file) {
        if (file && file.extension === "tex") onFileChange(file);
      });
      app.vault.on("create", onFileChange);
      app.vault.on("delete", onFileChange);
      app.vault.on("rename", onFileChange);
      app.metadataCache.on("changed", function (file) {
        if (file && file.path === notePath) later();
      });
    });
  }

  // Ctrl+S dentro da janela salva o preâmbulo. O atalho do app escuta a janela na fase de captura e
  // engole o Ctrl+S; este script carrega antes do app.js, então este ouvinte roda primeiro.
  window.addEventListener(
    "keydown",
    function (evt) {
      if (!(evt.ctrlKey || evt.metaKey) || evt.altKey || evt.key.toLowerCase() !== "s") return;
      if (!ui || !(evt.target instanceof Element) || !ui.win.contains(evt.target)) return;
      evt.preventDefault();
      evt.stopImmediatePropagation();
      saveCurrent();
    },
    true
  );

  window.MathsidianPreambleEditor = { toggle: toggle, show: show, hide: hide };
  setup();
})();
