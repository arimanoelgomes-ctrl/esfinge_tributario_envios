# Dashboard Executivo · e-Sfinge Tributário · TCE-SC

Dashboard web para acompanhamento executivo dos envios ao **e-Sfinge Tributário** do Tribunal de Contas de Santa Catarina — carteira **Betha Sistemas**.

A página é **estática** (HTML + JS) e busca os dados da **planilha E-sfinge 2026** sempre que é carregada ou quando o botão **Atualizar** é clicado.

> **URL pública:** https://arimanoelgomes-ctrl.github.io/esfinge_tributario_envios/

---

## Visões disponíveis

- **KPIs executivos**: municípios na carteira, concluídos, em andamento, com incidente/chamado, não iniciados, envios concluídos, chamados vinculados e progresso médio.
- **Evolução histórica diária** (linha do tempo) do progresso médio e % concluído por competência — baseada nos snapshots automáticos de 15:30.
- **Evolução histórica por etapa** ao longo do tempo (Geração, Tratamento, Validação, Cons, Envio, Finalização, Con Finalização).
- **Seletor de data** no cabeçalho: escolher uma data passada e o dashboard inteiro passa a mostrar a "foto" do e-Sfinge naquele dia (KPIs, tabela, gráficos).
- **Evolução entre competências** (01, 02 e 03/2026) em % ou valor absoluto.
- **Status por etapa/assunto**: Geração, Tratamento, Validação, Cons, Envio, Finalização e Con Finalização.
- **Situação geral dos municípios** (donut).
- **Distribuição por canal** e **Top 10 responsáveis**.
- **Tabela detalhada** por município com chips coloridos em cada etapa, barra de progresso, situação geral e links para chamados (BTHSC / TRIB).

---

## Fonte de dados

Planilha: **E-sfinge 2026** — <https://docs.google.com/spreadsheets/d/1BkynLo9QFgdwnHgtGwj6ouo6wtKMN8Lod9Reskke9h4/edit>

Abas utilizadas:

| Competência | Aba                    | gid            |
|-------------|------------------------|----------------|
| 01/2026     | `Clientes_Janeiro`     | `0`            |
| 02/2026     | `Clientes_Fevereiro`   | `1841245082`   |
| 03/2026     | `Clientes_Março`       | `1102792864`   |

Colunas lidas: `Cliente`, `Canal`, `Responsável`, `Competência`, `Geração`, `Tratamento de Dados`, `Validação`, `Cons`, `Envio`, `Finalização`, `Con Finalização`, `Chamado atendimento`, `Chamado Desenvolvimento`.

---

## Como a leitura dos dados funciona

A planilha está compartilhada somente dentro do domínio **@betha.com.br** (corporativo). Por isso o navegador de um visitante — mesmo que seja da Betha — **não consegue** buscar os dados diretamente da planilha, pois `fetch` entre origens (GitHub Pages → docs.google.com) não envia cookies do Google.

A solução adotada é um **Apps Script** que roda dentro do Google (autenticado como o dono da planilha) e expõe um endpoint HTTP público que o dashboard consome:

```
GitHub Pages (dashboard)  →  Apps Script Web App (autenticado)  →  Planilha
```

### Passo 1 · Implantar o Apps Script (1 vez)

1. Abrir <https://script.google.com/> **logado com a conta @betha.com.br** que tem acesso à planilha.
2. Clicar em **"Novo projeto"** e dar um nome, ex: `API e-Sfinge Dashboard`.
3. Apagar o conteúdo padrão e **colar todo o conteúdo** do arquivo [`apps_script/Code.gs`](./apps_script/Code.gs) deste repositório.
4. Salvar (Ctrl + S).
5. Menu **Implantar > Nova implantação > Selecionar tipo > Aplicativo da Web**.
   - **Descrição**: `API pública do dashboard e-Sfinge`
   - **Executar como**: `Eu (seu-email@betha.com.br)` *(importante)*
   - **Quem tem acesso**: `Qualquer pessoa` *(importante)*
6. Clicar em **Implantar** e autorizar o acesso à planilha quando o Google pedir.
7. **Copiar a URL do aplicativo da Web**. Ela tem o formato:
   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```

### Passo 2 · Apontar o dashboard para o Apps Script

Edite o arquivo [`config.js`](./config.js) na raiz do repositório e cole a URL:

```js
window.APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycb.../exec";
```

Pode editar direto no GitHub (botão ✏️ em `config.js` → colar URL → **Commit changes**). O GitHub Pages republica automaticamente em ~1 minuto.

### Passo 3 · Atualizar o Apps Script quando a lógica mudar

Apenas se o conteúdo do `Code.gs` for alterado. No script: **Implantar > Gerenciar implantações** → ícone de lápis → **Versão: Nova versão** → **Implantar** (isso **não** gera uma URL nova — mantém a mesma URL de antes).

Mudanças apenas nos **dados** da planilha **não exigem nada** — o dashboard relê na hora.

---

## Histórico diário (snapshots automáticos às 15:30)

O dashboard armazena um snapshot diário do e-Sfinge em uma planilha separada chamada **E-sfinge Historico**. Isso permite:

- Ver a **evolução diária** do progresso por competência (gráfico de linha)
- Ver a **evolução por etapa** (Geração, Tratamento, Validação, Cons, Envio, Finalização, Con Finalização) ao longo do tempo
- **Voltar no tempo**: selecionar qualquer data passada no cabeçalho e o dashboard inteiro passa a mostrar a "foto" do e-Sfinge naquele dia

### Estrutura do histórico

- **Planilha**: `E-sfinge Historico` (criada automaticamente no seu Drive na primeira execução)
- **Aba**: `Snapshots`
- **Granularidade**: 1 linha por município × competência × dia
- **Colunas**: Data Snapshot, Timestamp, Competência, Cliente, Canal, Responsável, Geração, Tratamento, Validação, Cons, Envio, Finalização, Con Finalização, Progresso %, Situação Geral, Chamado Atendimento, Chamado Desenvolvimento

### Setup (fazer **1 vez** após o Passo 3)

No editor do Apps Script (`script.google.com`, mesmo projeto onde está o `Code.gs`):

1. No topo da tela, onde lista as funções, selecionar **`setupHistorico`** e clicar em **Executar** (▶).  
   O Google pedirá autorização para acessar o Drive. Autorizar.  
   Isso cria a planilha `E-sfinge Historico` no seu Drive e grava o ID dela nas ScriptProperties.  
   No log (Ctrl+Enter) vai aparecer a URL da planilha criada.

2. Selecionar **`configurarTrigger`** e clicar em **Executar**.  
   Isso agenda o snapshot diário para rodar todo dia entre 15h e 16h (horário de Brasília).

3. **Opcional**: selecionar **`snapshotDiario`** e clicar em **Executar** uma vez. Isso grava o primeiro snapshot imediatamente, assim o dashboard já tem 1 ponto de histórico para mostrar.

### Verificar se está rodando

- Abrir a planilha `E-sfinge Historico` no seu Drive → ver se novas linhas aparecem a cada dia às 15:30.
- No Apps Script: **Acionadores** (menu lateral com ícone de relógio) → deve listar um acionador de `snapshotDiario` com frequência "Diariamente".
- **Execuções** (ícone de lista) → mostra o histórico de execuções, com sucesso/erro.

### Se quiser mudar o horário ou a frequência

Editar a função `configurarTrigger()` em `Code.gs` e rodar de novo. Exemplo — 2x ao dia:

```javascript
ScriptApp.newTrigger('snapshotDiario').timeBased().atHour(7).everyDays(1).inTimezone(TZ).create();
ScriptApp.newTrigger('snapshotDiario').timeBased().atHour(18).everyDays(1).inTimezone(TZ).create();
```

> **Idempotência**: se `snapshotDiario` rodar mais de uma vez no mesmo dia, a execução mais recente sobrescreve as linhas do próprio dia — não duplica dados.

### Volume esperado

Para uma carteira de ~300 municípios × 3 competências = ~900 linhas/dia. Em 1 ano: ~330 mil linhas. O Google Sheets suporta até 10 milhões de células, então cabem vários anos sem problema.

---

## Publicando no GitHub Pages

Este repositório já está publicado em:  
**https://arimanoelgomes-ctrl.github.io/esfinge_tributario_envios/**

Atualizações do dashboard (código HTML/CSS/JS):

```bash
git add .
git commit -m "chore: <descrição>"
git push
```

GitHub Pages republica automaticamente em 1–2 minutos.

---

## Desenvolvimento local

```bash
# Opção 1: Python
python3 -m http.server 8080

# Opção 2: Node
npx serve .
```

Abrir <http://localhost:8080>. O `fetch` precisa ser servido por HTTP — abrir o `index.html` direto via `file://` não funciona.

---

## Arquitetura

- **Frontend único**: `index.html` com CSS e JS embutidos.
- **Configuração**: `config.js` carrega a URL do Apps Script.
- **Gráficos**: [Chart.js 4.4.0](https://www.chartjs.org/) via CDN.
- **Backend leve**: `apps_script/Code.gs` (Google Apps Script) lê a planilha e retorna JSON.
- **Fallback**: snapshot dos dados embutido no próprio `index.html`, usado caso o fetch falhe.

## Estrutura de arquivos

```
esfinge_tributario_envios/
├── index.html              # dashboard (entrypoint do GitHub Pages)
├── config.js               # URL do Apps Script Web App
├── apps_script/
│   └── Code.gs             # código do backend para colar no script.google.com
├── assets/
│   └── favicon.svg
├── .nojekyll               # evita processamento Jekyll no Pages
├── .gitignore
└── README.md
```

---

## Logos

Os logos do **Tribunal de Contas de Santa Catarina** e da **Betha Sistemas** estão renderizados como SVG inline no cabeçalho. Para substituir por assets oficiais, basta trocar os blocos `<svg>` dentro de `header.top .logos` no `index.html`.
