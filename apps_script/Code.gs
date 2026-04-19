/**
 * Apps Script · e-Sfinge Tributário · API pública para o dashboard
 *
 * COMO IMPLANTAR (passo a passo):
 *  1. Abrir https://script.google.com/  e clicar em "Novo projeto".
 *  2. Dar um nome ao projeto (ex: "API e-Sfinge Dashboard").
 *  3. Apagar o conteúdo padrão e COLAR este arquivo inteiro.
 *  4. Menu: Implantar > Nova implantação > Selecionar tipo > Aplicativo da Web.
 *        - Descrição:         "API pública do dashboard e-Sfinge"
 *        - Executar como:     "Eu (<seu email @betha.com.br>)"    <-- IMPORTANTE
 *        - Quem tem acesso:   "Qualquer pessoa"                   <-- IMPORTANTE
 *  5. Clicar em "Implantar". Autorizar o acesso à planilha quando o Google pedir.
 *  6. Copiar a "URL do aplicativo da Web" gerada. Ela tem a forma:
 *        https://script.google.com/macros/s/AKfycb.../exec
 *  7. No GitHub, editar o arquivo config.js do repositório e colar essa URL.
 *
 * Como atualizar o código (sem gerar URL nova): Implantar > Gerenciar implantações
 *   > ícone de lápis na implantação existente > Versão "Nova versão" > Implantar.
 */

const SHEET_ID = '1BkynLo9QFgdwnHgtGwj6ouo6wtKMN8Lod9Reskke9h4';

const TABS = [
  { competencia: '01/2026', nome: 'Clientes_Janeiro',   layout: 'janeiro' },
  { competencia: '02/2026', nome: 'Clientes_Fevereiro', layout: 'padrao'  },
  { competencia: '03/2026', nome: 'Clientes_Março',     layout: 'padrao'  }
];

const ETAPAS = [
  'Geração', 'Tratamento de dados', 'Validação',
  'Cons', 'Envio', 'Finalização', 'Con Finalização'
];

function doGet(e) {
  // Quando o dashboard está publicado em outro domínio (GitHub Pages)
  // e este Web App está com acesso restrito ao domínio @betha.com.br,
  // requisições fetch cross-origin não enviam os cookies de autenticação
  // do Google, e a chamada é redirecionada para a tela de login.
  // A solução é usar JSONP: se a URL vier com ?callback=nomeDaFuncao,
  // respondemos com JavaScript que executa nomeDaFuncao(payload).
  // Tags <script> carregam cookies de terceiros normalmente, então o
  // Apps Script reconhece o usuário e devolve os dados.

  let payload;
  try {
    const data = coletarDados_();
    payload = {
      ok: true,
      generatedAt: new Date().toISOString(),
      data: data
    };
  } catch (err) {
    payload = { ok: false, error: String(err) };
  }

  const cb = (e && e.parameter && e.parameter.callback)
    ? String(e.parameter.callback)
    : '';

  // Só aceita nomes de função válidos (segurança contra injeção de JS)
  if (cb && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(cb)) {
    return ContentService
      .createTextOutput(cb + '(' + JSON.stringify(payload) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function coletarDados_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const saida = {};
  TABS.forEach(function (tab) {
    saida[tab.competencia] = lerAba_(ss, tab.nome, tab.layout);
  });
  return saida;
}

function lerAba_(ss, nome, layout) {
  const sheet = ss.getSheetByName(nome);
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  if (!rows || rows.length < 2) return [];

  const IDX = (layout === 'janeiro')
    ? { cli: 1, can: 2, resp: 3, step: 5, chamAt: 12, chamDev: 13 }
    : { cli: 0, can: 1, resp: 2, step: 4, chamAt: 11, chamDev: 12 };

  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const cli = String(r[IDX.cli] || '').trim();
    if (!cli) continue;

    const rec = {
      cliente: cli.toUpperCase(),
      canal: normText_(r[IDX.can], 'Sem canal'),
      responsavel: normText_(r[IDX.resp], 'Não definido')
    };
    for (let s = 0; s < ETAPAS.length; s++) {
      rec[ETAPAS[s]] = normStatus_(r[IDX.step + s]);
    }
    rec.chamado_atendimento = extrairLink_(r[IDX.chamAt]);
    rec.chamado_desenv      = extrairLink_(r[IDX.chamDev]);
    out.push(rec);
  }
  return out;
}

function normStatus_(v) {
  if (v === null || v === undefined) return 'Sem dado';
  const s = String(v).trim();
  if (!s) return 'Sem dado';
  if (/^https?:\/\//i.test(s)) return 'Chamado aberto';
  if (/^\[.*\]/.test(s))       return 'Chamado aberto';
  const l = s.toLowerCase();
  if (/conclu[ií]d/.test(l))       return 'Concluído';
  if (/n[aã]o\s*inicia/.test(l))   return 'Não iniciado';
  if (/em\s*andamento/.test(l))    return 'Em andamento';
  if (/incidente/.test(l))         return 'Incidente';
  if (/erro/.test(l))              return 'Erro de dado';
  if (/envio de 2025/.test(l))     return 'Pendência 2025';
  return s.substring(0, 60);
}

function normText_(v, fallback) {
  if (v === null || v === undefined) return fallback;
  const s = String(v).trim();
  return s ? s : fallback;
}

function extrairLink_(v) {
  if (!v) return null;
  const s = String(v).trim();
  return /^https?:\/\//i.test(s) ? s : null;
}

/** Teste local: executar a função abaixo manualmente (botão ▶ Executar) e
 *  verificar no log (Ctrl+Enter) se os dados vêm corretamente antes de implantar. */
function teste() {
  const d = coletarDados_();
  Object.keys(d).forEach(function (k) {
    Logger.log(k + ': ' + d[k].length + ' municípios');
  });
}
