# Dashboard Executivo · e-Sfinge Tributário · TCE-SC

Dashboard web para acompanhamento executivo dos envios ao **e-Sfinge Tributário** do Tribunal de Contas de Santa Catarina — carteira **Betha Sistemas**.

A página é **estática** (HTML + JS), busca os dados diretamente da **planilha do Google Sheets** a cada carregamento / clique em **Atualizar**, e pode ser publicada via **GitHub Pages**.

---

## Visões disponíveis

- **KPIs executivos**: municípios na carteira, concluídos, em andamento, com incidente/chamado, não iniciados, envios concluídos, chamados vinculados e progresso médio.
- **Evolução entre competências** (01, 02 e 03/2026) em % ou valor absoluto.
- **Status por etapa/assunto**: Geração, Tratamento, Validação, Cons, Envio, Finalização e Con Finalização.
- **Situação geral dos municípios** (donut).
- **Distribuição por canal** e **Top 10 responsáveis**.
- **Tabela detalhada** por município com chips coloridos em cada etapa, barra de progresso, situação geral e links para chamados (BTHSC / TRIB).

---

## Fonte de dados

Planilha: **E-sfinge 2026** — <https://docs.google.com/spreadsheets/d/1BkynLo9QFgdwnHgtGwj6ouo6wtKMN8Lod9Reskke9h4/edit>

Abas utilizadas (gids):

| Competência | gid            |
|-------------|----------------|
| 01/2026     | `0`            |
| 02/2026     | `1841245082`   |
| 03/2026     | `1102792864`   |

Colunas lidas: `Cliente`, `Canal`, `Responsável`, `Competência`, `Geração`, `Tratamento de Dados`, `Validação`, `Cons`, `Envio`, `Finalização`, `Con Finalização`, `Chamado atendimento`, `Chamado Desenvolvimento`.

A atualização é **manual**: o time edita a planilha e, ao clicar em **Atualizar** no dashboard (ou recarregar a página), os dados mais recentes são buscados via `gviz/tq?tqx=out:csv`.

---

## Pré-requisito obrigatório: tornar a planilha acessível publicamente

Para o site estático conseguir ler os dados do navegador, a planilha precisa estar acessível sem login. Há duas formas equivalentes:

### Opção A — Compartilhamento por link (recomendado)

1. Abrir a planilha **E-sfinge 2026**.
2. Clicar em **Compartilhar** (canto superior direito).
3. Em "Acesso geral", escolher **Qualquer pessoa com o link · Leitor**.
4. Salvar.

### Opção B — Publicar na web (mais restritivo às abas)

1. Menu **Arquivo > Compartilhar > Publicar na web**.
2. Escolher **Documento inteiro** e formato **Valores separados por vírgula (.csv)**.
3. Clicar em **Publicar** e confirmar.

> Em ambos os casos, **nenhum dado é indexado automaticamente**. Apenas quem possuir o link do dashboard (ou da planilha) consegue acessar.

Se a planilha não estiver acessível, o dashboard mostrará um aviso amarelo e carregará os dados do último *deploy* (embutidos no próprio HTML).

---

## Publicando no GitHub Pages

O repositório de destino é: <https://github.com/arimanoelgomes-ctrl/esfinge_tributario_envios>

### Primeiro deploy (passo-a-passo)

```bash
# 1. Entrar na pasta do projeto
cd esfinge_tributario_envios

# 2. Adicionar os arquivos ao git
git add index.html assets README.md .gitignore .nojekyll
git commit -m "feat: dashboard executivo e-Sfinge com fetch ao vivo da planilha"

# 3. Conectar ao repositório remoto (se ainda não estiver)
git remote add origin https://github.com/arimanoelgomes-ctrl/esfinge_tributario_envios.git

# 4. Publicar
git push -u origin main
```

### Ativar o GitHub Pages

1. Acessar o repositório no GitHub.
2. **Settings > Pages**.
3. Em **Build and deployment > Source**, selecionar **Deploy from a branch**.
4. Branch: `main`, pasta: `/ (root)`. Salvar.
5. Aguardar 1–2 minutos. O GitHub exibirá a URL pública, algo como:
   `https://arimanoelgomes-ctrl.github.io/esfinge_tributario_envios/`

### Atualizações futuras

```bash
# Qualquer mudança (layout, lógica, etc.)
git add .
git commit -m "chore: ajuste <descrição>"
git push
```

O GitHub Pages republica automaticamente em ~1 minuto. O dashboard sempre lê a planilha ao vivo, então **mudanças nos dados da planilha aparecem imediatamente**, sem necessidade de novo deploy.

---

## Desenvolvimento local

O projeto é 100% estático — não há dependências ou build. Basta abrir `index.html` no navegador. Como a página faz `fetch` para a planilha, ela precisa ser servida por HTTP (não `file://`):

```bash
# Opção 1: Python
python3 -m http.server 8080

# Opção 2: Node
npx serve .
```

Depois abrir <http://localhost:8080>.

---

## Arquitetura

- **Frontend único**: `index.html` com CSS e JS embutidos.
- **Gráficos**: [Chart.js 4.4.0](https://www.chartjs.org/) via CDN.
- **Parser CSV**: implementado em JS (suporta aspas e quebras de linha dentro de células).
- **Fallback**: snapshot dos dados embutido no HTML, usado se a planilha estiver inacessível.

## Estrutura de arquivos

```
esfinge_tributario_envios/
├── index.html          # dashboard (entrypoint)
├── assets/
│   └── favicon.svg
├── .nojekyll           # evita processamento Jekyll no Pages
├── .gitignore
└── README.md
```

---

## Logos

Os logos do **Tribunal de Contas de Santa Catarina** e da **Betha Sistemas** estão renderizados como SVG inline no cabeçalho. Caso queira substituir por assets oficiais, basta trocar os blocos `<svg>` dentro de `header.top .logos` no `index.html`.
