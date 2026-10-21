// Mathsidian: motor de matemática.
// - Toda fórmula ($...$ e $$...$$) é compilada pelo TeX instalado (latex -> dvisvgm -> SVG),
//   em lotes e com cache em disco; o que já está no cache aparece na hora.
// - Enquanto o TeX compila, o KaTeX mostra uma prévia instantânea. Sem TeX/Node (Quick Look),
//   o KaTeX é a saída final.
// - Blocos ```latex / ```tikz são documentos TeX inteiros, compilados do mesmo jeito.
// - Preâmbulo em cascata: preamble.tex da raiz (todas as notas), preamble.tex de cada pasta (notas
//   da pasta e subpastas) e a propriedade "preamble" da nota. As definições valem também pro KaTeX.
// - Alt+clique numa fórmula copia o LaTeX dela.
(function () {
  "use strict";

  var nodeRequire = typeof window.require === "function" ? window.require : null;
  var fs = nodeRequire && nodeRequire("fs");
  var path = nodeRequire && nodeRequire("path");
  var crypto = nodeRequire && nodeRequire("crypto");
  var childProcess = nodeRequire && nodeRequire("child_process");
  var hasTex = !!childProcess;

  var PREAMBLE_NAME = "preamble.tex"; // na raiz vale pro cofre todo; numa pasta, pra pasta e subpastas
  var PREAMBLE_PROP = "preamble"; // propriedade da nota: arquivos .tex extras ou LaTeX direto
  var EM_PER_PT = 1.15 / 10; // 10pt do TeX = 1.15em do texto
  var BATCH_DELAY = 100;

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
  // O cabeçalho das fórmulas (pacotes + preâmbulo) vira um .fmt: cada lote pula o carregamento
  // dos pacotes (tikz-cd sozinho custa ~1 s). Cada preâmbulo diferente tem o seu .fmt.
  // Se o cabeçalho não compilar, cai no documento inteiro.
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

  function katexOptions(display, macros) {
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

  function katexInto(el, source, display, pre) {
    try {
      // copia: uma fórmula com \def não pode vazar pro preâmbulo das outras
      window.katex.render(source, el, katexOptions(display, Object.assign({}, macrosFor(pre))));
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

  function mathHeader(pre) {
    return ["\\documentclass{article}", MATH_PACKAGES, pre, "\\usepackage[active,tightpage]{preview}"].join("\n");
  }

  function mathBody(snippets) {
    return "\\begin{document}\n" + snippets.join("\n\n") + "\n\\end{document}\n";
  }

  var mathCache = new Map(); // key -> page | {error}
  var pending = new Map(); // key -> {source, display, pre}
  var batchTimer = 0;

  var MATH_LAYOUT = "v2"; // muda quando o snippet() muda, pra não reaproveitar SVG antigo

  function mathKey(source, display, pre) {
    return sha1(MATH_LAYOUT + "\0" + pre + "\0" + (display ? "D" : "I") + "\0" + source);
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

  // Compila no worker `slot` um lote de fórmulas com o mesmo preâmbulo (fmt: o .fmt dele, ou null).
  // Uma fórmula ruim derruba o lote inteiro: aí divide e recompila no mesmo worker pra isolar a culpada.
  function compileBatch(items, slot, fmt) {
    var body = mathBody(
      items.map(function (it) {
        return snippet(it.source, it.display);
      })
    );
    return compileDocument(fmt ? body : mathHeader(items[0].pre) + "\n" + body, slot, fmt)
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
          return compileBatch(items.slice(0, mid), slot, fmt).then(function () {
            return compileBatch(items.slice(mid), slot, fmt);
          });
        }
      );
  }

  // Agrupa por preâmbulo, divide em lotes e manda pros workers. Lotes menores na frente = paralelismo;
  // no fundo, lotes maiores. O .fmt é gerado antes de pegar o worker: gerá-lo também ocupa um worker,
  // e lotes esperando por ele com o worker na mão podiam travar todos.
  function schedule(items, low) {
    var groups = new Map();
    items.forEach(function (it) {
      if (!groups.has(it.pre)) groups.set(it.pre, []);
      groups.get(it.pre).push(it);
    });
    groups.forEach(function (group, pre) {
      scheduleGroup(group, low, ensureFormat(mathHeader(pre)));
    });
  }

  function scheduleGroup(items, low, fmtJob) {
    var size = low ? 60 : Math.max(8, Math.ceil(items.length / WORKERS));
    for (var i = 0; i < items.length; i += size) {
      (function (chunk) {
        fmtJob.then(function (fmt) {
          return withSlot(low, function (slot) {
            // no fundo, pula o que já ficou pronto enquanto esperava
            chunk = chunk.filter(function (it) {
              return !compiling.has(it.key) && !mathCache.has(it.key);
            });
            if (!chunk.length) return;
            chunk.forEach(function (it) {
              compiling.add(it.key);
            });
            var done = function () {
              chunk.forEach(function (it) {
                compiling.delete(it.key);
              });
            };
            return compileBatch(chunk, slot, fmt).then(done, done);
          });
        });
      })(items.slice(i, i + size));
    }
  }

  function flush() {
    batchTimer = 0;
    if (!pending.size) return;
    var items = [];
    pending.forEach(function (it, key) {
      items.push({ key: key, source: it.source, display: it.display, pre: it.pre });
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
          var pre = preambleFor(f.path);
          extractMath(text).forEach(function (m) {
            var key = mathKey(m.source, m.display, pre);
            if (seen.has(key) || compiling.has(key) || readMathCache(key)) return;
            seen.add(key);
            items.push({ key: key, source: m.source, display: m.display, pre: pre });
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

  // sourcePath: caminho da nota no cofre (decide o preâmbulo); sem ele, só o preamble.tex da raiz.
  function render(source, display, sourcePath) {
    source = source.trim();
    var el = document.createElement(display ? "div" : "span");
    el.className = "mathsidian-math";
    el.dataset.latex = source;
    el.dataset.display = display ? "1" : "";
    if (sourcePath) el.dataset.sourcePath = sourcePath;
    if (!source) return el;
    var pre = preambleFor(sourcePath);
    if (!hasTex) {
      if (!katexInto(el, source, display, pre)) el.addClass("mathsidian-math-error");
      return el;
    }
    var key = mathKey(source, display, pre);
    el.dataset.mathKey = key;
    var cached = readMathCache(key);
    if (cached) {
      applyResult(el, key, cached);
      return el;
    }
    el.addClass("is-pending");
    katexInto(el, source, display, pre);
    if (!pending.has(key) && !compiling.has(key)) pending.set(key, { source: source, display: display, pre: pre });
    if (!batchTimer) batchTimer = setTimeout(flush, BATCH_DELAY);
    return el;
  }

  // ---------- blocos ```latex / ```tikz ----------

  function blockDocument(lang, body, pre) {
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
      pre,
      "\\usepackage[active,tightpage]{preview}",
      "\\begin{document}",
      "\\begin{preview}" + (isTikz ? body : "\\begin{varwidth}{\\linewidth}" + body + "\\end{varwidth}") + "\\end{preview}",
      "\\end{document}",
      "",
    ].join("\n");
  }

  var blockCache = new Map();

  function compileBlock(doc) {
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

  // Compila o documento do bloco dentro de box. Se o box for recompilado (preâmbulo mudou)
  // antes de terminar, o resultado antigo é descartado.
  function fillBlock(box, lang, doc) {
    var key = sha1(doc);
    box.dataset.blockKey = key;
    box.empty();
    box.removeClass("mathsidian-tex-error");
    box.addClass("is-pending");
    box.setText("compilando " + lang + "…");
    return compileBlock(doc).then(
      function (res) {
        if (box.dataset.blockKey !== key) return;
        box.empty();
        box.removeClass("is-pending");
        box.appendChild(svgElement(res.page, res.key));
      },
      function (err) {
        if (box.dataset.blockKey !== key) return;
        box.empty();
        box.removeClass("is-pending");
        box.addClass("mathsidian-tex-error");
        box.createEl("pre", { text: err.message });
      }
    );
  }

  function texBlockProcessor(lang) {
    return function (source, el, ctx) {
      var box = el.createDiv({ cls: "mathsidian-tex is-pending" });
      box.dataset.latex = source;
      box.dataset.lang = lang;
      var sourcePath = ctx && ctx.sourcePath;
      if (sourcePath) box.dataset.sourcePath = sourcePath;
      if (!hasTex) {
        box.addClass("mathsidian-tex-error");
        box.setText("Blocos " + lang + " precisam do app desktop com TeX instalado.");
        return;
      }
      return fillBlock(box, lang, blockDocument(lang, source, preambleFor(sourcePath)));
    };
  }

  function install(renderer) {
    ["latex", "tikz"].forEach(function (lang) {
      var fn = texBlockProcessor(lang);
      renderer.registerPostProcessor(renderer.createCodeBlockPostProcessor(lang, fn), 0);
      renderer.registerCodeBlockPostProcessor(lang, fn);
    });
  }

  // ---------- preâmbulos ----------
  // O preâmbulo de uma nota junta, nesta ordem:
  //   1. o preamble.tex da raiz do cofre (vale pra todas as notas);
  //   2. o preamble.tex de cada pasta no caminho até a nota (vale pra pasta e subpastas);
  //   3. a propriedade "preamble" da nota: arquivos .tex (caminho ou nome, com ou sem [[ ]])
  //      e, por último, o LaTeX direto (qualquer valor com "\").
  // Uma nota sem pasta nem propriedade fica só com o da raiz, como antes (o cache continua valendo).

  var texFiles = new Map(); // caminho no cofre -> conteúdo ("" se não existe)
  var usedFiles = new Set(); // arquivos .tex citados na propriedade de alguma nota
  var notePreamble = new Map(); // nota -> preâmbulo do último uso (pra saber se mudou)
  var missing = new Set(); // "nota\0valor" de arquivos citados que não existem (avisa uma vez)
  var macroSets = new Map(); // preâmbulo -> macros do KaTeX

  function vaultBasePath() {
    var adapter = window.app && window.app.vault && window.app.vault.adapter;
    return adapter && adapter.basePath ? adapter.basePath : null;
  }

  function readVaultFile(p) {
    if (texFiles.has(p)) return texFiles.get(p);
    var base = vaultBasePath();
    if (!base || !fs) return ""; // cofre ainda não abriu: não guarda, tenta de novo depois
    var src = "";
    try {
      src = fs.readFileSync(path.join(base, p), "utf8");
    } catch (e) {}
    texFiles.set(p, src);
    return src;
  }

  // ["preamble.tex", "A/preamble.tex", "A/B/preamble.tex"] pra nota "A/B/nota.md"
  function folderPreambles(sourcePath) {
    var dirs = (sourcePath || "").split("/").slice(0, -1);
    var files = [PREAMBLE_NAME];
    for (var i = 1; i <= dirs.length; i++) files.push(dirs.slice(0, i).join("/") + "/" + PREAMBLE_NAME);
    return files;
  }

  // preamble: [[x.tex]] sem aspas vira lista dentro de lista no YAML: achata tudo.
  function flatten(v) {
    if (Array.isArray(v))
      return v.reduce(function (acc, x) {
        return acc.concat(flatten(x));
      }, []);
    return v == null || v === "" || v === false ? [] : [String(v)];
  }

  function propertyEntries(sourcePath) {
    var mc = window.app && window.app.metadataCache;
    var cache = sourcePath && mc && mc.getCache(sourcePath);
    var fm = cache && cache.frontmatter;
    return fm ? flatten(fm[PREAMBLE_PROP]) : [];
  }

  // "[[Pasta/algebra|apelido]]", "Pasta/algebra.tex", "algebra" -> caminho do .tex no cofre
  function resolvePreambleFile(entry, sourcePath) {
    var link = entry.trim().replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0].trim();
    if (!link) return null;
    var app = window.app;
    var names = /\.tex$/i.test(link) ? [link] : [link + ".tex", link];
    for (var i = 0; i < names.length; i++) {
      var file = app.vault.getAbstractFileByPath(names[i]) || app.metadataCache.getFirstLinkpathDest(names[i], sourcePath);
      if (file && file.extension) return file.path;
    }
    return null;
  }

  var INLINE = "\0inline"; // chave do LaTeX direto da nota em `overrides`

  // overrides (opcional, pro editor): Map caminho -> texto ainda não salvo; INLINE -> LaTeX da nota.
  // Com overrides, só monta o texto: não avisa nem guarda nada.
  function preambleFor(sourcePath, overrides) {
    var parts = [];
    var inline = [];
    var seen = new Set();
    var addFile = function (p) {
      if (seen.has(p)) return;
      seen.add(p);
      var src = overrides && overrides.has(p) ? overrides.get(p) : readVaultFile(p);
      if (src) parts.push(src);
    };
    folderPreambles(sourcePath).forEach(addFile);
    if (sourcePath && window.app && window.app.metadataCache) {
      propertyEntries(sourcePath).forEach(function (entry) {
        if (entry.indexOf("\\") >= 0) return inline.push(entry);
        var p = resolvePreambleFile(entry, sourcePath);
        if (p) {
          if (!overrides) usedFiles.add(p);
          return addFile(p);
        }
        if (overrides) return;
        var id = sourcePath + "\0" + entry;
        if (missing.has(id)) return;
        missing.add(id);
        console.warn("[mathsidian] preâmbulo não encontrado:", entry, "(nota " + sourcePath + ")");
        toast('Preâmbulo "' + entry + '" não encontrado (nota ' + sourcePath + ")", 4000);
      });
    }
    if (overrides && overrides.has(INLINE)) inline = [overrides.get(INLINE)];
    inline.forEach(function (src) {
      if (src) parts.push(src);
    });
    var pre = parts.join("\n");
    if (sourcePath && !overrides) notePreamble.set(sourcePath, pre);
    return pre;
  }

  // Pro editor: as camadas do preâmbulo de uma nota, na ordem em que entram.
  // kind: "vault" | "folder" | "link" (arquivo citado na propriedade) | "inline" (LaTeX na propriedade)
  function preambleLayers(sourcePath) {
    var vault = window.app && window.app.vault;
    var exists = function (p) {
      return !!(p && vault && vault.getAbstractFileByPath(p));
    };
    var layers = folderPreambles(sourcePath).map(function (p, i) {
      return { kind: i ? "folder" : "vault", path: p, exists: exists(p) };
    });
    if (!sourcePath || !window.app || !window.app.metadataCache) return layers;
    var inline = [];
    var seen = new Set();
    propertyEntries(sourcePath).forEach(function (entry) {
      if (entry.indexOf("\\") >= 0) return inline.push(entry);
      var p = resolvePreambleFile(entry, sourcePath);
      if (!p) {
        // ainda não existe: ao salvar, cria no caminho escrito (relativo à raiz do cofre)
        p = entry.trim().replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0].trim();
        if (!/\.tex$/i.test(p)) p += ".tex";
      }
      if (seen.has(p)) return;
      seen.add(p);
      layers.push({ kind: "link", path: p, entry: entry, exists: exists(p) });
    });
    layers.push({ kind: "inline", path: sourcePath, text: inline.join("\n"), exists: inline.length > 0 });
    return layers;
  }

  // Compila o preâmbulo com uma fórmula de teste. Devolve null se compilou, ou a mensagem do TeX.
  function checkPreamble(pre) {
    if (!hasTex) return Promise.resolve(null);
    var doc = mathHeader(pre) + "\n" + mathBody([snippet("x", false)]);
    return withSlot(false, function (slot) {
      return compileDocument(doc, slot);
    }).then(
      function () {
        return null;
      },
      function (err) {
        return err.message;
      }
    );
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

  // Macros do KaTeX pra um preâmbulo. Uma definição por vez: uma linha com erro não derruba as
  // outras, e a última definição de um nome vale (a pasta pode redefinir o que veio da raiz).
  function macrosFor(pre) {
    if (macroSets.has(pre)) return macroSets.get(pre);
    var macros = {};
    if (!window.katex) return macros;
    macroSets.set(pre, macros);
    katexDefinitions(pre)
      .split("\n")
      .forEach(function (def) {
        if (!def.trim()) return;
        var name = def.match(/\\(?:newcommand|def|gdef|let)\*?\s*\{?\s*(\\[A-Za-z@]+)/);
        if (name) delete macros[name[1]];
        try {
          window.katex.renderToString(def, katexOptions(false, macros));
        } catch (e) {
          console.warn("[mathsidian] definição do preâmbulo ignorada na prévia:", def, e.message);
        }
      });
    return macros;
  }

  // Refaz no lugar as fórmulas e blocos já na tela cujo preâmbulo mudou (leitura e edição ao vivo).
  // onlyPath: só os da nota com esse caminho.
  function refreshRendered(onlyPath) {
    var els = document.querySelectorAll(".mathsidian-math[data-math-key]");
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var p = el.dataset.sourcePath || "";
      if (onlyPath != null && p !== onlyPath) continue;
      var display = el.dataset.display === "1";
      if (el.dataset.mathKey === mathKey(el.dataset.latex, display, preambleFor(p))) continue;
      el.replaceWith(render(el.dataset.latex, display, p));
    }
    var boxes = document.querySelectorAll(".mathsidian-tex[data-block-key]");
    for (var j = 0; j < boxes.length; j++) {
      var box = boxes[j];
      var bp = box.dataset.sourcePath || "";
      if (onlyPath != null && bp !== onlyPath) continue;
      var doc = blockDocument(box.dataset.lang, box.dataset.latex, preambleFor(bp));
      if (sha1(doc) !== box.dataset.blockKey) fillBlock(box, box.dataset.lang, doc);
    }
  }

  function refresh(onlyPath) {
    refreshRendered(onlyPath);
    var app = window.app;
    if (!app || !app.workspace) return;
    // o modo leitura guarda fora da tela seções já renderizadas: refaz a vista toda
    app.workspace.iterateAllLeaves(function (leaf) {
      var view = leaf.view;
      if (onlyPath != null && !(view && view.file && view.file.path === onlyPath)) return;
      if (view && view.previewMode && view.previewMode.rerender) view.previewMode.rerender(true);
    });
  }

  function reloadPreambles() {
    texFiles.clear();
    macroSets.clear();
    missing.clear();
    refresh();
    prewarmVault();
  }

  function isPreambleFile(p) {
    return !!p && (p === PREAMBLE_NAME || p.endsWith("/" + PREAMBLE_NAME) || usedFiles.has(p));
  }

  function watchPreamble() {
    var app = window.app;
    if (!app || !app.vault || !app.workspace || !app.metadataCache) return setTimeout(watchPreamble, 500);
    app.workspace.onLayoutReady(function () {
      prewarmVault();
      var editTimers = {};
      var prewarmNote = function (file) {
        // nota editada/criada: compila as fórmulas dela no fundo, sem esperar abrir
        clearTimeout(editTimers[file.path]);
        editTimers[file.path] = setTimeout(function () {
          delete editTimers[file.path];
          prewarmFiles([file]);
        }, 1200);
      };
      app.vault.on("modify", function (file) {
        if (!file) return;
        if (file.extension === "tex" && isPreambleFile(file.path)) reloadPreambles();
        else if (file.extension === "md") prewarmNote(file);
      });
      app.vault.on("create", function (file) {
        if (!file) return;
        // um .tex novo pode ser o que alguma nota citava e ainda não existia
        if (file.extension === "tex" && (isPreambleFile(file.path) || missing.size)) reloadPreambles();
        else if (file.extension === "md") prewarmNote(file);
      });
      app.vault.on("delete", function (file) {
        if (file && file.extension === "tex" && isPreambleFile(file.path)) reloadPreambles();
      });
      app.vault.on("rename", function (file, oldPath) {
        if (!file) return;
        if (file.extension === "tex") {
          if (isPreambleFile(oldPath) || isPreambleFile(file.path) || missing.size) reloadPreambles();
        } else if (file.extension === "md") {
          // nota mudou de pasta: pode mudar o preâmbulo
          var els = document.querySelectorAll("[data-source-path]");
          for (var i = 0; i < els.length; i++) if (els[i].dataset.sourcePath === oldPath) els[i].dataset.sourcePath = file.path;
          notePreamble.delete(oldPath);
          refresh(file.path);
          prewarmNote(file);
        }
      });
      // propriedade "preamble" mudou: refaz a nota (o preâmbulo só é relido quando o cache da nota muda)
      app.metadataCache.on("changed", function (file) {
        if (!file || file.extension !== "md" || !notePreamble.has(file.path)) return;
        var before = notePreamble.get(file.path);
        if (preambleFor(file.path) !== before) refresh(file.path);
      });
    });
  }

  // ---------- Alt+clique copia o LaTeX ----------

  function toast(text, ms) {
    var el = document.body.createDiv({ cls: "mathsidian-toast", text: text });
    setTimeout(function () {
      el.detach();
    }, ms || 1400);
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
    reloadPreamble: reloadPreambles,
    preambleFor: preambleFor,
    preambleLayers: preambleLayers,
    checkPreamble: checkPreamble,
    INLINE: INLINE,
    PREAMBLE_NAME: PREAMBLE_NAME,
    PREAMBLE_PROP: PREAMBLE_PROP,
    hasTex: hasTex,
  };

  if (hasTex) watchPreamble();
})();
