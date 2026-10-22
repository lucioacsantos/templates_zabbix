// Codigo 5 — status dos fluxos (alteracoes 9/10 do DBT-6131 / TO-BE AMCOM)
// Entrada: GET {$NIFI.URL}/flow/process-groups/{$NIFI.ROOT_PG_ID}/status?recursive=true
// Saida:   lista JSON com um bloco por "fluxo" (Process Group na profundidade
//          {$NIFI.FLUXO.PROFUNDIDADE}); os contadores de PROCESSADORES/FILAS de cada
//          fluxo acumulam o subgrupo inteiro (TO-BE 1.3) — os "fluxos" com metricas
//          de janela 5m (in/out) usam o aggregateSnapshot proprio, que o NiFi ja
//          agrega por arvore.
// Portas de entrada/saida sao ignoradas de proposito: portas sem conexao aparecem
// como "invalidas" no NiFi, mas nao indicam falha (35 falsos positivos no HML).
// Compativel com NiFi 1.x (campos flat + versionedFlowState) e 2.x (comps
// "{id, ...StatusSnapshot}", sem versionedFlowState no status).
// '{$NIFI.FLUXO.PROFUNDIDADE}' e substituida pelo Zabbix antes da execucao;
// se nao resolver, parseInt falha e o padrao 1 (do template) e usado.

var prof = parseInt('{$NIFI.FLUXO.PROFUNDIDADE}', 10);
if (isNaN(prof) || prof < 0) { prof = 1; }

var entity = JSON.parse(value);
var root = entity && (entity.processGroupStatus || entity);
if (!root || (!root.id && !root.aggregateSnapshot)) { throw 'NiFi: resposta inesperada de /flow/process-groups/*/status'; }

function num(v) { var n = parseInt(v, 10); return isNaN(n) ? 0 : n; }
function flt(v) { var f = parseFloat(v); return isNaN(f) ? 0 : f; }
function rnd2(x) { return Math.round(x * 100) / 100; }
function desempacota(e) {
  if (!e) { return {}; }
  return e.processorStatusSnapshot || e.connectionStatusSnapshot || e.processGroupStatusSnapshot || e.remoteProcessGroupStatusSnapshot || e;
}
function snap(d) { return (d && (d.aggregateSnapshot || d)) || {}; }

function bytesDe(txt) {
  var m = String(txt || '').match(/([\d.,]+)\s*(B|KB|MB|GB|TB)/i);
  if (!m) { return 0; }
  var f = parseFloat(m[1].replace(',', '.'));
  if (isNaN(f)) { return 0; }
  var mult = { B: 1, KB: 1024, MB: 1048576, GB: 1073741824, TB: 1099511627776 };
  return Math.round(f * mult[m[2].toUpperCase()]);
}

function usoFila(c) {
  var qO = c.flowFilesQueued != null ? num(c.flowFilesQueued)
    : (c.queuedCount != null ? num(c.queuedCount)
    : (typeof c.queued === 'number' ? c.queued : num(String(c.queued || '').split(' ')[0])));
  var qB = c.bytesQueued != null ? num(c.bytesQueued)
    : (c.queuedBytes != null ? num(c.queuedBytes)
    : (typeof c.queuedSize === 'number' ? num(c.queuedSize) : bytesDe(c.queued)));
  var thO = num(c.backPressureObjectThreshold);
  var thB = num(c.backPressureBytesThreshold);
  var u1 = c.percentUseCount != null ? flt(c.percentUseCount) : (thO > 0 ? 100 * qO / thO : 0);
  var u2 = c.percentUseBytes != null ? flt(c.percentUseBytes) : (thB > 0 ? 100 * qB / thB : 0);
  return { pct: Math.max(u1, u2), qO: qO, qB: qB };
}

function msDe(p) {
  if (p.taskDurationNanos != null) { return num(p.taskDurationNanos) / 1000000; }
  if (p.tasksDurationNanos != null) { return num(p.tasksDurationNanos) / 1000000; }
  if (p.taskDurationMillis != null) { return num(p.taskDurationMillis); }
  if (p.taskMillis != null) { return num(p.taskMillis); }
  return 0;
}
function tasksDe(p) {
  if (p.taskCount != null) { return num(p.taskCount); }
  if (p.invoked != null) { return num(p.invoked); }
  return 0;
}

var rows = [];

function coletar(dto, depth) {
  var s = snap(dto);
  var acc = {
    id: dto && dto.id != null ? String(dto.id) : String(s.id || ''),
    nome: String((dto && dto.name) || s.name || ''),
    profundidade: depth,
    stopped: 0,
    invalid: 0,
    max_uso_fila_pct: 0,
    conexoes_contrapressao: 0,
    fila_flowfiles: 0,
    fila_bytes: 0,
    pgs_com_deriva: 0,
    flowfiles_in_5min: 0,
    flowfiles_out_5min: 0,
    bytes_in_5min: 0,
    bytes_out_5min: 0,
    threads_ativas: 0,
    tarefas_ms_5min: 0,
    proc_mais_lento: '',
    proc_mais_lento_ms_por_tarefa: 0,
    versionamento: ''
  };

  var estado = String(s.versionedFlowState || (dto && dto.versionedFlowState) || '');
  if (estado !== '' && estado.toUpperCase() !== 'UP_TO_DATE') { acc.pgs_com_deriva = 1; }
  acc.versionamento = estado;

  var temProc = false;
  (s.processorStatusSnapshots || []).forEach(function (e) {
    var p = desempacota(e);
    temProc = true;
    var st = String(p.runStatus || p.state || '').toUpperCase();
    if (st === 'STOPPED' || st === 'STOPPING') { acc.stopped++; }
    if (st === 'INVALID') { acc.invalid++; }
    acc.threads_ativas += num(p.activeThreadCount);
    var ms = msDe(p);
    var tz = tasksDe(p);
    acc.tarefas_ms_5min += ms;
    if (tz > 0 && ms > 0 && (ms / tz) > acc.proc_mais_lento_ms_por_tarefa) {
      acc.proc_mais_lento_ms_por_tarefa = ms / tz;
      acc.proc_mais_lento = String(p.name || p.id || '');
    }
  });

  (s.connectionStatusSnapshots || []).forEach(function (e) {
    var c = desempacota(e);
    var u = usoFila(c);
    acc.fila_flowfiles += u.qO;
    acc.fila_bytes += u.qB;
    if (u.pct > acc.max_uso_fila_pct) { acc.max_uso_fila_pct = u.pct; }
    if (u.pct >= 100) { acc.conexoes_contrapressao++; }
  });

  // O aggregateSnapshot de cada PG ja agrega a subarvore inteira (NiFi 2.x e 1.x
  // recursive): filas, in/out 5m, threads e tempo de processamento vem do proprio
  // snapshot; se o campo nao existir na versao em uso, caimos na soma da subarvore.
  var temQ = (s.flowFilesQueued != null || s.queuedCount != null);
  var temQB = (s.bytesQueued != null);
  var temThr = (s.activeThreadCount != null);
  var temNanos = (s.processingNanos != null);

  acc.flowfiles_in_5min = num(s.flowFilesIn);
  acc.flowfiles_out_5min = num(s.flowFilesOut);
  acc.bytes_in_5min = num(s.bytesIn);
  acc.bytes_out_5min = num(s.bytesOut);
  if (temQ) { acc.fila_flowfiles = num(s.flowFilesQueued != null ? s.flowFilesQueued : s.queuedCount); }
  if (temQB) { acc.fila_bytes = num(s.bytesQueued); }
  if (temThr) { acc.threads_ativas = num(s.activeThreadCount) + num(s.statelessActiveThreadCount); }
  if (temNanos) { acc.tarefas_ms_5min = num(s.processingNanos) / 1000000; }

  (s.processGroupStatusSnapshots || s.groupStatusSnapshots || []).forEach(function (e) {
    var sub = coletar(desempacota(e), depth + 1);
    acc.stopped += sub.stopped;
    acc.invalid += sub.invalid;
    acc.max_uso_fila_pct = Math.max(acc.max_uso_fila_pct, sub.max_uso_fila_pct);
    acc.conexoes_contrapressao += sub.conexoes_contrapressao;
    if (!temQ) { acc.fila_flowfiles += sub.fila_flowfiles; }
    if (!temQB) { acc.fila_bytes += sub.fila_bytes; }
    acc.pgs_com_deriva += sub.pgs_com_deriva;
    if (!temThr) { acc.threads_ativas += sub.threads_ativas; }
    if (!temNanos) { acc.tarefas_ms_5min += sub.tarefas_ms_5min; }
    if (sub.proc_mais_lento_ms_por_tarefa > acc.proc_mais_lento_ms_por_tarefa) {
      acc.proc_mais_lento_ms_por_tarefa = sub.proc_mais_lento_ms_por_tarefa;
      acc.proc_mais_lento = sub.proc_mais_lento;
    }
  });

  if (prof === 0 || depth === prof) {
    rows.push({
      id: acc.id,
      nome: acc.nome,
      profundidade: depth,
      stopped: acc.stopped,
      invalid: acc.invalid,
      max_uso_fila_pct: rnd2(acc.max_uso_fila_pct),
      conexoes_contrapressao: acc.conexoes_contrapressao,
      fila_flowfiles: acc.fila_flowfiles,
      fila_bytes: acc.fila_bytes,
      pgs_com_deriva: acc.pgs_com_deriva,
      flowfiles_in_5min: acc.flowfiles_in_5min,
      flowfiles_out_5min: acc.flowfiles_out_5min,
      bytes_in_5min: acc.bytes_in_5min,
      bytes_out_5min: acc.bytes_out_5min,
      threads_ativas: acc.threads_ativas,
      tarefas_ms_5min: Math.round(acc.tarefas_ms_5min),
      proc_mais_lento: acc.proc_mais_lento,
      proc_mais_lento_ms_por_tarefa: rnd2(acc.proc_mais_lento_ms_por_tarefa),
      versionamento: acc.versionamento
    });
  }

  return acc;
}

coletar(root, 0);
return JSON.stringify(rows);