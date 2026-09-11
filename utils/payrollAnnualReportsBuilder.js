/**
 * utils/payrollAnnualReportsBuilder.js
 * Construtores de relatórios anuais e YTD solicitados pela Dra. Edma:
 * - Net Pay Report (YTD mês a mês)
 * - IRPS Report (YTD mês a mês retido)
 * - Total Cost to Company (TCTC) (incluindo fringe benefits e 4% INSS empresa)
 * - Employee 12-Month Report (ficha anual de 12 meses por colaborador)
 * - Year to Date Payroll Report (resumo consolidado do payroll)
 */

const Empresa = require('../models/empresaModel');
const FolhaPagamento = require('../models/folhaPagamentoModel');
const ItemFolha = require('../models/itemFolhaModel');
const Funcionario = require('../models/funcionarioModel');
const AppError = require('./appError');
const { MESES, MESES_CURTOS, round2, calcularFTE } = require('./rubricasParametros');

async function getEmpresaEColaboradores(empresaId, filtro = {}) {
  const empresa = await Empresa.findById(empresaId).select('nome nome_comercial nif');
  if (!empresa) throw new AppError('Empresa não encontrada', 404);

  const query = { empresa_id: empresaId };
  if (filtro.subUnidadeId) query.sub_unidade_id = filtro.subUnidadeId;
  if (filtro.departamentoId) query.departamento_id = filtro.departamentoId;
  if (filtro.funcionarioId) query._id = filtro.funcionarioId;

  const funcionarios = await Funcionario.find(query)
    .populate('departamento_id', 'nome codigo')
    .populate('sub_unidade_id', 'nome codigo')
    .populate('cargo_id', 'titulo nome')
    .select('nome codigo_interno nuit inss departamento_id sub_unidade_id cargo_id regime_trabalho periodo_trabalho_semanal status')
    .sort({ nome: 1 })
    .lean();

  return { empresa, funcionarios };
}

async function getItensMapPorAno(empresaId, ano, mes) {
  const targetAno = Number(ano) || new Date().getFullYear();

  const query = {
    empresa_id: empresaId,
    ano: targetAno,
    status: { $in: ['Processado', 'Fechado', 'Processando'] }
  };
  if (mes && mes !== 'Todos' && mes !== 'Todos os meses') {
    query.mes = mes;
  }

  const folhas = await FolhaPagamento.find(query).lean();

  const folhaIds = folhas.map(f => f._id);
  const folhaMesMap = new Map();
  folhas.forEach(f => {
    folhaMesMap.set(String(f._id), f.mes);
  });

  const itens = folhaIds.length > 0
    ? await ItemFolha.find({ folha_id: { $in: folhaIds } }).lean()
    : [];

  // Mapear por `${funcionarioId}_${mesNome}`
  const map = new Map();
  itens.forEach(it => {
    const mesNome = folhaMesMap.get(String(it.folha_id));
    if (mesNome && it.funcionario_id) {
      map.set(`${String(it.funcionario_id)}_${mesNome}`, it);
    }
  });

  return { targetAno, map };
}

/**
 * 1. Net Pay Report (YTD, mês a mês salário líquido pago)
 */
async function buildNetPayReportData({ empresaId, ano, mes, subUnidadeId, departamentoId }) {
  const { empresa, funcionarios } = await getEmpresaEColaboradores(empresaId, { subUnidadeId, departamentoId });
  const { targetAno, map } = await getItensMapPorAno(empresaId, ano, mes);

  const linhas = [];
  const totaisMensais = Array(12).fill(0);
  let totalGeralYtd = 0;

  funcionarios.forEach(func => {
    const mesesValores = Array(12).fill(0);
    let ytdFunc = 0;

    MESES.forEach((mesNome, idx) => {
      const it = map.get(`${String(func._id)}_${mesNome}`);
      if (it) {
        const liq = round2(it.salario_liquido || 0);
        mesesValores[idx] = liq;
        ytdFunc += liq;
        totaisMensais[idx] += liq;
      }
    });

    ytdFunc = round2(ytdFunc);
    totalGeralYtd += ytdFunc;

    linhas.push({
      funcionario_id: String(func._id),
      codigo_interno: func.codigo_interno || '—',
      nome: func.nome,
      departamento: func.departamento_id?.nome || '—',
      centro_custo: func.sub_unidade_id?.codigo || func.sub_unidade_id?.nome || '—',
      meses: mesesValores,
      ytd: ytdFunc
    });
  });

  return {
    titulo: 'Net Pay Report (Salário Líquido Pago YTD)',
    empresa: { nome: empresa.nome_comercial || empresa.nome, nif: empresa.nif },
    ano: targetAno,
    meses_nomes: MESES,
    meses_curtos: MESES_CURTOS,
    linhas,
    totais_mensais: totaisMensais.map(v => round2(v)),
    total_geral_ytd: round2(totalGeralYtd)
  };
}

/**
 * 2. IRPS Report (Imposto retido a nível do payroll - IRPS YTD, mês a mês)
 */
async function buildIrpsReportData({ empresaId, ano, mes, subUnidadeId, departamentoId }) {
  const { empresa, funcionarios } = await getEmpresaEColaboradores(empresaId, { subUnidadeId, departamentoId });
  const { targetAno, map } = await getItensMapPorAno(empresaId, ano, mes);

  const linhas = [];
  const totaisMensais = Array(12).fill(0);
  let totalGeralYtd = 0;

  funcionarios.forEach(func => {
    const mesesValores = Array(12).fill(0);
    let ytdFunc = 0;

    MESES.forEach((mesNome, idx) => {
      const it = map.get(`${String(func._id)}_${mesNome}`);
      if (it) {
        const retencao = round2(it.irps || 0);
        mesesValores[idx] = retencao;
        ytdFunc += retencao;
        totaisMensais[idx] += retencao;
      }
    });

    ytdFunc = round2(ytdFunc);
    totalGeralYtd += ytdFunc;

    linhas.push({
      funcionario_id: String(func._id),
      codigo_interno: func.codigo_interno || '—',
      nome: func.nome,
      nuit: func.nuit || '—',
      departamento: func.departamento_id?.nome || '—',
      meses: mesesValores,
      ytd: ytdFunc
    });
  });

  return {
    titulo: 'IRPS Report (Retenções na Fonte de IRPS YTD)',
    empresa: { nome: empresa.nome_comercial || empresa.nome, nif: empresa.nif },
    ano: targetAno,
    mes: (mes && mes !== 'Todos' && mes !== 'Todos os meses') ? mes : 'Todos os meses',
    meses_nomes: MESES,
    meses_curtos: MESES_CURTOS,
    linhas,
    totais_mensais: totaisMensais.map(v => round2(v)),
    total_geral_ytd: round2(totalGeralYtd)
  };
}

/**
 * 3. Total Cost to Company Report (Custo do colaborador incluindo fringe benefits e encargos patronais)
 */
async function buildTotalCostToCompanyData({ empresaId, ano, mes, subUnidadeId, departamentoId }) {
  const { empresa, funcionarios } = await getEmpresaEColaboradores(empresaId, { subUnidadeId, departamentoId });
  const { targetAno, map } = await getItensMapPorAno(empresaId, ano, mes);

  const linhas = [];
  let totalBrutoAno = 0;
  let totalInssPatronalAno = 0;
  let totalFringeAno = 0;
  let totalCustoEmpresaAno = 0;

  funcionarios.forEach(func => {
    let funcBruto = 0;
    let funcInssPatronal = 0;
    let funcFringe = 0;
    const mesesTctc = Array(12).fill(0);

    MESES.forEach((mesNome, idx) => {
      const it = map.get(`${String(func._id)}_${mesNome}`);
      if (it) {
        const bruto = round2(it.salario_total || 0);
        const inssEmp = round2(it.inss_empregador || 0);
        // Fringe benefits: viatura/combustível, telefone, subsídios de alimentação em espécie
        const fringe = round2(
          Number(it.allowance_combustivel || 0) +
          Number(it.allowance_telefone || 0) +
          Number(it.beneficio_alimentacao_valor || 0)
        );
        const totalMes = round2(bruto + inssEmp + fringe);

        funcBruto += bruto;
        funcInssPatronal += inssEmp;
        funcFringe += fringe;
        mesesTctc[idx] = totalMes;
      }
    });

    const totalFuncTctc = round2(funcBruto + funcInssPatronal + funcFringe);
    totalBrutoAno += funcBruto;
    totalInssPatronalAno += funcInssPatronal;
    totalFringeAno += funcFringe;
    totalCustoEmpresaAno += totalFuncTctc;

    linhas.push({
      funcionario_id: String(func._id),
      codigo_interno: func.codigo_interno || '—',
      nome: func.nome,
      cargo: func.cargo_id?.titulo || '—',
      departamento: func.departamento_id?.nome || '—',
      salario_bruto_anual: round2(funcBruto),
      inss_patronal_anual: round2(funcInssPatronal),
      fringe_benefits_anual: round2(funcFringe),
      total_cost_to_company: totalFuncTctc,
      meses: mesesTctc
    });
  });

  const mesFormatado = mes && mes !== 'Todos' && mes !== 'Todos os meses' ? mes : null;

  return {
    titulo: mesFormatado
      ? `Total Cost to Company Report (TCTC - ${mesFormatado} ${targetAno})`
      : 'Total Cost to Company Report (TCTC - Incluindo Fringe Benefits e Encargos)',
    empresa: { nome: empresa.nome_comercial || empresa.nome, nif: empresa.nif },
    ano: targetAno,
    mes: mesFormatado || 'Todos os meses',
    meses_nomes: MESES,
    meses_curtos: MESES_CURTOS,
    linhas,
    totais_gerais: {
      salario_bruto: round2(totalBrutoAno),
      inss_patronal: round2(totalInssPatronalAno),
      fringe_benefits: round2(totalFringeAno),
      total_cost_to_company: round2(totalCustoEmpresaAno)
    }
  };
}

/**
 * 4. Employee 12 Month Report (Ficha Anual de 12 Meses por Colaborador)
 */
async function buildEmployee12MonthData({ empresaId, ano, funcionarioId }) {
  const { empresa, funcionarios } = await getEmpresaEColaboradores(empresaId, { funcionarioId });
  const { targetAno, map } = await getItensMapPorAno(empresaId, ano);

  const fichas = funcionarios.map(func => {
    const colunasMeses = MESES.map((mesNome) => {
      const it = map.get(`${String(func._id)}_${mesNome}`);
      return {
        mes: mesNome,
        salario_base: round2(it?.salario_base || 0),
        horas_extras: round2(it?.horas_extras_valor || 0),
        bonus: round2(it?.bonus_total || it?.allowance_bonus || 0),
        subsidios: round2(Number(it?.beneficio_alimentacao_valor || it?.subsidio_alimentacao_valor || 0) + Number(it?.beneficio_transporte_valor || it?.subsidio_transporte_valor || 0)),
        ferias: round2(it?.ferias_pagamento_valor || 0),
        salario_bruto: round2(it?.salario_total || 0),
        inss_trabalhador: round2(it?.inss_trabalhador || 0),
        irps: round2(it?.irps || 0),
        outros_descontos: round2(Number(it?.quota_sindical || 0) + Number(it?.adjustment_deduct || 0)),
        total_descontos: round2(it?.descontos_total || 0),
        salario_liquido: round2(it?.salario_liquido || 0)
      };
    });

    const totaisAnuais = {
      salario_base: round2(colunasMeses.reduce((s, m) => s + m.salario_base, 0)),
      horas_extras: round2(colunasMeses.reduce((s, m) => s + m.horas_extras, 0)),
      bonus: round2(colunasMeses.reduce((s, m) => s + m.bonus, 0)),
      subsidios: round2(colunasMeses.reduce((s, m) => s + m.subsidios, 0)),
      ferias: round2(colunasMeses.reduce((s, m) => s + m.ferias, 0)),
      salario_bruto: round2(colunasMeses.reduce((s, m) => s + m.salario_bruto, 0)),
      inss_trabalhador: round2(colunasMeses.reduce((s, m) => s + m.inss_trabalhador, 0)),
      irps: round2(colunasMeses.reduce((s, m) => s + m.irps, 0)),
      outros_descontos: round2(colunasMeses.reduce((s, m) => s + m.outros_descontos, 0)),
      total_descontos: round2(colunasMeses.reduce((s, m) => s + m.total_descontos, 0)),
      salario_liquido: round2(colunasMeses.reduce((s, m) => s + m.salario_liquido, 0))
    };

    return {
      funcionario: {
        id: String(func._id),
        codigo: func.codigo_interno || '—',
        nome: func.nome,
        nuit: func.nuit || '—',
        inss: func.inss || '—',
        cargo: func.cargo_id?.titulo || '—',
        departamento: func.departamento_id?.nome || '—'
      },
      meses: colunasMeses,
      totais: totaisAnuais
    };
  });

  return {
    titulo: 'Employee 12 Month Report (Ficha Anual de 12 Meses de Payroll)',
    empresa: { nome: empresa.nome_comercial || empresa.nome, nif: empresa.nif },
    ano: targetAno,
    fichas
  };
}

module.exports = {
  buildNetPayReportData,
  buildIrpsReportData,
  buildTotalCostToCompanyData,
  buildEmployee12MonthData
};
