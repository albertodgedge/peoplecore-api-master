const Proposta = require('../models/propostaModel');
const Candidatura = require('../models/candidaturaModel');
const Vaga = require('../models/vagaModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { assertCandidaturaEmpresa } = require('../utils/recruitmentTenant');
const { registarTransicao } = require('../utils/recruitmentPipeline');

async function loadPropostaEmpresa(id, empresaId) {
  const proposta = await Proposta.findById(id).populate('candidatura_id');
  if (!proposta) throw new AppError('Proposta não encontrada', 404);
  await assertCandidaturaEmpresa(proposta.candidatura_id, empresaId);
  return proposta;
}

exports.getAllPropostas = catchAsync(async (req, res) => {
  const vagas = await Vaga.find({ empresa_id: req.user.empresa_id }).select('_id');
  const vagaIds = vagas.map((v) => v._id);
  const query = { vaga_id: { $in: vagaIds } };
  if (req.query.status) query.status = req.query.status;

  const docs = await Proposta.find(query)
    .populate({
      path: 'candidatura_id',
      populate: { path: 'candidato_id', select: 'nome email' },
    })
    .sort('-createdAt');

  res.status(200).json({
    status: 'success',
    results: docs.length,
    data: { data: docs },
  });
});

exports.getProposta = catchAsync(async (req, res) => {
  const proposta = await loadPropostaEmpresa(req.params.id, req.user.empresa_id);
  const doc = await Proposta.findById(proposta._id).populate([
    {
      path: 'candidatura_id',
      populate: { path: 'candidato_id vaga_id' },
    },
  ]);
  res.status(200).json({ status: 'success', data: { data: doc } });
});

exports.createProposta = catchAsync(async (req, res, next) => {
  const { candidatura_id, salario_anual_bruto, salario_base_mensal, subsidio_alimentacao, beneficios, justificacao, percentual_compa_ratio } = req.body;

  const candidatura = await Candidatura.findById(candidatura_id);
  if (!candidatura) return next(new AppError('Candidatura não encontrada', 404));
  await assertCandidaturaEmpresa(candidatura, req.user.empresa_id);

  const existente = await Proposta.findOne({ candidatura_id });
  if (existente) return next(new AppError('Já existe proposta para esta candidatura', 400));

  const vaga = await Vaga.findById(candidatura.vaga_id);
  let compa = percentual_compa_ratio;
  if (!compa && vaga.salario_referencia && salario_anual_bruto) {
    compa = Math.round((salario_anual_bruto / vaga.salario_referencia) * 100);
  }

  const proposta = await Proposta.create({
    candidatura_id,
    vaga_id: candidatura.vaga_id,
    salario_anual_bruto,
    salario_base_mensal,
    subsidio_alimentacao,
    beneficios,
    justificacao,
    percentual_compa_ratio: compa,
    criado_por: req.user.id,
    status: 'rascunho',
  });

  res.status(201).json({ status: 'success', data: { data: proposta } });
});

exports.pedirAprovacao = catchAsync(async (req, res, next) => {
  const proposta = await loadPropostaEmpresa(req.params.id, req.user.empresa_id);
  proposta.status = 'em_aprovacao';
  if (req.body.aprovadores?.length) {
    proposta.aprovadores = req.body.aprovadores.map((usuario_id) => ({
      usuario_id,
      status: 'pendente',
    }));
  }
  await proposta.save({ validateBeforeSave: false });
  res.status(200).json({ status: 'success', data: { data: proposta } });
});

exports.aprovar = catchAsync(async (req, res, next) => {
  const proposta = await loadPropostaEmpresa(req.params.id, req.user.empresa_id);
  const idx = proposta.aprovadores.findIndex(
    (a) => String(a.usuario_id) === String(req.user.id),
  );
  if (idx >= 0) {
    proposta.aprovadores[idx].status = 'aprovado';
    proposta.aprovadores[idx].data = new Date();
  }
  const todosOk =
    !proposta.aprovadores.length ||
    proposta.aprovadores.every((a) => a.status === 'aprovado');
  if (todosOk) proposta.status = 'aprovada';
  await proposta.save({ validateBeforeSave: false });
  res.status(200).json({ status: 'success', data: { data: proposta } });
});

exports.enviar = catchAsync(async (req, res, next) => {
  const proposta = await loadPropostaEmpresa(req.params.id, req.user.empresa_id);
  if (!['aprovada', 'rascunho'].includes(proposta.status)) {
    return next(new AppError('Proposta deve estar aprovada para envio', 400));
  }
  proposta.status = 'enviada';
  proposta.data_envio = new Date();
  if (req.body.carta_oferta_url) proposta.carta_oferta_url = req.body.carta_oferta_url;
  await proposta.save({ validateBeforeSave: false });

  const candidatura = await Candidatura.findById(proposta.candidatura_id);
  if (candidatura.status === 'ref_check' || candidatura.status === 'proposta') {
    await registarTransicao({
      candidatura,
      de: candidatura.status,
      para: 'proposta',
      usuarioId: req.user.id,
      empresaId: req.user.empresa_id,
      motivo: 'Proposta enviada',
      req,
    });
    await candidatura.save();
  }

  res.status(200).json({ status: 'success', data: { data: proposta } });
});

exports.responder = catchAsync(async (req, res, next) => {
  const { aceite, motivo } = req.body;
  const proposta = await loadPropostaEmpresa(req.params.id, req.user.empresa_id);

  if (proposta.status !== 'enviada') {
    return next(new AppError('Proposta não está no estado enviada', 400));
  }

  const candidatura = await Candidatura.findById(proposta.candidatura_id);
  proposta.data_resposta = new Date();

  if (aceite === true || aceite === 'true') {
    proposta.status = 'aceite';
    // Fluxo: proposta → aceite → contratado → onboarding (sem salto automático)
    await registarTransicao({
      candidatura,
      de: candidatura.status,
      para: 'aceite',
      usuarioId: req.user.id,
      empresaId: req.user.empresa_id,
      motivo: 'Candidato aceitou proposta',
      req,
    });
  } else {
    proposta.status = 'rejeitada';
    await registarTransicao({
      candidatura,
      de: candidatura.status,
      para: 'rejeitado',
      usuarioId: req.user.id,
      empresaId: req.user.empresa_id,
      motivo: motivo || 'Proposta rejeitada pelo candidato',
      req,
    });
    candidatura.motivo_rejeicao = motivo;
    candidatura.estagio_feedback = 'III';
  }

  await proposta.save({ validateBeforeSave: false });
  await candidatura.save();

  res.status(200).json({ status: 'success', data: { data: proposta } });
});

exports.updateProposta = catchAsync(async (req, res, next) => {
  const proposta = await loadPropostaEmpresa(req.params.id, req.user.empresa_id);
  const campos = [
    'salario_anual_bruto',
    'salario_base_mensal',
    'subsidio_alimentacao',
    'beneficios',
    'justificacao',
    'percentual_compa_ratio',
    'carta_oferta_url',
  ];
  campos.forEach((c) => {
    if (req.body[c] !== undefined) proposta[c] = req.body[c];
  });
  await proposta.save();
  res.status(200).json({ status: 'success', data: { data: proposta } });
});

exports.deleteProposta = catchAsync(async (req, res, next) => {
  const proposta = await loadPropostaEmpresa(req.params.id, req.user.empresa_id);
  await Proposta.findByIdAndDelete(proposta._id);
  res.status(204).json({ status: 'success', data: null });
});
