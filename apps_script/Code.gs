/**
 * Apps Script · e-Sfinge Tributário · API pública do dashboard + histórico diário
 *
 * COMO IMPLANTAR (passo a passo):
 *  1. Abrir https://script.google.com/  e clicar em "Novo projeto" (se ainda não existir).
 *  2. Dar um nome ao projeto (ex: "API e-Sfinge Dashboard").
 *  3. Apagar o conteúdo padrão e COLAR este arquivo inteiro.
 *  4. Menu: Implantar > Nova implantação > Selecionar tipo > Aplicativo da Web.
 *        - Descrição:         "API pública do dashboard e-Sfinge"
 *        - Executar como:     "Eu (<seu email @betha.com.br>)"          <-- IMPORTANTE
 *        - Quem tem acesso:   "Qualquer pessoa na Betha Sistemas"       <-- seguro, domínio fechado
 *  5. Clicar em "Implantar". Autorizar o acesso à planilha quando o Google pedir.
 *  6. Copiar a "URL do aplicativo da Web" gerada. Ela tem a forma:
 *        https://script.google.com/a/macros/betha.com.br/s/AKfycb.../exec
 *  7. No GitHub, editar o arquivo config.js do repositório e colar essa URL.
 *
 * SETUP DO HISTÓRICO (primeira vez):
 *  1. No editor do Apps Script, selecionar a função "setupHistorico" no menu de funções.
 *  2. Clicar em "Executar". Autorizar permissões do Drive se pedir.
 *     Isso cria a planilha "E-sfinge Historico" no seu Drive e salva o ID.
 *  3. Selecionar a função "configurarTrigger" e clicar em "Executar".
 *     Isso agenda o snapshot diário automático entre 15h e 16h.
 *  4. Opcional: rodar "snapshotDiario" manualmente uma vez para já ter o primeiro dia.
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

const HISTORICO_NAME = 'E-sfinge Historico';
const HISTORICO_TAB  = 'Snapshots';
const HISTORICO_HEADERS = [
  'Data Snapshot',      // 0 (YYYY-MM-DD)
  'Timestamp',          // 1 (ISO)
  'Competência',        // 2
  'Cliente',            // 3
  'Canal',              // 4
  'Responsável',        // 5
  'Geração',            // 6
  'Tratamento de dados',// 7
  'Validação',          // 8
  'Cons',               // 9
  'Envio',              // 10
  'Finalização',        // 11
  'Con Finalização',    // 12
  'Progresso %',        // 13
  'Situação Geral',     // 14
  'Chamado Atendimento',// 15
  'Chamado Desenvolvimento' // 16
];

const TZ = 'America/Sao_Paulo';

/* =====================================================================
 * API pública (doGet)
 * ===================================================================== */

function doGet(e) {
  let payload;
  try {
    const mode = (e && e.parameter && e.parameter.api) || 'all';

    if (mode === 'historico') {
      payload = {
        ok: true,
        generatedAt: new Date().toISOString(),
        historico_agregado: agregarHistoricoDiario_()
      };
    } else if (mode === 'historico_data') {
      const data = (e && e.parameter && e.parameter.data) || '';
      payload = {
        ok: true,
        generatedAt: new Date().toISOString(),
        data_alvo: data,
        historico_detalhe: lerHistoricoPorData_(data)
      };
    } else if (mode === 'atual') {
      payload = {
        ok: true,
        generatedAt: new Date().toISOString(),
        data: coletarDados_()
      };
    } else {
      // "all" → atual + agregado histórico
      payload = {
        ok: true,
        generatedAt: new Date().toISOString(),
        data: coletarDados_(),
        historico_agregado: agregarHistoricoDiario_()
      };
    }
  } catch (err) {
    payload = { ok: false, error: String(err) };
  }

  return responder_(payload, e);
}

function responder_(payload, e) {
  const cb = (e && e.parameter && e.parameter.callback)
    ? String(e.parameter.callback)
    : '';
  if (cb && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(cb)) {
    return ContentService
      .createTextOutput(cb + '(' + JSON.stringify(payload) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

/* =====================================================================
 * Leitura dos dados atuais (planilha E-sfinge 2026)
 * ===================================================================== */

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

/* =====================================================================
 * Setup do histórico (executar UMA vez manualmente)
 * ===================================================================== */

function setupHistorico() {
  const props = PropertiesService.getScriptProperties();
  const existente = props.getProperty('HISTORICO_SHEET_ID');

  if (existente) {
    try {
      const ss = SpreadsheetApp.openById(existente);
      Logger.log('Planilha de histórico já existe.');
      Logger.log('URL: ' + ss.getUrl());
      return ss.getUrl();
    } catch (e) {
      Logger.log('ID anterior inválido, criando nova...');
    }
  }

  const nova = SpreadsheetApp.create(HISTORICO_NAME);
  const sheet = nova.getActiveSheet();
  sheet.setName(HISTORICO_TAB);
  sheet.appendRow(HISTORICO_HEADERS);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, HISTORICO_HEADERS.length)
    .setFontWeight('bold')
    .setBackground('#1e3a8a')
    .setFontColor('#ffffff');
  sheet.autoResizeColumns(1, HISTORICO_HEADERS.length);

  props.setProperty('HISTORICO_SHEET_ID', nova.getId());

  Logger.log('✅ Planilha "E-sfinge Historico" criada.');
  Logger.log('URL: ' + nova.getUrl());
  Logger.log('ID:  ' + nova.getId());
  Logger.log('Próximo passo: executar a função configurarTrigger().');

  return nova.getUrl();
}

/* =====================================================================
 * Agendamento do snapshot diário
 * ===================================================================== */

function configurarTrigger() {
  // Remove triggers antigos da função snapshotDiario
  const triggers = ScriptApp.getProjectTriggers();
  let removidos = 0;
  triggers.forEach(function (t) {
    if (t.getHandlerFunction() === 'snapshotDiario') {
      ScriptApp.deleteTrigger(t);
      removidos++;
    }
  });

  // Cria novo gatilho às 15:30 (o Google garante entre 15h e 16h)
  ScriptApp.newTrigger('snapshotDiario')
    .timeBased()
    .atHour(15)
    .nearMinute(30)
    .everyDays(1)
    .inTimezone(TZ)
    .create();

  Logger.log('Trigger de snapshotDiario reconfigurado (' + removidos + ' antigos removidos).');
  Logger.log('Execução diária: 15:30 (America/Sao_Paulo), janela real 15h-16h.');
}

/* =====================================================================
 * Snapshot diário (chamado pelo trigger)
 * ===================================================================== */

function snapshotDiario() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('HISTORICO_SHEET_ID');
  if (!id) {
    throw new Error('HISTORICO_SHEET_ID não configurado. Rode setupHistorico() primeiro.');
  }

  const sheet = SpreadsheetApp.openById(id).getSheetByName(HISTORICO_TAB);
  if (!sheet) {
    throw new Error('Aba "' + HISTORICO_TAB + '" não encontrada na planilha de histórico.');
  }

  const agora = new Date();
  const dataStr = Utilities.formatDate(agora, TZ, 'yyyy-MM-dd');
  const tsStr = agora.toISOString();

  // Idempotência: se já rodou hoje, apaga as linhas de hoje antes de reescrever
  removerLinhasDaData_(sheet, dataStr);

  const dados = coletarDados_();
  const linhas = [];

  Object.keys(dados).forEach(function (comp) {
    dados[comp].forEach(function (rec) {
      const statuses = ETAPAS.map(function (e) { return rec[e] || 'Sem dado'; });
      const progresso = calcularProgressoPct_(statuses);
      const situacao  = calcularSituacaoGeral_(statuses, rec.chamado_atendimento, rec.chamado_desenv);

      linhas.push([
        dataStr,
        tsStr,
        comp,
        rec.cliente,
        rec.canal,
        rec.responsavel,
        rec['Geração'],
        rec['Tratamento de dados'],
        rec['Validação'],
        rec['Cons'],
        rec['Envio'],
        rec['Finalização'],
        rec['Con Finalização'],
        progresso,
        situacao,
        rec.chamado_atendimento || '',
        rec.chamado_desenv || ''
      ]);
    });
  });

  if (linhas.length > 0) {
    const inicio = sheet.getLastRow() + 1;
    sheet.getRange(inicio, 1, linhas.length, HISTORICO_HEADERS.length).setValues(linhas);
  }

  Logger.log('Snapshot ' + dataStr + ': ' + linhas.length + ' linhas gravadas.');
}

function removerLinhasDaData_(sheet, dataStr) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const col = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  // varre de baixo pra cima pra não bagunçar índices ao deletar
  const linhasParaRemover = [];
  for (let i = 0; i < col.length; i++) {
    let v = col[i][0];
    if (v instanceof Date) {
      v = Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
    } else {
      v = String(v || '').trim();
    }
    if (v === dataStr) linhasParaRemover.push(i + 2);
  }
  // ordenar desc e deletar
  linhasParaRemover.sort(function (a, b) { return b - a; });
  linhasParaRemover.forEach(function (r) { sheet.deleteRow(r); });
}

function calcularProgressoPct_(statuses) {
  let concluidas = 0;
  let total = 0;
  statuses.forEach(function (s) {
    if (s !== 'Sem dado') {
      total++;
      if (s === 'Concluído') concluidas++;
    }
  });
  return total > 0 ? Math.round((concluidas / total) * 100) : 0;
}

function calcularSituacaoGeral_(statuses, chamAt, chamDev) {
  const validos = statuses.filter(function (s) { return s !== 'Sem dado'; });
  const hasChamado = !!(chamAt || chamDev) || statuses.some(function (s) { return s === 'Chamado aberto'; });
  const hasIncidente = statuses.some(function (s) { return s === 'Incidente' || s === 'Erro de dado'; });

  if (validos.length === 0) return 'Não iniciado';
  if (validos.every(function (s) { return s === 'Concluído'; })) return 'Concluído';
  if (hasIncidente) return 'Com incidente';
  if (hasChamado) return 'Com chamado';
  if (validos.some(function (s) { return s === 'Concluído' || s === 'Em andamento'; })) return 'Em andamento';
  return 'Não iniciado';
}

/* =====================================================================
 * Leitura/agregação do histórico
 * ===================================================================== */

function lerHistoricoLinhas_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('HISTORICO_SHEET_ID');
  if (!id) return [];
  try {
    const sheet = SpreadsheetApp.openById(id).getSheetByName(HISTORICO_TAB);
    if (!sheet) return [];
    const rows = sheet.getDataRange().getValues();
    if (!rows || rows.length < 2) return [];
    const out = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      let dataStr = r[0];
      if (dataStr instanceof Date) dataStr = Utilities.formatDate(dataStr, TZ, 'yyyy-MM-dd');
      else dataStr = String(dataStr || '').trim();
      if (!dataStr) continue;
      out.push({
        data: dataStr,
        timestamp: String(r[1] || ''),
        competencia: String(r[2] || ''),
        cliente: String(r[3] || ''),
        canal: String(r[4] || ''),
        responsavel: String(r[5] || ''),
        'Geração': String(r[6] || ''),
        'Tratamento de dados': String(r[7] || ''),
        'Validação': String(r[8] || ''),
        'Cons': String(r[9] || ''),
        'Envio': String(r[10] || ''),
        'Finalização': String(r[11] || ''),
        'Con Finalização': String(r[12] || ''),
        progresso: Number(r[13]) || 0,
        situacao: String(r[14] || ''),
        chamado_atendimento: String(r[15] || '') || null,
        chamado_desenv: String(r[16] || '') || null
      });
    }
    return out;
  } catch (e) {
    return [];
  }
}

/**
 * Agregação diária para o dashboard: 1 linha por (data, competencia) com
 * totais, % médio de progresso e contagens por etapa. Pequeno o suficiente
 * para vir no payload principal mesmo após anos de histórico.
 */
function agregarHistoricoDiario_() {
  const linhas = lerHistoricoLinhas_();
  const agg = {};

  linhas.forEach(function (r) {
    const key = r.data + '|' + r.competencia;
    if (!agg[key]) {
      agg[key] = {
        data: r.data,
        competencia: r.competencia,
        total: 0,
        concluidos: 0,
        em_andamento: 0,
        nao_iniciado: 0,
        com_chamado: 0,
        com_incidente: 0,
        soma_progresso: 0,
        etapas: {}
      };
      ETAPAS.forEach(function (e) {
        agg[key].etapas[e] = { concluido: 0, em_andamento: 0, nao_iniciado: 0, outros: 0, total: 0 };
      });
    }
    const a = agg[key];
    a.total++;
    a.soma_progresso += r.progresso;

    switch (r.situacao) {
      case 'Concluído':     a.concluidos++; break;
      case 'Em andamento':  a.em_andamento++; break;
      case 'Não iniciado':  a.nao_iniciado++; break;
      case 'Com chamado':   a.com_chamado++; break;
      case 'Com incidente': a.com_incidente++; break;
    }

    ETAPAS.forEach(function (e) {
      const s = r[e];
      const et = a.etapas[e];
      et.total++;
      if (s === 'Concluído') et.concluido++;
      else if (s === 'Em andamento') et.em_andamento++;
      else if (s === 'Não iniciado' || s === 'Sem dado' || s === '') et.nao_iniciado++;
      else et.outros++;
    });
  });

  const arr = Object.keys(agg).map(function (k) {
    const a = agg[k];
    a.progresso_medio = a.total > 0 ? Math.round(a.soma_progresso / a.total) : 0;
    delete a.soma_progresso;
    return a;
  });

  arr.sort(function (x, y) {
    if (x.data !== y.data) return x.data < y.data ? -1 : 1;
    return x.competencia.localeCompare(y.competencia);
  });

  return arr;
}

/**
 * Retorna o snapshot detalhado de uma data específica (todos os municípios
 * de todas as competências naquele dia), no MESMO formato que coletarDados_
 * devolve para os dados atuais — assim o dashboard pode renderizar usando
 * exatamente o mesmo código.
 */
function lerHistoricoPorData_(dataStr) {
  if (!dataStr) return {};
  const linhas = lerHistoricoLinhas_().filter(function (r) { return r.data === dataStr; });
  const porComp = {};
  linhas.forEach(function (r) {
    if (!porComp[r.competencia]) porComp[r.competencia] = [];
    porComp[r.competencia].push({
      cliente: r.cliente,
      canal: r.canal,
      responsavel: r.responsavel,
      'Geração': r['Geração'],
      'Tratamento de dados': r['Tratamento de dados'],
      'Validação': r['Validação'],
      'Cons': r['Cons'],
      'Envio': r['Envio'],
      'Finalização': r['Finalização'],
      'Con Finalização': r['Con Finalização'],
      chamado_atendimento: r.chamado_atendimento || null,
      chamado_desenv: r.chamado_desenv || null
    });
  });
  return porComp;
}

/* =====================================================================
 * Testes locais (executar manualmente no editor)
 * ===================================================================== */

function teste() {
  const d = coletarDados_();
  Object.keys(d).forEach(function (k) {
    Logger.log(k + ': ' + d[k].length + ' municípios');
  });
}

function testeHistorico() {
  const a = agregarHistoricoDiario_();
  Logger.log('Dias x competências agregados: ' + a.length);
  if (a.length > 0) Logger.log('Exemplo: ' + JSON.stringify(a[0]));
}
