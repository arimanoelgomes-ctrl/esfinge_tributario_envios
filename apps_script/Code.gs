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
 *     Isso agenda o snapshot automático em 4 horários por dia (10h, 12h, 15h e 18h,
 *     em America/Sao_Paulo). Cada execução do mesmo dia SOBRESCREVE a anterior, então
 *     o histórico mantém apenas a visão mais recente do dia.
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
  'Geração', 'Tratamento de dados', 'Validação IA', 'Validação',
  'Cons', 'Envio', 'Finalização', 'Con Finalização'
];

// Etapas em que o status "Não realizado" deve contar como "Concluído"
// (a etapa existe na planilha mas não foi necessária para o município).
const ETAPAS_NAO_REALIZADO_CONCLUI = { 'Validação IA': true };

// Etapas em que NÃO entram no cálculo de "Concluído integralmente" nem no
// progresso geral. 'Validação IA' fica fora porque nem todos os municípios
// precisam dela (ex.: os que foram finalizados antes da coluna existir).
// Ela continua aparecendo na tabela e nos gráficos por etapa.
const ETAPAS_FORA_CONCLUSAO = { 'Validação IA': true };
const ETAPAS_OBRIGATORIAS = ETAPAS.filter(function (e) {
  return !ETAPAS_FORA_CONCLUSAO[e];
});

const HISTORICO_NAME = 'E-sfinge Historico';
const HISTORICO_TAB  = 'Snapshots';
// IMPORTANTE: 'Validação IA' foi adicionada no FINAL (índice 17) para manter
// compatibilidade com snapshots gravados antes da coluna existir na planilha.
// Se a planilha de histórico for recriada (setupHistorico) futuramente,
// considerar reordenar colocando 'Validação IA' entre 'Tratamento de dados'
// e 'Validação'.
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
  'Chamado Desenvolvimento', // 16
  'Validação IA'        // 17 (adicionada no final p/ não invalidar histórico antigo)
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

  // Layout 'janeiro' (aba Clientes_Janeiro) tem 2 colunas extras em relação às demais:
  //   0: Ordem de Prioridade | 1: Cliente | 2: Canal | 3: Responsável | 4: Sala de Guerra |
  //   5: Competencia | 6: Geração | 7: Tratamento | 8: Validação IA | 9: Validação |
  //   10: Cons | 11: Envio | 12: Finalização | 13: Con Finalização |
  //   14: Chamado atendimento | 15: Chamado Desenvolvimento
  // Layout 'padrao' (Fevereiro/Março):
  //   0: Cliente | 1: Canal | 2: Responsável | 3: Competencia |
  //   4: Geração | 5: Tratamento | 6: Validação IA | 7: Validação | 8: Cons |
  //   9: Envio | 10: Finalização | 11: Con Finalização |
  //   12: Chamado atendimento | 13: Chamado Desenvolvimento
  const IDX = (layout === 'janeiro')
    ? { cli: 1, can: 2, resp: 3, step: 6, chamAt: 14, chamDev: 15 }
    : { cli: 0, can: 1, resp: 2, step: 4, chamAt: 12, chamDev: 13 };

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
      let v = normStatus_(r[IDX.step + s]);
      // Regra de negócio: para certas etapas, "Não realizado" significa que
      // a etapa não se aplica a esse município — deve contar como concluída.
      if (ETAPAS_NAO_REALIZADO_CONCLUI[ETAPAS[s]] && v === 'Não realizado') {
        v = 'Concluído';
      }
      rec[ETAPAS[s]] = v;
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
  if (/n[aã]o\s*realizad/.test(l)) return 'Não realizado';
  if (/n[aã]o\s*inicia/.test(l))   return 'Não iniciado';
  if (/em\s*andamento/.test(l))    return 'Em andamento';
  if (/incidente/.test(l))         return 'Incidente';
  if (/erro/.test(l))              return 'Erro de dado';
  if (/^pendent/.test(l))          return 'Não iniciado';
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
  // Força formato de texto em "Data Snapshot" (col A) e "Competência" (col C)
  // pra evitar que o Sheets interprete "01/2026" como Date automaticamente.
  sheet.getRange('A:A').setNumberFormat('@');
  sheet.getRange('C:C').setNumberFormat('@');
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

// Horários (em America/Sao_Paulo) em que o snapshotDiario é executado.
// O Google entrega o gatilho dentro de uma janela de ~1h em torno do horário,
// então 10h cai entre 10h-11h, 12h entre 12h-13h, etc.
// Cada execução do mesmo dia SOBRESCREVE a anterior (removerLinhasDaData_),
// mantendo apenas a versão mais recente do dia no histórico.
const SNAPSHOT_HOURS = [10, 12, 15, 18];

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

  // Cria um gatilho time-based para cada horário em SNAPSHOT_HOURS.
  SNAPSHOT_HOURS.forEach(function (h) {
    ScriptApp.newTrigger('snapshotDiario')
      .timeBased()
      .atHour(h)
      .everyDays(1)
      .inTimezone(TZ)
      .create();
  });

  Logger.log('Triggers de snapshotDiario reconfigurados.');
  Logger.log('  Removidos: ' + removidos + ' antigos.');
  Logger.log('  Criados:   ' + SNAPSHOT_HOURS.length + ' (horas: ' + SNAPSHOT_HOURS.join('h, ') + 'h em ' + TZ + ').');
  Logger.log('Cada execução do mesmo dia sobrescreve a anterior (1 visão por dia no histórico).');
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

  // Garantia idempotente: força formato texto nas colunas A (data) e C (competência)
  // pro Sheets não auto-interpretar valores como Date.
  sheet.getRange('A:A').setNumberFormat('@');
  sheet.getRange('C:C').setNumberFormat('@');

  // Idempotente: se a planilha de histórico foi criada antes de 'Validação IA'
  // ser adicionada ao schema, escreve apenas o cabeçalho da nova coluna (col 18 / R)
  // sem mexer em nenhuma linha de dado antiga. Os snapshots anteriores ficam com
  // essa coluna vazia — preenchida a partir do próximo snapshotDiario.
  garantirColunaValidacaoIA_(sheet);

  const agora = new Date();
  const dataStr = Utilities.formatDate(agora, TZ, 'yyyy-MM-dd');
  // Timestamp no fuso de Brasília (mais legível na planilha do que ISO/UTC)
  const tsStr = Utilities.formatDate(agora, TZ, 'yyyy-MM-dd HH:mm:ss');

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
        rec.chamado_desenv || '',
        rec['Validação IA']  // 17 (no final por compatibilidade com histórico antigo)
      ]);
    });
  });

  if (linhas.length > 0) {
    const inicio = sheet.getLastRow() + 1;
    sheet.getRange(inicio, 1, linhas.length, HISTORICO_HEADERS.length).setValues(linhas);
  }

  Logger.log('Snapshot ' + dataStr + ': ' + linhas.length + ' linhas gravadas.');
}

/**
 * Idempotente: garante que a coluna 18 (R) da aba de histórico tenha o
 * cabeçalho "Validação IA". Não toca em linhas de dado — snapshots antigos
 * seguem preservados, só ficam com essa coluna em branco até o próximo
 * snapshotDiario preencher.
 */
function garantirColunaValidacaoIA_(sheet) {
  const colIdx = HISTORICO_HEADERS.indexOf('Validação IA') + 1; // 1-based
  if (colIdx < 1) return;
  const atual = sheet.getRange(1, colIdx).getValue();
  if (String(atual || '').trim() === 'Validação IA') return;
  sheet.getRange(1, colIdx).setValue('Validação IA')
    .setFontWeight('bold')
    .setBackground('#1e3a8a')
    .setFontColor('#ffffff');
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

/**
 * statuses chega na ORDEM de ETAPAS — usamos essa correspondência para excluir
 * as etapas listadas em ETAPAS_FORA_CONCLUSAO do cálculo. Hoje só 'Validação IA'
 * fica fora: a coluna nem sempre é preenchida (em particular, municípios que
 * já tinham finalizado os envios antes da coluna existir).
 */
function statusesObrigatorios_(statuses) {
  const out = [];
  for (let i = 0; i < ETAPAS.length && i < statuses.length; i++) {
    if (!ETAPAS_FORA_CONCLUSAO[ETAPAS[i]]) out.push(statuses[i]);
  }
  return out;
}

function calcularProgressoPct_(statuses) {
  const filtrados = statusesObrigatorios_(statuses);
  let concluidas = 0;
  let total = 0;
  filtrados.forEach(function (s) {
    if (s !== 'Sem dado') {
      total++;
      if (s === 'Concluído') concluidas++;
    }
  });
  return total > 0 ? Math.round((concluidas / total) * 100) : 0;
}

function calcularSituacaoGeral_(statuses, chamAt, chamDev) {
  const filtrados = statusesObrigatorios_(statuses);
  const validos = filtrados.filter(function (s) { return s !== 'Sem dado'; });
  // Chamados/incidentes ainda consideram TODAS as etapas — Validação IA com
  // incidente, por exemplo, deve ser sinalizada na situação geral, mesmo
  // não bloqueando a marcação de "Concluído".
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

      // Competência: o Sheets pode ter interpretado "01/2026" como Date. Reverter.
      let compStr = r[2];
      if (compStr instanceof Date) {
        const m = ('0' + (compStr.getMonth() + 1)).slice(-2);
        const y = compStr.getFullYear();
        compStr = m + '/' + y;
      } else {
        compStr = String(compStr || '').trim();
      }

      // Validação IA foi adicionada no índice 17; snapshots antigos não a
      // possuem — cai em 'Sem dado' para não quebrar agregações.
      let validacaoIA = String(r[17] || '').trim();
      if (!validacaoIA) validacaoIA = 'Sem dado';
      out.push({
        data: dataStr,
        timestamp: String(r[1] || ''),
        competencia: compStr,
        cliente: String(r[3] || ''),
        canal: String(r[4] || ''),
        responsavel: String(r[5] || ''),
        'Geração': String(r[6] || ''),
        'Tratamento de dados': String(r[7] || ''),
        'Validação IA': validacaoIA,
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
      'Validação IA': r['Validação IA'],
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
