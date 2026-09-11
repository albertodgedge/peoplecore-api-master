const Empresa = require('../models/empresaModel');
const FolhaPagamento = require('../models/folhaPagamentoModel');
const ItemFolha = require('../models/itemFolhaModel');
const Funcionario = require('../models/funcionarioModel');
const SubUnidade = require('../models/subUnidadeModel');
const Departamento = require('../models/departamentoModel');
const AppError = require('./appError');
const { RUBRICAS_PADRAO, MESES, MESES_CURTOS, round2, calcularFTE } = require('./rubricasParametros');

/**
 * Constrói os dados detalhados de General Ledger (GL) por Centro de Custo, Conta Razão e Rúbricas
 * conforme o modelo da Dra. Edma (Imagem 3), abrangendo os 12 meses do ano e FTE.
 */
async function buildGeneralLedgerData({ empresaId, ano, mes, subUnidadeId, departamentoId }) {
  if (!empresaId) throw new AppError('empresa_id é obrigatório', 400);

  const targetAno = Number(ano) || new Date().getFullYear();

  const empresa = await Empresa.findById(empresaId).select('nome nome_comercial nif');
  if (!empresa) throw new AppError('Empresa não encontrada', 404);

  // Filtros de funcionários
  const funcFilter = { empresa_id: empresaId };
  if (subUnidadeId) funcFilter.sub_unidade_id = subUnidadeId;
  if (departamentoId) funcFilter.departamento_id = departamentoId;

  const funcionarios = await Funcionario.find(funcFilter)
    .populate('sub_unidade_id', 'nome codigo tipo')
    .populate('departamento_id', 'nome codigo')
    .select('nome codigo_interno sub_unidade_id departamento_id regime_trabalho periodo_trabalho_semanal status')
    .lean();

  const funcMap = new Map();
  funcionarios.forEach(f => {
    funcMap.set(String(f._id), f);
  });

  // Buscar todas as folhas do ano especificado
  const folhaQuery = {
    empresa_id: empresaId,
    ano: targetAno,
    status: { $in: ['Processado', 'Fechado', 'Processando'] }
  };
  if (mes && mes !== 'Todos' && mes !== 'Todos os meses') folhaQuery.mes = mes;

  const folhas = await FolhaPagamento.find(folhaQuery).lean();
  const folhaIds = folhas.map(f => f._id);

  // Mapear mês da folha por ID da folha
  const folhaMesMap = new Map();
  folhas.forEach(f => {
    folhaMesMap.set(String(f._id), f.mes);
  });

  // Buscar todos os itens de folha correspondentes
  const itens = folhaIds.length > 0
    ? await ItemFolha.find({
        folha_id: { $in: folhaIds },
        funcionario_id: { $in: funcionarios.map(f => f._id) }
      }).lean()
    : [];

  // Mapear itens por funcionário e por mês
  // chave: `${funcionarioId}_${mesNome}`
  const itemMap = new Map();
  itens.forEach(it => {
    const mNome = folhaMesMap.get(String(it.folha_id));
    if (mNome && it.funcionario_id) {
      itemMap.set(`${String(it.funcionario_id)}_${mNome}`, it);
    }
  });

  // Agrupar funcionários por Centro de Custos (sub-unidade)
  const ccMap = new Map();

  funcionarios.forEach(f => {
    const ccCodigo = f.sub_unidade_id?.codigo || f.sub_unidade_id?.nome || f.departamento_id?.nome || 'Geral';
    const ccNome = f.sub_unidade_id?.nome || f.departamento_id?.nome || 'Geral';
    
    if (!ccMap.has(ccCodigo)) {
      ccMap.set(ccCodigo, {
        codigo: ccCodigo,
        nome: ccNome,
        funcionarios: []
      });
    }
    ccMap.get(ccCodigo).funcionarios.push(f);
  });

  // Totalizadores gerais de folha
  const totals = {
    total_bruto: 0,
    total_descontos: 0,
    total_liquido: 0,
    irps: 0,
    inss_trabalhador: 0,
    inss_empregador: 0,
    quota_sindical: 0,
    adjustment_deduct: 0
  };

  itens.forEach(it => {
    totals.total_bruto += Number(it.salario_total || 0);
    totals.total_descontos += Number(it.descontos_total || 0);
    totals.total_liquido += Number(it.salario_liquido || 0);
    totals.irps += Number(it.irps || 0);
    totals.inss_trabalhador += Number(it.inss_trabalhador || 0);
    totals.inss_empregador += Number(it.inss_empregador || 0);
    totals.quota_sindical += Number(it.quota_sindical || 0);
    totals.adjustment_deduct += Number(it.adjustment_deduct || 0);
  });

  Object.keys(totals).forEach(k => {
    totals[k] = round2(totals[k]);
  });

  // Construir linhas do relatório GL estruturado conforme Imagem 3
  const centrosDeCusto = [];
  let totalFteEmpresa = 0;

  for (const [, cc] of ccMap.entries()) {
    let ccFteTotal = 0;
    const colaboradoresLinhas = [];

    cc.funcionarios.forEach(func => {
      const fte = calcularFTE(func);
      ccFteTotal += fte;

      // Para cada rúbrica padrão, calcular valores mês a mês
      const rubricasLinhas = [];
      let totalFuncMeses = Array(12).fill(0);

      RUBRICAS_PADRAO.forEach(rb => {
        const valoresMeses = Array(12).fill(0);
        let totalRubricaAno = 0;
        let temValor = false;

        MESES.forEach((mesNome, mIdx) => {
          const it = itemMap.get(`${String(func._id)}_${mesNome}`);
          if (it) {
            const val = round2(rb.extraiValor(it));
            valoresMeses[mIdx] = val;
            totalRubricaAno += val;
            if (val !== 0) temValor = true;

            if (rb.tipo === 'rendimento') {
              totalFuncMeses[mIdx] += val;
            } else if (rb.tipo === 'desconto') {
              totalFuncMeses[mIdx] -= val;
            }
          }
        });

        // Inclui a rúbrica se tiver movimentação no ano
        if (temValor) {
          rubricasLinhas.push({
            codigo_rubrica: rb.codigo,
            descricao: rb.descricao,
            conta_razao: rb.contaRazao,
            tipo: rb.tipo,
            valores_meses: valoresMeses,
            total: round2(totalRubricaAno)
          });
        }
      });

      // Total Funcionário (Líquido)
      const totalFuncAno = round2(totalFuncMeses.reduce((a, b) => a + b, 0));
      totalFuncMeses = totalFuncMeses.map(v => round2(v));

      colaboradoresLinhas.push({
        funcionario_id: String(func._id),
        codigo_interno: func.codigo_interno || '',
        nome: func.nome,
        fte,
        regime_trabalho: func.regime_trabalho || 'Integral',
        rubricas: rubricasLinhas,
        total_funcionario_meses: totalFuncMeses,
        total_funcionario_ano: totalFuncAno
      });
    });

    totalFteEmpresa += ccFteTotal;

    centrosDeCusto.push({
      codigo: cc.codigo,
      nome: cc.nome,
      fte_total: round2(ccFteTotal),
      total_colaboradores: cc.funcionarios.length,
      colaboradores: colaboradoresLinhas
    });
  }

  const mesFormatado = mes && mes !== 'Todos' && mes !== 'Todos os meses' ? mes : null;

  return {
    titulo: mesFormatado ? `Payroll General Ledger - GL (${mesFormatado} ${targetAno})` : 'Payroll General Ledger - GL & Payroll Summary',
    empresa: {
      nome: empresa.nome_comercial || empresa.nome,
      nif: empresa.nif
    },
    periodo: {
      ano: targetAno,
      mes: mesFormatado || 'Todos os meses'
    },
    meses_nomes: MESES,
    meses_curtos: MESES_CURTOS,
    fte_resumo: {
      total_colaboradores: funcionarios.length,
      total_fte: round2(totalFteEmpresa)
    },
    centros_de_custo: centrosDeCusto,
    totals
  };
}

module.exports = {
  buildGeneralLedgerData
};
