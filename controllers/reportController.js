const Funcionario = require('../models/funcionarioModel');
const Departamento = require('../models/departamentoModel');
const Presenca = require('../models/presencaModel');
const Falta = require('../models/faltaModel');
const Ferias = require('../models/feriasModel');
const FolhaPagamento = require('../models/folhaPagamentoModel');
const SubUnidade = require('../models/subUnidadeModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const {
  buildRelacaoNominalData,
  applyRelacaoNominalPersonalizacao,
  RELACAO_NOMINAL_CAMPOS_EDITAVEIS,
} = require('../utils/relacaoNominalBuilder');
const {
  generateRelacaoNominalPdf,
} = require('../utils/relacaoNominalPdf');
const {
  generateRelacaoNominalExcel,
} = require('../utils/relacaoNominalExcel');
const { resolveReportBranding } = require('../utils/reportBranding');
const {
  buildInssFolhaRemuneracaoData,
  applyInssFolhaPersonalizacao,
  INSS_FOLHA_CAMPOS_EDITAVEIS,
} = require('../utils/inssFolhaRemuneracaoBuilder');
const {
  generateInssFolhaRemuneracaoPdf,
} = require('../utils/inssFolhaRemuneracaoPdf');
const {
  generateInssFolhaRemuneracaoExcel,
} = require('../utils/inssFolhaRemuneracaoExcel');
const {
  buildSissmoTxtData,
  generateSissmoTxtBuffer,
} = require('../utils/sissmoTxtExport');
const { buildCompanyVarianceData } = require('../utils/companyVarianceBuilder');
const { generateCompanyVariancePdf } = require('../utils/companyVariancePdf');
const { generateCompanyVarianceExcel } = require('../utils/companyVarianceExcel');
const { buildAuditTrailData } = require('../utils/auditTrailBuilder');
const { generateAuditTrailPdf } = require('../utils/auditTrailPdf');
const { generateAuditTrailExcel } = require('../utils/auditTrailExcel');
const { buildGeneralLedgerData } = require('../utils/generalLedgerBuilder');
const { generateGeneralLedgerExcel } = require('../utils/generalLedgerExcel');
const {
  buildNetPayReportData,
  buildIrpsReportData,
  buildTotalCostToCompanyData,
  buildEmployee12MonthData
} = require('../utils/payrollAnnualReportsBuilder');
const {
  generateNetPayExcel,
  generateIrpsExcel,
  generateTotalCostToCompanyExcel,
  generateEmployee12MonthExcel
} = require('../utils/payrollAnnualReportsExcel');
const { buildHeadcountReportData } = require('../utils/headcountReportBuilder');
const { generateHeadcountExcel } = require('../utils/headcountReportExcel');

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const EMPLOYEE_ACTIVE_FILTER = {
  status: { $nin: ['Demitido', 'Inativo', 'Falecido'] },
};

const resolveEmpresaId = (user) => {
  const role = String(user?.role || '').toLowerCase();
  if (role === 'super-admin' && !user?.empresa_id) return null;
  if (!user?.empresa_id) {
    throw new AppError('Utilizador sem empresa associada', 403);
  }
  return user.empresa_id;
};

const empresaMatch = (empresaId) =>
  empresaId ? { empresa_id: empresaId } : {};

const startOfDay = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const startOfMonth = (date = new Date()) => {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
};

const formatPayrollShort = (value) => {
  const n = Number(value) || 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M MT`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K MT`;
  return `${Math.round(n).toLocaleString('pt-MZ')} MT`;
};

const pctChangeLabel = (current, previous) => {
  if (!previous) {
    return current > 0 ? '+100% vs mês anterior' : 'Sem dados do mês anterior';
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return 'Sem alteração vs mês anterior';
  return `${pct > 0 ? '+' : ''}${pct}% vs mês anterior`;
};

async function getFuncionarioIds(empresaId) {
  const rows = await Funcionario.find({
    ...empresaMatch(empresaId),
    ...EMPLOYEE_ACTIVE_FILTER,
  }).select('_id');
  return rows.map((r) => r._id);
}

async function buildAlerts(empresaId, funcionarioIds) {
  const alerts = [];
  const feriasPendentes = await Ferias.countDocuments({
    funcionario_id: { $in: funcionarioIds },
    status: 'Pendente',
  });
  if (feriasPendentes > 0) {
    alerts.push({
      text: `${feriasPendentes} pedido(s) de férias aguardam aprovação`,
      type: feriasPendentes >= 5 ? 'warning' : 'info',
    });
  }

  const faltasInjustificadas = await Falta.countDocuments({
    funcionario_id: { $in: funcionarioIds },
    $or: [{ justificada: false }, { tipo: 'Não Justificada' }],
  });
  if (faltasInjustificadas > 0) {
    alerts.push({
      text: `${faltasInjustificadas} falta(s) por justificar`,
      type: faltasInjustificadas >= 3 ? 'error' : 'warning',
    });
  }

  if (empresaId) {
    const now = new Date();
    const folhaMes = await FolhaPagamento.findOne({
      empresa_id: empresaId,
      mes: MESES[now.getMonth()],
      ano: now.getFullYear(),
    }).select('status');

    if (!folhaMes || !['Processado', 'Fechado'].includes(folhaMes.status)) {
      alerts.push({
        text: `Processamento salarial pendente para ${MESES[now.getMonth()]}`,
        type: 'error',
      });
    }
  }

  return alerts;
}

const resolveBrandingFromRequest = async (req) => {
  const empresaId =
    resolveEmpresaId(req.user) || req.query.empresa_id || req.body?.empresa_id;
  const subempresaId = req.query.subempresa_id || req.body?.subempresa_id;
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  return resolveReportBranding({ empresaId, subempresaId, baseUrl });
};

exports.getReportBranding = catchAsync(async (req, res) => {
  const branding = await resolveBrandingFromRequest(req);
  res.status(200).json({
    status: 'success',
    data: branding,
  });
});

exports.getDashboard = catchAsync(async (req, res) => {
  const empresaId = resolveEmpresaId(req.user);
  const funcionarioIds = await getFuncionarioIds(empresaId);
  const totalEmployees = funcionarioIds.length;

  const monthStart = startOfMonth();
  const nextMonthStart = startOfMonth(
    new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1),
  );

  const hiredThisMonth = await Funcionario.countDocuments({
    ...empresaMatch(empresaId),
    ...EMPLOYEE_ACTIVE_FILTER,
    data_admissao: { $gte: monthStart, $lt: nextMonthStart },
  });
  const employeeChange =
    hiredThisMonth > 0
      ? `+${hiredThisMonth} este mês`
      : 'Sem admissões este mês';

  const hoje = startOfDay();
  const amanha = new Date(hoje);
  amanha.setDate(amanha.getDate() + 1);

  const presentToday = await Presenca.countDocuments({
    funcionario_id: { $in: funcionarioIds },
    data: { $gte: hoje, $lt: amanha },
    status: { $in: ['Presente', 'Atrasado'] },
  });
  const attendancePct = totalEmployees
    ? Math.round((presentToday / totalEmployees) * 100)
    : 0;
  const presentChange = `${attendancePct}% presença`;

  const absentToday = await Falta.countDocuments({
    funcionario_id: { $in: funcionarioIds },
    $or: [{ justificada: false }, { tipo: 'Não Justificada' }],
  });
  const unjustifiedAbsences = absentToday;
  const absentChange =
    unjustifiedAbsences > 0
      ? `${unjustifiedAbsences} injustificada${unjustifiedAbsences === 1 ? '' : 's'}`
      : 'Todas justificadas';

  const vacationPending = await Ferias.countDocuments({
    funcionario_id: { $in: funcionarioIds },
    status: 'Pendente',
  });
  const vacationRequests = await Ferias.countDocuments({
    funcionario_id: { $in: funcionarioIds },
    status: { $in: ['Pendente', 'Aprovado'] },
  });
  const vacationChange =
    vacationPending > 0
      ? `${vacationPending} pendente${vacationPending === 1 ? '' : 's'}`
      : 'Nenhum pendente';

  let payrollCost = 0;
  let payrollChange = 'Sem folha processada';
  if (empresaId) {
    const now = new Date();
    const mesAtual = MESES[now.getMonth()];
    const anoAtual = now.getFullYear();
    const mesAnterior =
      now.getMonth() === 0
        ? MESES[11]
        : MESES[now.getMonth() - 1];
    const anoAnterior =
      now.getMonth() === 0 ? anoAtual - 1 : anoAtual;

    const [folhaAtual, folhaAnterior] = await Promise.all([
      FolhaPagamento.findOne({
        empresa_id: empresaId,
        mes: mesAtual,
        ano: anoAtual,
      })
        .sort({ updatedAt: -1 })
        .select('total_liquido total_bruto status'),
      FolhaPagamento.findOne({
        empresa_id: empresaId,
        mes: mesAnterior,
        ano: anoAnterior,
      })
        .sort({ updatedAt: -1 })
        .select('total_liquido total_bruto'),
    ]);

    payrollCost = Number(
      folhaAtual?.total_liquido ?? folhaAtual?.total_bruto ?? 0,
    );
    const prevPayroll = Number(
      folhaAnterior?.total_liquido ?? folhaAnterior?.total_bruto ?? 0,
    );
    payrollChange = pctChangeLabel(payrollCost, prevPayroll);
  }

  const alerts = await buildAlerts(empresaId, funcionarioIds);
  const urgentAlerts = alerts.filter((a) => a.type === 'error').length;
  const alertsChange =
    urgentAlerts > 0
      ? `${urgentAlerts} urgente${urgentAlerts === 1 ? '' : 's'}`
      : alerts.length > 0
        ? `${alerts.length} aviso${alerts.length === 1 ? '' : 's'}`
        : 'Sem alertas';

  const branding = await resolveBrandingFromRequest(req);

  const porDepartamento = await Funcionario.aggregate([
    {
      $match: {
        ...empresaMatch(empresaId),
        ...EMPLOYEE_ACTIVE_FILTER,
      },
    },
    { $group: { _id: '$departamento_id', count: { $sum: 1 } } },
    {
      $lookup: {
        from: Departamento.collection.name,
        localField: '_id',
        foreignField: '_id',
        as: 'departamento',
      },
    },
    {
      $project: {
        department: {
          $ifNull: [
            { $arrayElemAt: ['$departamento.nome', 0] },
            'Sem departamento',
          ],
        },
        count: 1,
      },
    },
    { $sort: { count: -1 } },
  ]);

  const porContrato = await Funcionario.aggregate([
    {
      $match: {
        ...empresaMatch(empresaId),
        ...EMPLOYEE_ACTIVE_FILTER,
      },
    },
    { $group: { _id: '$tipo_contrato', count: { $sum: 1 } } },
    {
      $project: {
        name: { $ifNull: ['$_id', 'Não definido'] },
        value: '$count',
        count: 1,
      },
    },
    { $sort: { value: -1 } },
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      totalEmployees,
      employeeChange,
      presentToday,
      presentChange,
      absentToday,
      absentChange,
      vacationRequests,
      vacationChange,
      payrollCost: formatPayrollShort(payrollCost),
      payrollCostRaw: payrollCost,
      payrollChange,
      alertCount: alerts.length,
      alertsChange,
      alerts,
      porDepartamento,
      porContrato,
      branding,
      generatedAt: new Date().toISOString(),
    },
  });
});

exports.getDepartments = catchAsync(async (req, res) => {
  const empresaId = resolveEmpresaId(req.user);
  const branding = await resolveBrandingFromRequest(req);
  const porDepartamento = await Funcionario.aggregate([
    {
      $match: {
        ...empresaMatch(empresaId),
        ...EMPLOYEE_ACTIVE_FILTER,
      },
    },
    { $group: { _id: '$departamento_id', count: { $sum: 1 } } },
    {
      $lookup: {
        from: Departamento.collection.name,
        localField: '_id',
        foreignField: '_id',
        as: 'departamento',
      },
    },
    {
      $project: {
        department: {
          $ifNull: [
            { $arrayElemAt: ['$departamento.nome', 0] },
            'Sem departamento',
          ],
        },
        count: 1,
      },
    },
    { $sort: { count: -1 } },
  ]);

  res.status(200).json({
    status: 'success',
    data: { porDepartamento, branding },
  });
});

exports.getContracts = catchAsync(async (req, res) => {
  const empresaId = resolveEmpresaId(req.user);
  const branding = await resolveBrandingFromRequest(req);
  const rows = await Funcionario.aggregate([
    {
      $match: {
        ...empresaMatch(empresaId),
        ...EMPLOYEE_ACTIVE_FILTER,
      },
    },
    { $group: { _id: '$tipo_contrato', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  const total = rows.reduce((sum, r) => sum + r.count, 0) || 1;
  const contracts = rows.map((r) => ({
    name: r._id || 'Não definido',
    tipo: r._id || 'Não definido',
    count: r.count,
    value: r.count,
    percent: Math.round((r.count / total) * 100),
  }));

  res.status(200).json({
    status: 'success',
    data: { contracts, porContrato: contracts, branding },
  });
});

exports.getAlerts = catchAsync(async (req, res) => {
  const empresaId = resolveEmpresaId(req.user);
  const branding = await resolveBrandingFromRequest(req);
  const funcionarioIds = await getFuncionarioIds(empresaId);
  const alerts = await buildAlerts(empresaId, funcionarioIds);

  res.status(200).json({
    status: 'success',
    data: { alerts, branding },
  });
});

const resolveRelacaoEmpresaId = (req) => {
  const fromUser = resolveEmpresaId(req.user);
  if (fromUser) return fromUser;
  const empresaId = req.query.empresa_id || req.body?.empresa_id;
  if (empresaId) return empresaId;
  throw new AppError('empresa_id é obrigatório', 400);
};

const buildRelacaoNominalPayload = async (req) => {
  const empresaId = resolveRelacaoEmpresaId(req);
  const source = req.method === 'GET' ? req.query : req.body;
  const data = await buildRelacaoNominalData({
    empresaId,
    mes: source.mes,
    ano: source.ano,
    subUnidadeId: source.sub_unidade_id,
  });
  return applyRelacaoNominalPersonalizacao(data, source.personalizacao);
};

const sendRelacaoNominalFile = (res, buffer, filename, contentType) => {
  res.set({
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': buffer.length,
  });
  res.status(200).send(buffer);
};

/**
 * GET /reports/relacao-nominal?mes=&ano=&sub_unidade_id=
 * Preview JSON da Relação Nominal (campos editáveis antes da exportação).
 */
exports.getRelacaoNominal = catchAsync(async (req, res) => {
  const data = await buildRelacaoNominalPayload(req);

  res.status(200).json({
    status: 'success',
    data: {
      ...data,
      campos_editaveis: RELACAO_NOMINAL_CAMPOS_EDITAVEIS,
    },
  });
});

/**
 * POST /reports/relacao-nominal/preview
 * Reaplica personalizações (cabeçalho manual + observações) na pré-visualização.
 */
exports.postRelacaoNominalPreview = catchAsync(async (req, res) => {
  const data = await buildRelacaoNominalPayload(req);

  res.status(200).json({
    status: 'success',
    data: {
      ...data,
      campos_editaveis: RELACAO_NOMINAL_CAMPOS_EDITAVEIS,
    },
  });
});

/**
 * GET /reports/relacao-nominal/pdf?mes=&ano=&sub_unidade_id=
 */
exports.getRelacaoNominalPdf = catchAsync(async (req, res) => {
  const data = await buildRelacaoNominalPayload(req);
  const buffer = await generateRelacaoNominalPdf(data);
  const filename = `relacao-nominal-${data.cabecalho.numero_folha}-${data.cabecalho.mes}-${data.cabecalho.ano}.pdf`;
  sendRelacaoNominalFile(res, buffer, filename, 'application/pdf');
});

/**
 * POST /reports/relacao-nominal/pdf
 * Exporta PDF com personalizações da pré-visualização.
 */
exports.postRelacaoNominalPdf = catchAsync(async (req, res) => {
  const data = await buildRelacaoNominalPayload(req);
  const buffer = await generateRelacaoNominalPdf(data);
  const filename = `relacao-nominal-${data.cabecalho.numero_folha}-${data.cabecalho.mes}-${data.cabecalho.ano}.pdf`;
  sendRelacaoNominalFile(res, buffer, filename, 'application/pdf');
});

/**
 * GET /reports/relacao-nominal/excel?mes=&ano=&sub_unidade_id=
 */
exports.getRelacaoNominalExcel = catchAsync(async (req, res) => {
  const data = await buildRelacaoNominalPayload(req);
  const buffer = await generateRelacaoNominalExcel(data);
  const filename = `relacao-nominal-${data.cabecalho.numero_folha}-${data.cabecalho.mes}-${data.cabecalho.ano}.xlsx`;
  sendRelacaoNominalFile(
    res,
    buffer,
    filename,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
});

/**
 * POST /reports/relacao-nominal/excel
 * Exporta Excel com personalizações da pré-visualização.
 */
exports.postRelacaoNominalExcel = catchAsync(async (req, res) => {
  const data = await buildRelacaoNominalPayload(req);
  const buffer = await generateRelacaoNominalExcel(data);
  const filename = `relacao-nominal-${data.cabecalho.numero_folha}-${data.cabecalho.mes}-${data.cabecalho.ano}.xlsx`;
  sendRelacaoNominalFile(
    res,
    buffer,
    filename,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
});

const buildInssFolhaPayload = async (req) => {
  const empresaId = resolveRelacaoEmpresaId(req);
  const source = req.method === 'GET' ? req.query : req.body;
  const data = await buildInssFolhaRemuneracaoData({
    empresaId,
    mes: source.mes,
    ano: source.ano,
    multaAtraso: source.multa_atraso ?? source.personalizacao?.multa_atraso,
    guiaContribuicaoNumero:
      source.guia_contribuicao_numero ??
      source.personalizacao?.guia_contribuicao_numero,
  });
  return applyInssFolhaPersonalizacao(data, source.personalizacao);
};

/**
 * GET /reports/inss-folha-remuneracao?mes=&ano=
 */
exports.getInssFolhaRemuneracao = catchAsync(async (req, res) => {
  const data = await buildInssFolhaPayload(req);
  res.status(200).json({
    status: 'success',
    data: {
      ...data,
      campos_editaveis: INSS_FOLHA_CAMPOS_EDITAVEIS,
    },
  });
});

/**
 * POST /reports/inss-folha-remuneracao/preview
 */
exports.postInssFolhaRemuneracaoPreview = catchAsync(async (req, res) => {
  const data = await buildInssFolhaPayload(req);
  res.status(200).json({
    status: 'success',
    data: {
      ...data,
      campos_editaveis: INSS_FOLHA_CAMPOS_EDITAVEIS,
    },
  });
});

exports.getInssFolhaRemuneracaoPdf = catchAsync(async (req, res) => {
  const data = await buildInssFolhaPayload(req);
  const buffer = await generateInssFolhaRemuneracaoPdf(data);
  const filename = `inss-folha-remuneracao-${data.cabecalho.mes_numero}-${data.cabecalho.ano}.pdf`;
  sendRelacaoNominalFile(res, buffer, filename, 'application/pdf');
});

exports.postInssFolhaRemuneracaoPdf = catchAsync(async (req, res) => {
  const data = await buildInssFolhaPayload(req);
  const buffer = await generateInssFolhaRemuneracaoPdf(data);
  const filename = `inss-folha-remuneracao-${data.cabecalho.mes_numero}-${data.cabecalho.ano}.pdf`;
  sendRelacaoNominalFile(res, buffer, filename, 'application/pdf');
});

exports.getInssFolhaRemuneracaoExcel = catchAsync(async (req, res) => {
  const data = await buildInssFolhaPayload(req);
  const buffer = await generateInssFolhaRemuneracaoExcel(data);
  const filename = `inss-folha-remuneracao-${data.cabecalho.mes_numero}-${data.cabecalho.ano}.xlsx`;
  sendRelacaoNominalFile(
    res,
    buffer,
    filename,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
});

exports.postInssFolhaRemuneracaoExcel = catchAsync(async (req, res) => {
  const data = await buildInssFolhaPayload(req);
  const buffer = await generateInssFolhaRemuneracaoExcel(data);
  const filename = `inss-folha-remuneracao-${data.cabecalho.mes_numero}-${data.cabecalho.ano}.xlsx`;
  sendRelacaoNominalFile(
    res,
    buffer,
    filename,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
});

const buildSissmoPayload = async (req) => {
  const empresaId = resolveRelacaoEmpresaId(req);
  const source = req.method === 'GET' ? req.query : req.body;
  return buildSissmoTxtData({
    empresaId,
    mes: source.mes,
    ano: source.ano,
    requireFechado: source.require_fechado !== 'false' && source.require_fechado !== false,
  });
};

/**
 * GET /reports/sissmo-txt?mes=&ano=
 * Pré-validação JSON (sem download) — inclui lista de colaboradores sem INSS.
 */
exports.getSissmoTxtPreview = catchAsync(async (req, res) => {
  const data = await buildSissmoPayload(req);
  res.status(200).json({
    status: 'success',
    data: {
      tipo: data.tipo,
      mes: data.mes,
      mes_numero: data.mes_numero,
      ano: data.ano,
      folha_id: data.folha_id,
      folha_status: data.folha_status,
      filename: data.filename,
      total_linhas: data.total_linhas,
      valido: data.valido,
      sem_inss: data.sem_inss,
      gerado_em: data.gerado_em,
    },
  });
});

/**
 * GET /reports/sissmo-txt/download?mes=&ano=
 * Download do ficheiro .txt para upload no SISSMO.
 */
exports.getSissmoTxtDownload = catchAsync(async (req, res, next) => {
  const data = await buildSissmoPayload(req);

  if (!data.valido) {
    return next(
      new AppError(
        `${data.sem_inss.length} colaborador(es) sem número de INSS registado. Corrija os cadastros antes de exportar.`,
        422,
      ),
    );
  }

  const buffer = generateSissmoTxtBuffer(data);
  sendRelacaoNominalFile(res, buffer, data.filename, 'text/plain; charset=utf-8');
});

/**
 * GET /reports/company-variance?mes=&ano=
 * Preview JSON do Comparativo Salarial
 */
exports.getCompanyVariance = catchAsync(async (req, res, next) => {
  const empresaId = resolveRelacaoEmpresaId(req);
  const source = req.method === 'GET' ? req.query : req.body;
  const data = await buildCompanyVarianceData({
    empresaId,
    mes: source.mes,
    ano: source.ano,
    subUnidadeId: source.sub_unidade_id || source.subUnidadeId,
    departamentoId: source.departamento_id || source.departamentoId
  });

  res.status(200).json({
    status: 'success',
    data
  });
});

/**
 * GET /reports/company-variance/pdf
 */
exports.getCompanyVariancePdf = catchAsync(async (req, res, next) => {
  const empresaId = resolveRelacaoEmpresaId(req);
  const source = req.method === 'GET' ? req.query : req.body;
  const data = await buildCompanyVarianceData({
    empresaId,
    mes: source.mes,
    ano: source.ano,
    subUnidadeId: source.sub_unidade_id || source.subUnidadeId,
    departamentoId: source.departamento_id || source.departamentoId
  });
  const buffer = await generateCompanyVariancePdf(data);
  const filename = `company-variance-${data.periodo_selecionado.mes}-${data.periodo_selecionado.ano}.pdf`;
  sendRelacaoNominalFile(res, buffer, filename, 'application/pdf');
});

exports.postCompanyVariancePdf = exports.getCompanyVariancePdf;

/**
 * GET /reports/company-variance/excel
 */
exports.getCompanyVarianceExcel = catchAsync(async (req, res, next) => {
  const empresaId = resolveRelacaoEmpresaId(req);
  const source = req.method === 'GET' ? req.query : req.body;
  const data = await buildCompanyVarianceData({
    empresaId,
    mes: source.mes,
    ano: source.ano,
    subUnidadeId: source.sub_unidade_id || source.subUnidadeId,
    departamentoId: source.departamento_id || source.departamentoId
  });
  const buffer = await generateCompanyVarianceExcel(data);
  const filename = `company-variance-${data.periodo_selecionado.mes}-${data.periodo_selecionado.ano}.xlsx`;
  sendRelacaoNominalFile(
    res,
    buffer,
    filename,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
});

exports.postCompanyVarianceExcel = exports.getCompanyVarianceExcel;

/**
 * GET /reports/audit-trail
 */
exports.getAuditTrail = catchAsync(async (req, res, next) => {
  const empresaId = resolveRelacaoEmpresaId(req);
  const source = req.method === 'GET' ? req.query : req.body;
  const data = await buildAuditTrailData({
    empresaId,
    modulo: source.modulo,
    severidade: source.severidade,
    dataInicio: source.data_inicio || source.dataInicio,
    dataFim: source.data_fim || source.dataFim,
    limite: source.limite
  });

  res.status(200).json({
    status: 'success',
    data
  });
});

/**
 * GET /reports/audit-trail/pdf
 */
exports.getAuditTrailPdf = catchAsync(async (req, res, next) => {
  const empresaId = resolveRelacaoEmpresaId(req);
  const source = req.method === 'GET' ? req.query : req.body;
  const data = await buildAuditTrailData({
    empresaId,
    modulo: source.modulo,
    severidade: source.severidade,
    dataInicio: source.data_inicio || source.dataInicio,
    dataFim: source.data_fim || source.dataFim,
    limite: source.limite
  });
  const buffer = await generateAuditTrailPdf(data);
  const filename = `audit-trail-${data.filtros.data_inicio.replace(/\//g, '-')}-a-${data.filtros.data_fim.replace(/\//g, '-')}.pdf`;
  sendRelacaoNominalFile(res, buffer, filename, 'application/pdf');
});

/**
 * GET /reports/audit-trail/excel
 */
exports.getAuditTrailExcel = catchAsync(async (req, res, next) => {
  const empresaId = resolveRelacaoEmpresaId(req);
  const source = req.method === 'GET' ? req.query : req.body;
  const data = await buildAuditTrailData({
    empresaId,
    modulo: source.modulo,
    severidade: source.severidade,
    dataInicio: source.data_inicio || source.dataInicio,
    dataFim: source.data_fim || source.dataFim,
    limite: source.limite
  });
  const buffer = await generateAuditTrailExcel(data);
  const filename = `audit-trail-${data.filtros.data_inicio.replace(/\//g, '-')}-a-${data.filtros.data_fim.replace(/\//g, '-')}.xlsx`;
  sendRelacaoNominalFile(
    res,
    buffer,
    filename,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
});

/**
 * GET /reports/filter-options
 * Retorna departamentos e sub-unidades (centros de custo) de uma empresa
 */
exports.getFilterOptions = catchAsync(async (req, res, next) => {
  const empresaId = resolveEmpresaId(req.user);
  if (!empresaId) return next(new AppError('Empresa não associada', 400));

  const [departamentos, subUnidades] = await Promise.all([
    Departamento.find({ empresa_id: empresaId }).select('nome codigo'),
    SubUnidade.find({ empresa_id: empresaId, estado: 'Ativo' }).select('nome codigo tipo')
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      departamentos,
      subUnidades
    }
  });
});

/**
 * GET /reports/general-ledger/preview
 */
exports.getGeneralLedgerData = catchAsync(async (req, res, next) => {
  const empresaId = resolveRelacaoEmpresaId(req);
  const source = req.method === 'GET' ? req.query : req.body;
  const data = await buildGeneralLedgerData({
    empresaId,
    mes: source.mes,
    ano: source.ano,
    subUnidadeId: source.sub_unidade_id || source.subUnidadeId,
    departamentoId: source.departamento_id || source.departamentoId
  });
  res.status(200).json({
    status: 'success',
    data
  });
});

/**
 * GET /reports/general-ledger/excel
 */
exports.getGeneralLedgerExcel = catchAsync(async (req, res, next) => {
  const empresaId = resolveRelacaoEmpresaId(req);
  const source = req.method === 'GET' ? req.query : req.body;
  const data = await buildGeneralLedgerData({
    empresaId,
    mes: source.mes,
    ano: source.ano,
    subUnidadeId: source.sub_unidade_id || source.subUnidadeId,
    departamentoId: source.departamento_id || source.departamentoId
  });
  const buffer = await generateGeneralLedgerExcel(data);
  const mesSuffix = data.periodo?.mes && data.periodo.mes !== 'Todos' && data.periodo.mes !== 'Todos os meses' ? `-${data.periodo.mes}` : '';
  const filename = `general-ledger-${data.periodo.ano}${mesSuffix}.xlsx`;
  sendRelacaoNominalFile(
    res,
    buffer,
    filename,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
});

/**
 * GET /reports/net-pay
 */
exports.getNetPay = catchAsync(async (req, res, next) => {
  const empresaId = resolveRelacaoEmpresaId(req);
  const source = req.query;
  const data = await buildNetPayReportData({
    empresaId,
    ano: source.ano,
    mes: source.mes,
    subUnidadeId: source.sub_unidade_id,
    departamentoId: source.departamento_id
  });
  res.status(200).json({ status: 'success', data });
});

/**
 * GET /reports/net-pay/excel
 */
exports.getNetPayExcel = catchAsync(async (req, res, next) => {
  const empresaId = resolveRelacaoEmpresaId(req);
  const source = req.query;
  const data = await buildNetPayReportData({
    empresaId,
    ano: source.ano,
    mes: source.mes,
    subUnidadeId: source.sub_unidade_id,
    departamentoId: source.departamento_id
  });
  const buffer = await generateNetPayExcel(data);
  const mesSuffix = source.mes && source.mes !== 'Todos' && source.mes !== 'Todos os meses' ? `-${source.mes}` : '';
  sendRelacaoNominalFile(
    res,
    buffer,
    `net-pay-report-${data.ano}${mesSuffix}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
});

/**
 * GET /reports/irps-annual
 */
exports.getIrpsAnnual = catchAsync(async (req, res, next) => {
  const empresaId = resolveRelacaoEmpresaId(req);
  const source = req.query;
  const data = await buildIrpsReportData({
    empresaId,
    ano: source.ano,
    mes: source.mes,
    subUnidadeId: source.sub_unidade_id,
    departamentoId: source.departamento_id
  });
  res.status(200).json({ status: 'success', data });
});

/**
 * GET /reports/irps-annual/excel
 */
exports.getIrpsAnnualExcel = catchAsync(async (req, res, next) => {
  const empresaId = resolveRelacaoEmpresaId(req);
  const source = req.query;
  const data = await buildIrpsReportData({
    empresaId,
    ano: source.ano,
    mes: source.mes,
    subUnidadeId: source.sub_unidade_id,
    departamentoId: source.departamento_id
  });
  const buffer = await generateIrpsExcel(data);
  const mesSuffix = source.mes && source.mes !== 'Todos' && source.mes !== 'Todos os meses' ? `-${source.mes}` : '';
  sendRelacaoNominalFile(
    res,
    buffer,
    `irps-report-${data.ano}${mesSuffix}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
});

/**
 * GET /reports/total-cost-to-company
 */
exports.getTotalCostToCompany = catchAsync(async (req, res, next) => {
  const empresaId = resolveRelacaoEmpresaId(req);
  const source = req.query;
  const data = await buildTotalCostToCompanyData({
    empresaId,
    ano: source.ano,
    mes: source.mes,
    subUnidadeId: source.sub_unidade_id,
    departamentoId: source.departamento_id
  });
  res.status(200).json({ status: 'success', data });
});

/**
 * GET /reports/total-cost-to-company/excel
 */
exports.getTotalCostToCompanyExcel = catchAsync(async (req, res, next) => {
  const empresaId = resolveRelacaoEmpresaId(req);
  const source = req.query;
  const data = await buildTotalCostToCompanyData({
    empresaId,
    ano: source.ano,
    mes: source.mes,
    subUnidadeId: source.sub_unidade_id,
    departamentoId: source.departamento_id
  });
  const buffer = await generateTotalCostToCompanyExcel(data);
  const mesSuffix = source.mes && source.mes !== 'Todos' && source.mes !== 'Todos os meses' ? `-${source.mes}` : '';
  sendRelacaoNominalFile(
    res,
    buffer,
    `total-cost-to-company-${data.ano}${mesSuffix}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
});

/**
 * GET /reports/employee-12-month
 */
exports.getEmployee12Month = catchAsync(async (req, res, next) => {
  const empresaId = resolveRelacaoEmpresaId(req);
  const source = req.query;
  const data = await buildEmployee12MonthData({
    empresaId,
    ano: source.ano,
    funcionarioId: source.funcionario_id
  });
  res.status(200).json({ status: 'success', data });
});

/**
 * GET /reports/employee-12-month/excel
 */
exports.getEmployee12MonthExcel = catchAsync(async (req, res, next) => {
  const empresaId = resolveRelacaoEmpresaId(req);
  const source = req.query;
  const data = await buildEmployee12MonthData({
    empresaId,
    ano: source.ano,
    funcionarioId: source.funcionario_id
  });
  const buffer = await generateEmployee12MonthExcel(data);
  sendRelacaoNominalFile(
    res,
    buffer,
    `employee-12-month-${data.ano}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
});

/**
 * GET /reports/headcount
 */
exports.getHeadcount = catchAsync(async (req, res, next) => {
  const empresaId = resolveRelacaoEmpresaId(req);
  const source = req.query;
  const data = await buildHeadcountReportData({
    empresaId,
    subUnidadeId: source.sub_unidade_id,
    departamentoId: source.departamento_id
  });
  res.status(200).json({ status: 'success', data });
});

/**
 * GET /reports/headcount/excel
 */
exports.getHeadcountExcel = catchAsync(async (req, res, next) => {
  const empresaId = resolveRelacaoEmpresaId(req);
  const source = req.query;
  const data = await buildHeadcountReportData({
    empresaId,
    subUnidadeId: source.sub_unidade_id,
    departamentoId: source.departamento_id
  });
  const buffer = await generateHeadcountExcel(data);
  sendRelacaoNominalFile(
    res,
    buffer,
    `headcount-report-${new Date().toISOString().slice(0, 10)}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
});

