# Mathsidian

Um aplicativo de anotações para matemática, baseado no Obsidian. Você escreve suas notas normalmente e as fórmulas aparecem bonitas, do mesmo jeito que num PDF feito em LaTeX. Ele também desenha diagramas comutativos e gráficos (TikZ) e destaca teoremas, definições e demonstrações com cores.

> **Aviso:** este projeto é feito a partir do código do Obsidian, que é proprietário. É só para estudo pessoal: não redistribua.

## Instalar

### **[Baixar Mathsidian-Setup.exe](https://github.com/Fabio-araujo-silva/mathsidian/releases/latest/download/Mathsidian-Setup.exe)**

Abra o arquivo baixado e clique em **Avançar** até o fim. Pronto: o app, o LaTeX (MiKTeX) e os atalhos ficam instalados, sem precisar reiniciar.

> Se o Windows mostrar **"O Windows protegeu o computador"**, clique em **"Mais informações"** → **"Executar assim mesmo"** (o app não tem assinatura digital de empresa).

Precisa de Windows 10 ou 11, uns 2 GB livres e internet durante a instalação. Para atualizar, rode o Setup de novo; para desinstalar, use **Configurações → Aplicativos**.

O Mathsidian guarda as configurações numa pasta própria: se você usa o Obsidian normal, nada dele é alterado.

---

## Sumário

1. [Criar seu cofre (a pasta das notas)](#1-criar-seu-cofre-a-pasta-das-notas)
2. [Escrever notas e fórmulas](#2-escrever-notas-e-fórmulas)
3. [Teoremas, definições e demonstrações](#3-teoremas-definições-e-demonstrações)
4. [Diagramas e gráficos](#4-diagramas-e-gráficos)
5. [Seus próprios comandos (preamble.tex)](#5-seus-próprios-comandos-preambletex)
6. [Trazer um arquivo LaTeX (.tex) para o Mathsidian](#6-trazer-um-arquivo-latex-tex-para-o-mathsidian)
7. [Deu problema?](#7-deu-problema)
8. [Para desenvolvedores](#8-para-desenvolvedores)

---

## 1. Criar seu cofre (a pasta das notas)

No Mathsidian, um **cofre** é só uma pasta do seu computador onde ficam as notas. Cada nota é um arquivo de texto `.md`, então você nunca perde nada: dá para abrir as notas até no Bloco de Notas.

1. Na primeira tela, clique em **"Criar"**, ao lado de **"Criar novo cofre"**.
2. Dê um nome, por exemplo `Matemática`.
3. Em **"Localização"**, clique em **"Procurar"** e escolha onde a pasta vai ficar, por exemplo **Documentos**.
4. Clique em **"Criar"**.

Se você já tem um cofre do Obsidian, use **"Abrir pasta como cofre"** e escolha a pasta dele.

## 2. Escrever notas e fórmulas

- **Nova nota:** `Ctrl + N`. O título da nota é o nome do arquivo.
- **Alternar entre editar e ler:** `Ctrl + E`.
- **Buscar qualquer comando do app:** `Ctrl + P`.

### Texto

| Você escreve | Aparece |
|---|---|
| `**negrito**` | **negrito** |
| `*itálico*` | *itálico* |
| `## Título` | um título de seção |
| `- item` | uma lista com marcadores |
| `1. item` | uma lista numerada |
| `[[Outra nota]]` | um link para a nota "Outra nota" (se ela não existir, um clique cria) |

### Fórmulas

- **No meio do texto:** escreva entre cifrões. Por exemplo, `A área é $\pi r^2$.` aparece como "A área é πr²".
- **Em destaque, centralizada:** use dois cifrões, cada um sozinho na sua linha:

      $$
      \int_0^1 x^2\,dx = \frac{1}{3}
      $$

Regras que evitam dor de cabeça:

- **Não deixe espaço** colado nos cifrões: `$x$` funciona, `$ x $` não.
- **Não deixe linha em branco** dentro de um `$$ ... $$`.
- Dentro de `$$` vale tudo do LaTeX de matemática: `align*`, `cases`, `pmatrix`, `\begin{tikzcd}` etc.

Como as fórmulas aparecem:

- Na **primeira vez**, a fórmula aparece meio transparente por um instante. Isso é uma prévia enquanto o LaTeX trabalha. Depois ela fica nítida.
- Da segunda vez em diante, ela aparece na hora.
- Se o LaTeX ainda não tinha algum pacote, a primeira fórmula pode demorar alguns segundos enquanto ele baixa o pacote. Isso é normal.
- Uma **fórmula vermelha** tem erro. Passe o mouse em cima para ver a mensagem.
- **`Alt + clique`** numa fórmula copia o código LaTeX dela.

Pacotes que já vêm carregados: `amsmath`, `amssymb`, `amsthm`, `mathtools`, `bm`, `cancel`, `xcolor`, `mhchem` (química: `\ce{H2O}`) e `tikz-cd`.

## 3. Teoremas, definições e demonstrações

Comece a linha com `> [!tipo] Título`. Todas as linhas de baixo que fazem parte do bloco também começam com `>`:

    > [!teorema] Teorema de Pitágoras
    > Num triângulo retângulo de catetos $a$, $b$ e hipotenusa $c$,
    > $$
    > a^2 + b^2 = c^2.
    > $$

    > [!prova] Demonstração
    > Monte um quadrado de lado $a+b$ ...

Tipos disponíveis (a cor e o ícone mudam conforme o tipo):

| Tipo | Para quê |
|---|---|
| `definicao` | definições |
| `teorema`, `proposicao` | resultados principais |
| `lema`, `corolario` | resultados auxiliares |
| `exemplo` | exemplos e exercícios |
| `observacao` | comentários |
| `prova` (ou `demonstracao`) | demonstrações: o ∎ no final é colocado sozinho |

Os nomes em inglês também funcionam: `theorem`, `definition`, `lemma`, `corollary`, `proposition`, `example`, `remark` e `proof`.

## 4. Diagramas e gráficos

**Diagrama comutativo** (dentro de `$$`):

    $$
    \begin{tikzcd}
    A \arrow[r, "f"] \arrow[d, "g"'] & B \arrow[d, "h"] \\
    C \arrow[r, "k"'] & D
    \end{tikzcd}
    $$

**Desenho ou gráfico em TikZ:** escreva três crases seguidas de `tikz`, o desenho e mais três crases para fechar.

    ```tikz
    \begin{tikzpicture}
      \draw[->] (0,0) -- (2,0) node[right] {$x$};
      \draw[->] (0,0) -- (0,2) node[above] {$y$};
      \draw (0,0) circle (1);
    \end{tikzpicture}
    ```

- O `pgfplots`, para gráficos de funções, já vem carregado.
- Use um bloco com `latex` no lugar de `tikz` para qualquer outro trecho de LaTeX, como uma tabela complicada.
- O desenho em preto acompanha o tema: fica branco no tema escuro.

## 5. Seus próprios comandos (preamble.tex)

Se você usa atalhos como `\R` para ℝ, crie um arquivo chamado **`preamble.tex`** na pasta principal do cofre. Tudo o que estiver nele vale para todas as fórmulas de todas as notas.

1. No Windows Explorer, ative a exibição das extensões dos arquivos:
   - **Windows 11:** "Exibir" → "Mostrar" → "Extensões de nomes de arquivos".
   - **Windows 10:** aba "Exibir" → marque "Extensões de nomes de arquivos".
2. Abra a pasta do cofre. No Mathsidian, clique com o botão direito numa nota e escolha "Mostrar no explorador de arquivos".
3. Clique com o botão direito num espaço vazio → **"Novo" → "Documento de Texto"**.
4. Renomeie o arquivo para `preamble.tex`. Ele não pode se chamar `preamble.tex.txt`. Confirme o aviso de mudança de extensão.
5. Abra o arquivo com o Bloco de Notas, escreva suas definições e salve. Exemplo:

       \newcommand{\R}{\mathbb{R}}
       \newcommand{\N}{\mathbb{N}}
       \DeclareMathOperator{\sen}{sen}

Assim que você salva, as notas abertas se atualizam sozinhas.

⚠️ **Não defina o mesmo comando duas vezes** e não use `\newcommand` para nomes que já existem no LaTeX, como `\Re` ou `\det`. Isso faz **todas** as fórmulas ficarem vermelhas. Se acontecer, apague a última linha que você adicionou.

## 6. Trazer um arquivo LaTeX (.tex) para o Mathsidian

### Jeito rápido: colar direto

1. Abra o seu `.tex` no Bloco de Notas, aperte `Ctrl + A` (selecionar tudo) e depois `Ctrl + C` (copiar).
2. Numa nota vazia do Mathsidian, aperte `Ctrl + V`.

Se o texto tiver `\begin{document}`, ele vira nota automaticamente:

- seções viram títulos;
- teoremas e provas viram os blocos coloridos;
- fórmulas viram `$$`;
- seus `\newcommand` vão sozinhos para o `preamble.tex`.

Para converter só um pedaço, copie o trecho, aperte `Ctrl + P` e escolha **"Colar LaTeX como Markdown"**.

Para testar, use o arquivo `exemplo-diagramas.tex` deste projeto.

### Jeito caprichado: uma IA quebra o documento em várias notas

O arquivo [`PROMPT-LATEX-PARA-NOTAS.md`](PROMPT-LATEX-PARA-NOTAS.md) tem um texto pronto para colar em qualquer IA (ChatGPT, Claude, Gemini...). Ela transforma o documento em **notas atômicas**: uma nota por definição, uma por teorema (com a prova), uma por exemplo, todas ligadas por links, mais uma nota índice.

1. Abra o `PROMPT-LATEX-PARA-NOTAS.md`, copie **tudo** e cole na IA.
2. No final, onde está escrito `=== MEU LATEX ===`, cole o seu `.tex`, ou anexe o arquivo.
3. Se você já tem um `preamble.tex`, cole ele junto e avise.
4. Envie. Se a resposta parar com `=== CONTINUA ===`, responda `continue`.
5. Se a IA entregar um **arquivo `.zip`**:
   - extraia a pasta de dentro do `.zip` para dentro da pasta do cofre;
   - se vier um `preamble.tex`, coloque ele na pasta principal do cofre. Se você já tinha um, copie as linhas novas para o final do seu.
6. Se a IA entregar **texto** no lugar do `.zip`, cada nota vem entre `=== ARQUIVO: nome ===` e `=== FIM ===`. Crie uma nota com esse nome (`Ctrl + N`) e cole o conteúdo de cada uma.

## 7. Deu problema?

| O que acontece | O que fazer |
|---|---|
| As fórmulas ficam transparentes para sempre, ou vermelhas com "TeX não encontrado" | O MiKTeX não foi instalado ou o computador não foi reiniciado. Rode o [Setup](#instalar) de novo; se persistir, instale o MiKTeX manualmente em https://miktex.org/download, marcando "Install missing packages on-the-fly: Yes". |
| `latex --version` diz "não é reconhecido como um comando" | Reinstale o MiKTeX e, no fim, reinicie o computador. |
| A primeira fórmula demora muito | O MiKTeX está baixando pacotes. Espere e confira a internet. Da segunda vez em diante é instantâneo. |
| Uma fórmula vermelha | Erro de LaTeX nela. Passe o mouse para ler o erro. Confira chaves `{ }` sem par e espaço colado nos `$`. |
| **Todas** as fórmulas vermelhas | Provavelmente é o `preamble.tex`: um comando repetido ou inválido. Desfaça a última mudança. |
| Fórmulas antigas com aparência estranha depois de mudar algo | Feche o app e apague a pasta `latex-cache` dentro de `%APPDATA%\Mathsidian`. Para chegar lá, aperte `Windows + R`, cole `%APPDATA%\Mathsidian` e dê Enter. |
| O Windows bloqueia o `mathsidian.exe` | "Mais informações" → "Executar assim mesmo" ([Instalar](#instalar)). |

---

## 8. Para desenvolvedores

### Pastas

- `fonte-original/`: conteúdo bruto extraído, intocado.
- `fonte-nucleo/`: núcleo do app formatado com Prettier, com nomes e títulos trocados para "Mathsidian".
- `fonte-carregador/`: carregador Electron. O nome é `mathsidian`, a atualização automática está desligada e ele carrega o `nucleo.asar`.
- `mathsidian-app/`: o app rodável (`mathsidian.exe`). **Não está no repositório**, porque passa do limite de 100 MB por arquivo do GitHub. Vai nos Releases como `Mathsidian-Setup.exe`: copie o app para `dist/build/`, reempacote o `nucleo.asar` lá, rode `ISCC.exe instalador\mathsidian.iss` e depois `gh release create vX.Y.Z dist/Mathsidian-Setup.exe`.
- `rea-evidencias.json`: evidências do REA. Também fica fora do repositório pelo tamanho.

Os dados e a configuração ficam em `%APPDATA%\Mathsidian`, separados do Obsidian original.

### Editar e reempacotar

A partir da pasta do projeto:

    npx -y @electron/asar@3.2.17 pack fonte-nucleo mathsidian-app\resources\nucleo.asar
    npx -y @electron/asar@3.2.17 pack fonte-carregador mathsidian-app\resources\app.asar --unpack "*.node"

### Limites

- Os nomes locais minificados (`e`, `t`, `n`...) não são recuperáveis.
- O código é proprietário: só para estudo pessoal, não redistribua.

### Motor de matemática (`fonte-nucleo/lib/mathsidian-math/math.js`)

O MathJax foi removido. Toda fórmula `$...$` / `$$...$$` é compilada pelo TeX instalado (`latex` + `dvisvgm`) e vira um SVG inline com `currentColor`, por isso segue a cor do tema.

- **Compilação:**
  - as fórmulas são compiladas em lotes por 3 workers em paralelo;
  - o cabeçalho (pacotes + `preamble.tex`) vira um `.fmt` pré-compilado;
  - um lote com erro é dividido ao meio até isolar a fórmula culpada.
- **Cache:** fica em `%APPDATA%\Mathsidian\latex-cache`. As fórmulas do cofre são pré-compiladas em segundo plano ao abrir o app e ao salvar uma nota.
- **Prévia:** o KaTeX mostra uma prévia enquanto o TeX compila. No Quick Look (prévia do Explorer) não há TeX, então lá a saída final é o KaTeX.
- **`preamble.tex` na raiz do cofre:** entra em todo documento. As definições (`\newcommand`, `\DeclareMathOperator`...) também valem no KaTeX. Ao salvar o arquivo, tudo é re-renderizado.
- **Blocos de código:**
  - `tikz` recebe o corpo de um `tikzpicture`, com `pgfplots` e as bibliotecas `arrows.meta`, `calc`, `positioning`, `decorations.pathreplacing`, `patterns` e `shapes`;
  - `latex` recebe qualquer trecho, ou um documento inteiro com `\documentclass`.
- **Callouts de teoria:** os estilos ficam em `math.css`.
- **API de plugins:** `loadMathJax()` continua existindo só por compatibilidade e não carrega nada.

### Importar LaTeX (`fonte-nucleo/lib/mathsidian-math/import.js`)

- Colar um documento com `\begin{document}` converte o texto para Markdown:
  - teoremas e provas viram callouts;
  - `\[..\]`, `align` e `tikzcd` viram `$$`;
  - `\section` vira `##`.
- `\newcommand`, `\DeclareMathOperator` e `\usetikzlibrary` do preâmbulo são mesclados ao `preamble.tex` do cofre, só o que ainda não está lá.
- O comando `mathsidian:paste-latex` ("Colar LaTeX como Markdown") converte qualquer trecho da área de transferência.
