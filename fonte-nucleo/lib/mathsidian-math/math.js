// Mathsidian: motor de matemática.
// - Toda fórmula ($...$ e $$...$$) é compilada pelo TeX instalado (latex -> dvisvgm -> SVG),
//   em lotes e com cache em disco; o que já está no cache aparece na hora.
// - Enquanto o TeX compila, o KaTeX mostra uma prévia instantânea. Sem TeX/Node (Quick Look),
//   o KaTeX é a saída final.
// - Blocos ```latex / ```tikz são documentos TeX inteiros, compilados do mesmo jeito.
// - preamble.tex na raiz do cofre entra em todo documento TeX; as definições valem também pro KaTeX.
// - Alt+clique numa fórmula copia o LaTeX dela.
(function () {
  "use strict";

  var nodeRequire = typeof window.require === "function" ? window.require : null;
  var fs = nodeRequire && nodeRequire("fs");
  var path = nodeRequire && nodeRequire("path");
  var crypto = nodeRequire && nodeRequire("crypto");
  var childProcess = nodeRequire && nodeRequire("child_process");
  var hasTex = !!childProcess;

  var PREAMBLE_FILE = "preamble.tex";
  var EM_PER_PT = 1.15 / 10; // 10pt do TeX = 1.15em do texto
  var BATCH_DELAY = 100;

  var macros = {};
  var preambleSource = "";
  var preambleLoaded = false;

  // ---------- utilitários ----------

  function sha1(s) {
    return crypto.createHash("sha1").update(s).digest("hex");
  }

  function cacheDir(sub) {
    var base = process.env.APPDATA || nodeRequire("os").homedir();
    var dir = path.join(base, "Mathsidian", "latex-cache", sub);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  // MiKTeX recém-instalado ainda não está no PATH do app (só depois de reiniciar): procura nos lugares padrão
  function texEnv() {
    var env = Object.assign({}, process.env);
    if (process.platform !== "win32") return env;
    var key = Object.keys(env).find(function (k) {
      return k.toUpperCase() === "PATH";
    }) || "PATH";
    var dirs = [
      path.join(env.LOCALAPPDATA || "", "Programs", "MiKTeX", "miktex", "bin", "x64"),
      path.join(env.ProgramFiles || "C:\\Program Files", "MiKTeX", "miktex", "bin", "x64"),
    ].filter(function (d) {
      return fs.existsSync(path.join(d, "latex.exe"));
    });
    env[key] = dirs.concat([env[key] || ""]).join(path.delimiter);
    return env;
  }

  function run(cmd, args, cwd) {
    return new Promise(function (resolve, reject) {
      childProcess.execFile(
        cmd,
        args,
        { cwd: cwd, env: texEnv(), timeout: 180000, windowsHide: true, maxBuffer: 64 * 1024 * 1024 },
        function (err, stdout, stderr) {
          if (err) {
            err.output = String(stdout || "") + String(stderr || "");
            reject(err);
          } else resolve(String(stdout || "") + String(stderr || ""));
        }
      );
    });
  }

  function texErrorSummary(dir, err) {
    var log = "";
    try {
      log = fs.readFileSync(path.join(dir, "doc.log"), "utf8");
    } catch (e) {}
    var lines = (log || err.output || "").split(/\r?\n/);
    var idx = lines.findIndex(function (l) {
      return l.startsWith("!");
    });
    if (idx >= 0) return lines.slice(idx, idx + 4).join("\n");
    if (err.code === "ENOENT") return "TeX não encontrado no PATH (precisa de latex e dvisvgm, ex.: MiKTeX).";
    return String(err.message || err).slice(0, 500);
  }

  // ---------- workers ----------
  // Cada processo do MiKTeX gasta ~0,7 s só pra iniciar, então os lotes rodam em paralelo,
  // cada worker na sua pasta fixa. Fórmulas visíveis (prioridade alta) passam na frente do
  // pré-aquecimento em segundo plano, que nunca ocupa todos os workers.
  var WORKERS = 3;
  var BACKGROUND_WORKERS = 2;
  var freeSlots = [];
  for (var w = 0; w < WORKERS; w++) freeSlots.push(w);
  var waiting = { high: [], low: [] };
  var busyLow = 0;

  function pump() {
    while (freeSlots.length) {
      var next = waiting.high.shift();
      if (!next && busyLow < BACKGROUND_WORKERS) next = waiting.low.shift();
      if (!next) return;
      var slot = freeSlots.shift();
      if (next.low) busyLow++;
      next.resolve(slot);
    }
  }

  // Executa job(slot) quando houver worker livre.
  function withSlot(low, job) {
    return new Promise(function (resolve) {
      (low ? waiting.low : waiting.high).push({ low: low, resolve: resolve });
      pump();
    }).then(function (slot) {
      var release = function () {
        if (low) busyLow--;
        freeSlots.push(slot);
        pump();
      };
      return Promise.resolve()
        .then(function () {
          return job(slot);
        })
        .then(
          function (v) {
            release();
            return v;
          },
          function (e) {
            release();
            throw e;
          }
        );
    });
  }

  function slotDir(slot) {
    return cacheDir(path.join("work", "w" + slot));
  }

  // ---------- formato pré-compilado ----------
  // O cabeçalho das fórmulas (pacotes + preamble.tex) vira um .fmt: cada lote pula o carregamento
  // dos pacotes (tikz-cd sozinho custa ~1 s). Se o cabeçalho não compilar, cai no documento inteiro.
  var formats = new Map(); // nome -> Promise<nome|null>

  function ensureFormat(header) {
    var name = "m" + sha1(header).slice(0, 12);
    if (formats.has(name)) return formats.get(name);
    var dir = cacheDir("fmt");
    var job = fs.existsSync(path.join(dir, name + ".fmt"))
      ? Promise.resolve(name)
      : withSlot(false, function () {
          fs.writeFileSync(path.join(dir, name + ".tex"), header + "\n\\dump\n");
          return run("latex", ["-ini", "-interaction=nonstopmode", "-halt-on-error", "-jobname=" + name, "&latex", name + ".tex"], dir).then(
            function () {
              return name;
            },
            function () {
              return null;
            }
          );
        });
    formats.set(name, job);
    return job;
  }

  // Copia o formato pra pasta do worker (o MiKTeX não aceita -fmt com caminho absoluto).
  function useFormat(dir, name) {
    var target = path.join(dir, name + ".fmt");
    if (!fs.existsSync(target)) fs.copyFileSync(path.join(cacheDir("fmt"), name + ".fmt"), target);
    return "-fmt=" + name;
  }

  function clearDir(dir) {
    fs.readdirSync(dir).forEach(function (f) {
      if (!f.endsWith(".fmt")) fs.rmSync(path.join(dir, f), { force: true });
    });
  }

  // Roda latex + dvisvgm na pasta do worker; devolve [{svg, width, height, depth}] por página.
  // fmt: nome de um formato pré-compilado (o doc então começa em \begin{document}).
  function compileDocument(doc, slot, fmt) {
    var dir = slotDir(slot);
    clearDir(dir);
    fs.writeFileSync(path.join(dir, "doc.tex"), doc);
    var args = ["-interaction=nonstopmode", "-halt-on-error", "doc.tex"];
    if (fmt) args.unshift(useFormat(dir, fmt));
    return run("latex", args, dir)
      .then(function () {
        return run(
          "dvisvgm",
          ["--no-fonts", "--currentcolor", "--bbox=preview", "--page=1-", "--output=p%p.svg", "doc.dvi"],
          dir
        );
      })
      .then(function (out) {
        // dvisvgm informa as medidas do preview: "width=..pt, height=..pt, depth=..pt"
        var dims = [];
        out.replace(/width=([\d.]+)pt, height=([\d.]+)pt, depth=([\d.]+)pt/g, function (_, w, h, d) {
          dims.push({ width: +w, height: +h, depth: +d });
        });
        // dvisvgm numera as páginas com zeros à esquerda quando há 10 ou mais (p01.svg...)
        var files = fs
          .readdirSync(dir)
          .filter(function (f) {
            return /^p\d+\.svg$/.test(f);
          })
          .sort(function (a, b) {
            return parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10);
          });
        return dims.map(function (dim, i) {
          dim.svg = fs.readFileSync(path.join(dir, files[i]), "utf8");
          return dim;
        });
      })
      .catch(function (err) {
        throw new Error(texErrorSummary(dir, err));
      });
  }

  // SVG inline (pra herdar a cor do tema), com ids prefixados pra não colidir com outras fórmulas.
  function svgElement(page, key) {
    var prefix = "m" + key.slice(0, 10) + "-";
    var src = page.svg
      .replace(/<\?xml[^>]*\?>/, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/id='/g, "id='" + prefix)
      .replace(/href='#/g, "href='#" + prefix)
      // o --currentcolor do dvisvgm não pega o preto vindo dos specials do TikZ
      .replace(/(fill|stroke)='#000(000)?'/g, "$1='currentColor'");
    var tpl = document.createElement("template");
    tpl.innerHTML = src.trim();
    var svg = tpl.content.firstElementChild;
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    svg.style.width = page.width * EM_PER_PT + "em";
    svg.style.height = (page.height + page.depth) * EM_PER_PT + "em";
    svg.style.verticalAlign = -page.depth * EM_PER_PT + "em";
    svg.setAttribute("aria-hidden", "true");
    return svg;
  }

  // ---------- KaTeX (prévia) ----------

  function katexOptions(display) {
    return {
      displayMode: display,
      throwOnError: true,
      strict: "ignore",
      trust: false,
      globalGroup: true,
      macros: macros,
      output: "htmlAndMathml",
    };
  }

  function katexInto(el, source, display) {
    try {
      window.katex.render(source, el, katexOptions(display));
      return true;
    } catch (err) {
      el.setText(source);
      el.setAttribute("title", String((err && err.message) || err));
      return false;
    }
  }

  // ---------- fórmulas ($...$ / $$...$$) ----------

  var MATH_PACKAGES = [
    "\\usepackage{amsmath,amssymb,amsthm,mathtools,bm,cancel,xcolor,varwidth}",
    "\\usepackage[version=4]{mhchem}",
    "\\def\\pgfsysdriver{pgfsys-dvisvgm.def}",
    "\\usepackage{tikz-cd}",
  ].join("\n");

  var DISPLAY_ENV = /^\s*\\begin\{(align|alignat|equation|gather|multline|flalign|eqnarray)\*?\}/;
  // Ambientes sem numeração que têm versão "interna" com caixa justa.
  var TIGHT_ENV = { "align*": "aligned", "gather*": "gathered", "alignat*": "alignedat", "equation*": null };

  // Toda fórmula vira uma caixa do tamanho exato dela (pra centralizar certo). Só fica na
  // largura da linha o que precisa: ambientes numerados (o número vai na margem), \tag e split.
  function snippet(source, display) {
    if (!display) return "\\begin{preview}$" + source + "$\\end{preview}";
    var env = source.match(/^\s*\\begin\{([a-z]+\*?)\}([\s\S]*)\\end\{\1\}\s*$/);
    if (env && env[1] in TIGHT_ENV && !/\\tag|\\label/.test(source)) {
      var inner = TIGHT_ENV[env[1]];
      var body = inner ? "\\begin{" + inner + "}" + env[2] + "\\end{" + inner + "}" : env[2];
      return "\\begin{preview}$\\displaystyle " + body + "$\\end{preview}";
    }
    if (!DISPLAY_ENV.test(source) && !/\\tag|\\label|\\begin\{split\}/.test(source))
      return "\\begin{preview}$\\displaystyle " + source + "$\\end{preview}";
    var full = DISPLAY_ENV.test(source) ? source : "\\[" + source + "\\]";
    return "\\begin{preview}\\begin{varwidth}{\\linewidth}" + full + "\\end{varwidth}\\end{preview}";
  }

  function mathHeader() {
    return ["\\documentclass{article}", MATH_PACKAGES, preambleSource, "\\usepackage[active,tightpage]{preview}"].join("\n");
  }

  function mathBody(snippets) {
    return "\\begin{document}\n" + snippets.join("\n\n") + "\n\\end{document}\n";
  }

  var mathCache = new Map(); // key -> page | {error}
  var pending = new Map(); // key -> {source, display}
  var batchTimer = 0;

  var MATH_LAYOUT = "v2"; // muda quando o snippet() muda, pra não reaproveitar SVG antigo

  function mathKey(source, display) {
    return sha1(MATH_LAYOUT + "\0" + preambleSource + "\0" + (display ? "D" : "I") + "\0" + source);
  }

  function readMathCache(key) {
    if (mathCache.has(key)) return mathCache.get(key);
    try {
      var page = JSON.parse(fs.readFileSync(path.join(cacheDir("math"), key + ".json"), "utf8"));
      mathCache.set(key, page);
      return page;
    } catch (e) {
      return null;
    }
  }

  function writeMathCache(key, page) {
    mathCache.set(key, page);
    fs.writeFile(path.join(cacheDir("math"), key + ".json"), JSON.stringify(page), function () {});
  }

  function applyResult(el, key, result) {
    el.removeClass("is-pending");
    if (result.error) {
      el.addClass("mathsidian-math-error");
      el.setAttribute("title", result.error);
      return;
    }
    el.removeClass("mathsidian-math-error");
    el.removeAttribute("title");
    el.empty();
    el.appendChild(svgElement(result, key));
  }

  function settle(key, result) {
    if (!result.error) writeMathCache(key, result);
    else mathCache.set(key, result);
    var els = document.querySelectorAll('[data-math-key="' + key + '"]');
    for (var i = 0; i < els.length; i++) applyResult(els[i], key, result);
  }

  var compiling = new Set(); // chaves já entregues a um worker

  // Compila um lote no worker `slot`. Uma fórmula ruim derruba o lote inteiro: aí divide e
  // recompila no mesmo worker pra isolar a culpada.
  function compileBatch(items, slot) {
    var header = mathHeader();
    return ensureFormat(header)
      .then(function (fmt) {
        var snippets = items.map(function (it) {
          return snippet(it.source, it.display);
        });
        return compileDocument(fmt ? mathBody(snippets) : header + "\n" + mathBody(snippets), slot, fmt);
      })
      .then(
        function (pages) {
          if (pages.length !== items.length) throw new Error("número de páginas inesperado");
          items.forEach(function (it, i) {
            settle(it.key, pages[i]);
          });
        },
        function (err) {
          if (items.length === 1) return settle(items[0].key, { error: err.message });
          var mid = Math.ceil(items.length / 2);
          return compileBatch(items.slice(0, mid), slot).then(function () {
            return compileBatch(items.slice(mid), slot);
          });
        }
      );
  }

  // Divide em lotes e manda pros workers. Lotes menores na frente = paralelismo; no fundo, lotes maiores.
  function schedule(items, low) {
    var size = low ? 60 : Math.max(8, Math.ceil(items.length / WORKERS));
    for (var i = 0; i < items.length; i += size) {
      (function (chunk) {
        withSlot(low, function (slot) {
          // no fundo, pula o que já ficou pronto enquanto esperava
          chunk = chunk.filter(function (it) {
            return !compiling.has(it.key) && !mathCache.has(it.key);
          });
          if (!chunk.length) return;
          chunk.forEach(function (it) {
            compiling.add(it.key);
          });
          return compileBatch(chunk, slot).then(
            function () {
              chunk.forEach(function (it) {
                compiling.delete(it.key);
              });
            },
            function () {
              chunk.forEach(function (it) {
                compiling.delete(it.key);
              });
            }
          );
        });
      })(items.slice(i, i + size));
    }
  }

  function flush() {
    batchTimer = 0;
    if (!pending.size) return;
    var items = [];
    pending.forEach(function (it, key) {
      items.push({ key: key, source: it.source, display: it.display });
    });
    pending.clear();
    schedule(items, false);
  }

  // ---------- pré-aquecimento: compila em segundo plano as fórmulas do cofre ----------

  // Acha as fórmulas de uma nota do mesmo jeito que o leitor de Markdown as entrega.
  function extractMath(text) {
    var found = [];
    text = text
      .replace(/^---\n[\s\S]*?\n---\n/, "")
      .replace(/^(\s*>)+ ?/gm, "")
      .replace(/^```[\s\S]*?^```/gm, "")
      .replace(/`[^`\n]*`/g, "");
    text = text.replace(/\$\$([\s\S]+?)\$\$/g, function (_, src) {
      found.push({ source: src.trim(), display: true });
      return " ";
    });
    text.replace(/(^|[^\\$])\$(?=\S)((?:\\.|[^$\\\n])+?)\$(?!\d)/g, function (_, pre, src) {
      if (!/\s$/.test(src)) found.push({ source: src.trim(), display: false });
    });
    return found;
  }

  var prewarmTimer = 0;
  function prewarmFiles(files) {
    var app = window.app;
    var seen = new Set();
    var items = [];
    var reads = files
      .filter(function (f) {
        return f.stat.size < 512 * 1024;
      })
      .map(function (f) {
        return app.vault.cachedRead(f).then(function (text) {
          extractMath(text).forEach(function (m) {
            var key = mathKey(m.source, m.display);
            if (seen.has(key) || compiling.has(key) || readMathCache(key)) return;
            seen.add(key);
            items.push({ key: key, source: m.source, display: m.display });
          });
        });
      });
    return Promise.all(reads).then(function () {
      if (items.length) schedule(items, true);
      return items.length;
    });
  }

  function prewarmVault() {
    clearTimeout(prewarmTimer);
    prewarmTimer = setTimeout(function () {
      prewarmFiles(window.app.vault.getMarkdownFiles());
    }, 1500);
  }

  function render(source, display) {
    source = source.trim();
    var el = document.createElement(display ? "div" : "span");
    el.className = "mathsidian-math";
    el.dataset.latex = source;
    if (!source) return el;
    if (!preambleLoaded && vaultBasePath()) loadPreamble();
    if (!hasTex) {
      if (!katexInto(el, source, display)) el.addClass("mathsidian-math-error");
      return el;
    }
    var key = mathKey(source, display);
    el.dataset.mathKey = key;
    var cached = readMathCache(key);
    if (cached) {
      applyResult(el, key, cached);
      return el;
    }
    el.addClass("is-pending");
    katexInto(el, source, display);
    if (!pending.has(key) && !compiling.has(key)) pending.set(key, { source: source, display: display });
    if (!batchTimer) batchTimer = setTimeout(flush, BATCH_DELAY);
    return el;
  }

  // ---------- blocos ```latex / ```tikz ----------

  function blockDocument(lang, body) {
    if (/\\documentclass/.test(body)) return body;
    var isTikz = lang === "tikz";
    if (isTikz && !/\\begin\{(tikzpicture|tikzcd)\}/.test(body))
      body = "\\begin{tikzpicture}\n" + body + "\n\\end{tikzpicture}";
    return [
      "\\documentclass{article}",
      MATH_PACKAGES,
      "\\usepackage{pgfplots}",
      "\\pgfplotsset{compat=newest}",
      "\\usetikzlibrary{arrows.meta,calc,positioning,decorations.pathreplacing,patterns,shapes}",
      preambleSource,
      "\\usepackage[active,tightpage]{preview}",
      "\\begin{document}",
      "\\begin{preview}" + (isTikz ? body : "\\begin{varwidth}{\\linewidth}" + body + "\\end{varwidth}") + "\\end{preview}",
      "\\end{document}",
      "",
    ].join("\n");
  }

  var blockCache = new Map();

  function compileBlock(lang, body) {
    var doc = blockDocument(lang, body);
    var key = sha1(doc);
    if (blockCache.has(key)) return blockCache.get(key);
    var file = path.join(cacheDir("blocks"), key + ".json");
    var job;
    try {
      job = Promise.resolve(JSON.parse(fs.readFileSync(file, "utf8")));
    } catch (e) {
      job = withSlot(false, function (slot) {
        return compileDocument(doc, slot);
      }).then(function (pages) {
        fs.writeFileSync(file, JSON.stringify(pages[0]));
        return pages[0];
      });
      job.catch(function () {
        blockCache.delete(key);
      });
    }
    var withKey = job.then(function (page) {
      return { page: page, key: key };
    });
    blockCache.set(key, withKey);
    return withKey;
  }

  function texBlockProcessor(lang) {
    return function (source, el) {
      var box = el.createDiv({ cls: "mathsidian-tex is-pending" });
      box.dataset.latex = source;
      if (!hasTex) {
        box.addClass("mathsidian-tex-error");
        box.setText("Blocos " + lang + " precisam do app desktop com TeX instalado.");
        return;
      }
      box.setText("compilando " + lang + "…");
      return compileBlock(lang, source).then(
        function (res) {
          box.empty();
          box.removeClass("is-pending");
          box.appendChild(svgElement(res.page, res.key));
        },
        function (err) {
          box.empty();
          box.removeClass("is-pending");
          box.addClass("mathsidian-tex-error");
          box.createEl("pre", { text: err.message });
        }
      );
    };
  }

  function install(renderer) {
    ["latex", "tikz"].forEach(function (lang) {
      var fn = texBlockProcessor(lang);
      renderer.registerPostProcessor(renderer.createCodeBlockPostProcessor(lang, fn), 0);
      renderer.registerCodeBlockPostProcessor(lang, fn);
    });
  }

  // ---------- preamble.tex ----------

  function vaultBasePath() {
    var adapter = window.app && window.app.vault && window.app.vault.adapter;
    return adapter && adapter.basePath ? adapter.basePath : null;
  }

  // Só as definições entram no KaTeX; \usepackage e afins ficam para o TeX.
  function katexDefinitions(src) {
    return src
      .split(/\r?\n/)
      .map(function (line) {
        return line.replace(/(^|[^\\])%.*$/, "$1");
      })
      .filter(function (line) {
        return /\\(newcommand|renewcommand|providecommand|def|gdef|let|DeclareMathOperator)/.test(line);
      })
      .join("\n")
      .replace(/\\DeclareMathOperator\*\s*\{?\s*(\\[A-Za-z]+)\s*\}?\s*\{([^}]*)\}/g, "\\newcommand{$1}{\\operatorname*{$2}}")
      .replace(/\\DeclareMathOperator\s*\{?\s*(\\[A-Za-z]+)\s*\}?\s*\{([^}]*)\}/g, "\\newcommand{$1}{\\operatorname{$2}}")
      .replace(/\\(renewcommand|providecommand)/g, "\\newcommand");
  }

  function loadPreamble() {
    var base = vaultBasePath();
    var src = "";
    if (base && fs) {
      try {
        src = fs.readFileSync(path.join(base, PREAMBLE_FILE), "utf8");
      } catch (e) {}
    }
    preambleSource = src;
    preambleLoaded = true;
    for (var k in macros) delete macros[k];
    var defs = katexDefinitions(src);
    if (defs) {
      try {
        window.katex.renderToString(defs, katexOptions(false));
      } catch (e) {
        console.warn("[mathsidian] erro no " + PREAMBLE_FILE + ":", e.message);
      }
    }
  }

  function rerenderAll() {
    var app = window.app;
    if (!app || !app.workspace) return;
    app.workspace.iterateAllLeaves(function (leaf) {
      var view = leaf.view;
      if (view && view.previewMode && view.previewMode.rerender) view.previewMode.rerender(true);
      if (view && view.editor && view.editor.cm && view.editor.cm.dispatch) view.editor.cm.dispatch({});
    });
  }

  function watchPreamble() {
    var app = window.app;
    if (!app || !app.vault || !app.workspace) return setTimeout(watchPreamble, 500);
    app.workspace.onLayoutReady(function () {
      loadPreamble();
      prewarmVault();
      var editTimers = {};
      var onChange = function (file) {
        if (!file) return;
        if (file.path === PREAMBLE_FILE) {
          loadPreamble();
          rerenderAll();
          prewarmVault();
        } else if (file.extension === "md") {
          // nota editada/criada: compila as fórmulas dela no fundo, sem esperar abrir
          clearTimeout(editTimers[file.path]);
          editTimers[file.path] = setTimeout(function () {
            delete editTimers[file.path];
            prewarmFiles([file]);
          }, 1200);
        }
      };
      app.vault.on("modify", onChange);
      app.vault.on("create", onChange);
      app.vault.on("delete", function (file) {
        if (file && file.path === PREAMBLE_FILE) onChange(file);
      });
    });
  }

  // ---------- Alt+clique copia o LaTeX ----------

  function toast(text) {
    var el = document.body.createDiv({ cls: "mathsidian-toast", text: text });
    setTimeout(function () {
      el.detach();
    }, 1400);
  }

  document.addEventListener(
    "click",
    function (evt) {
      if (!evt.altKey || !(evt.target instanceof Element)) return;
      var target = evt.target.closest("[data-latex]");
      if (!target) return;
      evt.preventDefault();
      evt.stopPropagation();
      navigator.clipboard.writeText(target.dataset.latex).then(function () {
        toast("LaTeX copiado");
      });
    },
    true
  );

  window.MathsidianMath = {
    render: render,
    install: install,
    reloadPreamble: function () {
      loadPreamble();
      rerenderAll();
    },
  };

  if (hasTex) watchPreamble();
})();
