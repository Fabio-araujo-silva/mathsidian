# Mathsidian: código extraído e legível (estudo pessoal)

## Pastas
- `fonte-original/`: conteúdo bruto extraído (intocado)
- `fonte-nucleo/`: núcleo do app formatado com Prettier, com nomes/títulos trocados para "Mathsidian"
- `fonte-carregador/`: carregador Electron (nome `mathsidian`, atualização automática desligada, carrega `nucleo.asar`)
- `mathsidian-app/`: app rodável (`mathsidian.exe`)
- `rea-evidencias.json`: evidências do REA

## Rodar
    D:\Users\fabio\Desktop\mathsidian\mathsidian-app\mathsidian.exe

Dados/configuração ficam em `%APPDATA%\Mathsidian` (separado do app original; não mexe nos seus cofres).

## Editar e reempacotar
    npx -y @electron/asar@3.2.17 pack fonte-nucleo mathsidian-app\resources\nucleo.asar
    npx -y @electron/asar@3.2.17 pack fonte-carregador mathsidian-app\resources\app.asar --unpack "*.node"

## Limites
- Nomes locais minificados (`e`, `t`, `n`...) não são recuperáveis.
- Código proprietário: só estudo pessoal, não redistribua.

## Matemática (lib/mathsidian-math)
O MathJax foi removido. Toda fórmula `$...$` / `$$...$$` é compilada pelo **TeX instalado** (MiKTeX: `latex` + `dvisvgm`) e vira SVG que segue a cor do tema.
- Fórmulas são compiladas em lote; o resultado fica em cache em `%APPDATA%\Mathsidian\latex-cache` (abre instantâneo da 2ª vez).
- Enquanto o TeX compila, o KaTeX mostra uma prévia (meio transparente).
- Fórmula com erro fica vermelha; passe o mouse para ver a mensagem do TeX.
- Pacotes já carregados: amsmath, amssymb, amsthm, mathtools, bm, cancel, xcolor, mhchem, tikz-cd.
- `preamble.tex` na raiz do cofre entra em todo documento (`\usepackage`, `\newcommand`, `\DeclareMathOperator`...). Salvou, re-renderiza.
- Blocos ` ```tikz ` (corpo de um tikzpicture, com pgfplots) e ` ```latex ` (qualquer trecho LaTeX, ou documento inteiro com `\documentclass`).
- Callouts de teoria: `> [!theorem]`, `[!definition]`, `[!lemma]`, `[!corollary]`, `[!proposition]`, `[!example]`, `[!remark]`, `[!proof]` (termina com ∎). Também em português: teorema, definicao, lema, corolario, proposicao, exemplo, observacao, prova/demonstracao.
- Alt+clique numa fórmula copia o LaTeX.
- Quick Look (preview no Explorer) não tem TeX: lá a saída é só KaTeX.
- `loadMathJax()` continua existindo na API de plugins só por compatibilidade (não carrega nada).

## Importar LaTeX (lib/mathsidian-math/import.js)
- Colar numa nota um documento com `\begin{document}` converte sozinho para Markdown: teoremas/provas viram callouts, `\[..\]`/align/tikzcd viram `$$`, `\section` vira `##`, `\textbf`/`\emph` viram negrito/itálico.
- `\newcommand`, `\DeclareMathOperator` e `\usetikzlibrary` do preâmbulo vão para o `preamble.tex` do cofre (só o que ainda não está lá).
- Para converter um trecho sem `\begin{document}`: copie e rode o comando "Colar LaTeX como Markdown" (Ctrl+P).
- Exemplo para testar: `exemplo-diagramas.tex`.
