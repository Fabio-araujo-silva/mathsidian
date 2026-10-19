# Tarefa: converter um documento LaTeX em notas atômicas para o Mathsidian

Vou te passar um documento LaTeX (colado no fim desta mensagem ou anexado). Converta **todo** o conteúdo em um conjunto de **notas atômicas** em Markdown, prontas para importar no **Mathsidian**.

O Mathsidian é um app de notas baseado no Obsidian: o cofre é uma pasta de arquivos `.md`, os links são `[[wikilinks]]` e toda fórmula `$...$` / `$$...$$` é compilada por um LaTeX de verdade (não MathJax). Siga as regras abaixo à risca, porque o que fugir delas não renderiza.

## 1. O que é uma nota atômica

- Uma nota = uma ideia autocontida: uma definição, um teorema, proposição ou lema (junto com a demonstração), um exemplo, uma observação relevante, um método ou algoritmo, um conceito.
- O enunciado e a demonstração ficam na **mesma** nota.
- Um corolário vira nota própria se tiver demonstração ou for citado em outro lugar. Se for um comentário de uma linha, fica na nota do teorema.
- Cada nota tem que se entender sozinha. Se ela usa um conceito definido em outra nota, faça um link `[[...]]` em vez de redefinir.
- **Não invente, não resuma e não pule nada.** As demonstrações vão completas, com todos os passos do original. Texto de motivação ou introdução também não se perde: vai para a nota índice ou para a nota do conceito correspondente.
- Se achar um erro ou um trecho ambíguo no original, mantenha o texto do autor e acrescente um callout `> [!observacao] Nota do conversor` explicando.

## 2. Arquivos e nomes

- Todas as notas ficam numa pasta `<Assunto>/` (nome curto do documento ou capítulo).
- Crie uma nota índice `<Assunto>/00 Índice – <Assunto>.md`.
- Se houver macros, crie `preamble.tex` na **raiz** do cofre, fora da pasta (veja a seção 7).
- O nome do arquivo é o título da nota: descritivo, único e no idioma do documento. Exemplo: `Teorema do valor médio.md`, nunca `Teorema 3.2.md`.
- Caracteres **proibidos** em nomes: `* " \ / < > : | ? # ^ [ ]`. Troque `:` por ` – ` ou por vírgula.

## 3. Formato de cada nota

Toda nota começa com propriedades YAML:

~~~
---
tags: [<assunto-sem-espacos>, teorema]
aliases: [Teorema 3.2, Mean value theorem]
fonte: "<título do documento>, seção 3.2"
---
~~~

- **tags**: o assunto mais o tipo da nota, em minúsculas, sem espaços nem acentos (use hífen). Os tipos são: `definicao`, `teorema`, `proposicao`, `lema`, `corolario`, `exemplo`, `observacao`, `metodo`, `conceito`.
- **aliases**: a numeração original ("Teorema 3.2", "Definição 1.4") e o nome em inglês, se houver um consagrado.
- **Não** repita o título como `# Título`, porque o app já mostra o nome do arquivo. Use `##` só para subdivisões dentro da nota, se precisar.
- No fim da nota, se ela depender de outras, acrescente a linha `**Pré-requisitos:** [[Nota A]], [[Nota B]]`.

## 4. Ambientes de teorema → callouts

Use exatamente esta sintaxe. **Toda** linha do callout começa com `> `, inclusive as linhas de fórmula, e as linhas vazias dentro dele são só `>`:

~~~
> [!teorema] Teorema (Primeiro teorema do isomorfismo)
> Seja $\varphi\colon G\to H$ um homomorfismo de grupos. Então
> $$
> G/\ker\varphi \cong \operatorname{im}\varphi.
> $$
>
> Em particular, $|G| = |\ker\varphi|\,|\operatorname{im}\varphi|$ quando $G$ é finito.

> [!prova] Demonstração
> Defina $\bar\varphi(g\ker\varphi) = \varphi(g)$. ...
~~~

- Tipos aceitos: `definicao`, `teorema`, `proposicao`, `lema`, `corolario`, `exemplo`, `observacao`, `prova`.
- Equivalências:

  | No LaTeX | Tipo do callout |
  |---|---|
  | `theorem`/`thm` | `teorema` |
  | `lemma` | `lema` |
  | `corollary` | `corolario` |
  | `proposition`, `claim`, afirmação, conjectura | `proposicao` |
  | `definition`, axioma, notação | `definicao` |
  | `example` | `exemplo` |
  | exercício, problema | `exemplo`, com o título "Exercício" |
  | `remark`, `note`, aviso | `observacao` |
  | `proof` | `prova` |

- O título do callout é "Tipo (nome dado pelo autor)", ou só "Tipo" se o autor não deu nome.
- A demonstração é um callout `[!prova]` **separado**, logo depois do enunciado, com uma linha em branco entre os dois. **Não** escreva ∎, `\qed`, `\blacksquare` nem "c.q.d.", porque o app já põe o ∎.
- Uma afirmação dentro de uma prova vira callout aninhado: `> > [!observacao] Afirmação`.

## 5. Matemática

- **Inline**: `$...$`. Não deixe espaço logo depois do `$` que abre nem logo antes do `$` que fecha, e não ponha um dígito colado depois do `$` que fecha. Nunca use `\(...\)`.
- **Destacada**: `$$` sozinho numa linha, a fórmula, e `$$` sozinho numa linha. Nunca use `\[...\]`. **Nunca** deixe linha em branco dentro de `$$...$$`.
- Dentro de `$$` valem `align*`, `gather*`, `multline*`, `aligned`, `split`, `cases`, `pmatrix`, `bmatrix`, `array` e `tikzcd`. Nunca ponha `$` dentro de `$$`.
- Cada fórmula é compilada sozinha, então a numeração automática sairia sempre "(1)". Prefira as versões com estrela. Se o original numera uma equação citada em outro lugar, use `\tag{3.1}` com o número original.
- Apague todo `\label`. Troque `\ref`, `\eqref` e `\cref` por um link para a nota (`pela [[Desigualdade de Cauchy–Schwarz]]`) ou, para uma equação da mesma nota, pelo número do `\tag`: "por (3.1)".
- Pacotes já carregados em toda fórmula: `amsmath`, `amssymb`, `amsthm`, `mathtools`, `bm`, `cancel`, `xcolor`, `mhchem` (`\ce{...}`) e `tikz-cd`.
- Se precisar de outro pacote, reescreva com os pacotes acima ou declare-o no `preamble.tex`. Neste caso, só um pacote comum do TeX Live/MiKTeX.
- Diagramas comutativos: `$$` + `\begin{tikzcd} ... \end{tikzcd}` + `$$`.
- Acentos em `\text{...}` vão direto em UTF-8: `\text{então}`.

## 6. Figuras, tabelas e o resto

- **TikZ/pgfplots** vai num bloco de código com a linguagem `tikz`, contendo o `\begin{tikzpicture}...\end{tikzpicture}` inteiro. `pgfplots` e as bibliotecas `arrows.meta`, `calc`, `positioning`, `decorations.pathreplacing`, `patterns` e `shapes` já estão carregados. Qualquer outra biblioteca vai como `\usetikzlibrary{...}` no `preamble.tex`.
- Cores: use preto ou nenhuma cor para o traço principal, porque o preto acompanha o tema claro/escuro do app. Outras cores podem ser usadas à vontade.
- Tire o `\begin{figure}`. A `\caption` vira uma linha em itálico logo abaixo do bloco.
- LaTeX sem equivalente em Markdown (tabela complexa, `algorithm`, ambiente exótico) vai num bloco de código com a linguagem `latex`. Ele é compilado como um trecho, ou como documento inteiro se começar com `\documentclass`.
- Tabelas simples viram tabelas Markdown.
- `\includegraphics` não dá para importar. Escreva `> [!observacao] Figura omitida` com a descrição e a legenda da figura.
- Dentro de um callout, as linhas de blocos de código também começam com `> `.

## 7. Macros do autor → `preamble.tex`

O app injeta o `preamble.tex` da raiz do cofre em toda fórmula, tanto na compilação TeX quanto na prévia.

- Mantenha as macros do autor nas notas (`\R`, `\norm{x}`, ...) e coloque as definições no `preamble.tex`, uma por linha: `\newcommand`, `\DeclareMathOperator` e `\usetikzlibrary`.
- Só use `\usepackage` para um pacote matemático estritamente necessário.
- **Proibido** no `preamble.tex`: `\documentclass`, `\begin{document}`, `babel`, `inputenc`, `fontenc`, `geometry`, `hyperref`, `fancyhdr`, `\newtheorem` e qualquer comando de layout.
- Não redefina com `\newcommand` um comando que já existe no LaTeX/amsmath (`\Re`, `\Im`, `\det`, `\div`...), porque isso quebra **todas** as fórmulas. Use `\renewcommand` só se o próprio autor fez isso.
- Se eu colar também o meu `preamble.tex` atual, entregue **apenas as linhas novas**, que eu vou acrescentar ao final do meu arquivo. Um nome definido duas vezes quebra tudo.
- Se o documento não define macros, não crie `preamble.tex`.

## 8. Links e índice

- Na primeira menção a um conceito que tem nota própria, faça um link: `[[Nome exato do arquivo]]` ou `[[Nome exato do arquivo|texto exibido]]`.
- O nome no link tem que bater **exatamente** com o nome do arquivo, sem `.md`. Nunca crie um link para uma nota que você não entregou.
- Conteúdo da nota índice:
  - o texto introdutório do original;
  - as seções do documento como `##`, na ordem original;
  - sob cada seção, uma lista com cada nota no formato `- [[Nota]] — uma linha dizendo o que é`.

## 9. Texto

| No LaTeX | No Markdown |
|---|---|
| `\textbf{}` | `**...**` |
| `\emph{}`, `\textit{}` | `*...*` |
| `itemize` | `- ` |
| `enumerate` | `1. ` |
| ` ``...'' ` | “...” |
| `--` | – |
| `---` | — |
| `~` | espaço |
| `\\` | quebra de linha |
| `\footnote{}` | nota de rodapé Markdown `[^1]` |
| `\cite{x}` | "(Autor, ano)" se der para saber, senão `[x]` |

- Acentos LaTeX viram UTF-8 direto: `\'e` → é, `\c{c}` → ç, `\~a` → ã.
- **Nunca** comece uma linha de texto com 4 espaços, porque em Markdown isso vira bloco de código.
- Mantenha o idioma do original.

## 10. Entrega

**Se você consegue criar arquivos** (tem execução de código ou download), gere um `.zip` com esta estrutura, em UTF-8 sem BOM e quebras de linha LF:

~~~
preamble.tex                         (só se houver macros)
<Assunto>/00 Índice – <Assunto>.md
<Assunto>/<Nota>.md
...
~~~

**Se não consegue**, entregue tudo num único bloco delimitado por `~~~~~~` (seis tis), para os blocos de código internos não quebrarem. Cada arquivo vai assim, com o `preamble.tex` primeiro (se houver) e o índice em seguida:

~~~
=== ARQUIVO: <Assunto>/<Nome da nota>.md ===
<conteúdo do arquivo>
=== FIM ===
~~~

**Se não couber numa resposta**, pare ao fim de um arquivo completo (nunca no meio), escreva `=== CONTINUA ===` e espere eu dizer "continue". Aí siga do próximo arquivo, no mesmo formato, sem repetir nada.

No final de tudo, fora do bloco, escreva **só** um resumo curto: quantas notas saíram e quais trechos ficaram com observação do conversor. Não explique as regras de volta.

## 11. Antes de entregar, confira

- [ ] Nada do original ficou de fora. Compare seção por seção.
- [ ] Não sobrou `\[`, `\(`, `\label`, `\ref`, `\cite`, `\section`, `\begin{theorem}` nem `\begin{proof}`.
- [ ] Todo `$$` está sozinho na linha, e não há linha em branco dentro de nenhum `$$...$$`.
- [ ] Nenhum `$ x$` ou `$x $` com espaço na borda.
- [ ] Toda linha de todo callout começa com `>`.
- [ ] Todo `[[link]]` aponta para um arquivo entregue, com o nome idêntico.
- [ ] Nenhum nome de arquivo tem caractere proibido, e não há dois arquivos com o mesmo nome.
- [ ] Toda macro usada nas notas é padrão (pacotes da seção 5) ou está no `preamble.tex`.

---

=== MEU LATEX ===

(cole aqui o documento .tex, ou anexe o arquivo)
