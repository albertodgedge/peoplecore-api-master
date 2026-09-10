const Candidatura = require('../models/candidaturaModel');
const Candidato = require('../models/candidatoModel');
const Vaga = require('../models/vagaModel');
const Entrevista = require('../models/entrevistaModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const {
  podeTransicionar,
  proximoEstadoAposEntrevista,
  estagioFeedbackParaStatus,
  registarTransicao,
  STATUS_PARA_FASE,
} = require('../utils/recruitmentPipeline');
const { CANDIDATURA_STATUS } = require('../utils/recruitmentConstants');
const {
  getVagaIdsEmpresa,
  assertCandidaturaEmpresa,
} = require('../utils/recruitmentTenant');
const {
  analisarCandidatura,
  gerarBriefing,
  gerarFeedbackRascunho,
} = require('../utils/recruitmentAiService');

const populateDetalhe = [
  { path: 'candidato_id' },
  {
    path: 'vaga_id',
    select: 'cargo departamento_id tipo_contrato competencias requisitos',
    populate: { path: 'departamento_id', select: 'nome' },
  },
];

async function loadCandidaturaEmpresa(id, empresaId) {
  const candidatura = await Candidatura.findById(id);
  if (!candidatura) throw new AppError('Candidatura não encontrada', 404);
  const vaga = await assertCandidaturaEmpresa(candidatura, empresaId);
  return { candidatura, vaga };
}

exports.getAllCandidaturas = catchAsync(async (req, res) => {
  const vagaIds = await getVagaIdsEmpresa(req.user.empresa_id);
  const query = { vaga_id: { $in: vagaIds } };
  if (req.query.status) query.status = req.query.status;
  if (req.query.vaga_id) query.vaga_id = req.query.vaga_id;

  const docs = await Candidatura.find(query)
    .populate(populateDetalhe)
    .sort('-data_candidatura');

  res.status(200).json({
    status: 'success',
    results: docs.length,
    data: { data: docs },
  });
});

exports.getCandidatura = catchAsync(async (req, res) => {
  const { candidatura } = await loadCandidaturaEmpresa(
    req.params.id,
    req.user.empresa_id,
  );

  const doc = await Candidatura.findById(candidatura._id).populate([
    ...populateDetalhe,
    {
      path: 'vaga_id',
      populate: { path: 'departamento_id', select: 'nome' },
    },
  ]);

  const entrevistas = await Entrevista.find({
    candidatura_id: candidatura._id,
  })
    .populate('entrevistador_id', 'nome email')
    .sort('data');

  res.status(200).json({
    status: 'success',
    data: { data: doc, entrevistas },
  });
});

exports.alterarEstado = catchAsync(async (req, res, next) => {
  const { status, motivo } = req.body;
  if (!status || !CANDIDATURA_STATUS.includes(status)) {
    return next(
      new AppError(`Status inválido. Use: ${CANDIDATURA_STATUS.join(', ')}`, 400),
    );
  }

  const { candidatura, vaga } = await loadCandidaturaEmpresa(
    req.params.id,
    req.user.empresa_id,
  );

  if (!podeTransicionar(candidatura.status, status)) {
    return next(
      new AppError(
        `Transição inválida: ${candidatura.status} → ${status}`,
        400,
      ),
    );
  }

  const de = candidatura.status;
  await registarTransicao({
    candidatura,
    de,
    para: status,
    usuarioId: req.user.id,
    empresaId: req.user.empresa_id,
    motivo,
    req,
  });

  if (motivo && ['rejeitado', 'desqualificado'].includes(status)) {
    candidatura.motivo_rejeicao = motivo;
    candidatura.estagio_feedback = estagioFeedbackParaStatus(de);
  }

  await candidatura.save();

  res.status(200).json({
    status: 'success',
    data: { data: candidatura, vaga: { id: vaga._id, cargo: vaga.cargo } },
  });
});

exports.avancar = catchAsync(async (req, res, next) => {
  const { candidatura, vaga } = await loadCandidaturaEmpresa(
    req.params.id,
    req.user.empresa_id,
  );

  const fase = STATUS_PARA_FASE[candidatura.status];
  if (!fase) {
    return next(
      new AppError('Estado actual não permite avanço automático por entrevista', 400),
    );
  }

  const entrevista = await Entrevista.findOne({
    candidatura_id: candidatura._id,
    fase,
    status: 'Realizada',
    recomendacao: 'sim',
  }).sort('-updatedAt');

  if (!entrevista) {
    return next(
      new AppError(
        'Não existe entrevista realizada com recomendação positiva nesta fase',
        400,
      ),
    );
  }

  const requerExcom = Boolean(vaga.requer_excom || candidatura.requer_excom);
  const proximo = proximoEstadoAposEntrevista(candidatura.status, requerExcom);
  if (!proximo) {
    return next(new AppError('Não há próximo estado definido', 400));
  }

  const de = candidatura.status;
  await registarTransicao({
    candidatura,
    de,
    para: proximo,
    usuarioId: req.user.id,
    empresaId: req.user.empresa_id,
    motivo: 'Avanço após entrevista positiva',
    req,
  });
  await candidatura.save();

  res.status(200).json({ status: 'success', data: { data: candidatura } });
});

exports.desqualificar = catchAsync(async (req, res, next) => {
  const { motivo, estagio } = req.body;
  if (!motivo) {
    return next(new AppError('Motivo obrigatório para desqualificação', 400));
  }

  const { candidatura } = await loadCandidaturaEmpresa(
    req.params.id,
    req.user.empresa_id,
  );

  const de = candidatura.status;
  const para =
    de === 'novo' || de === 'triagem' ? 'desqualificado' : 'rejeitado';

  await registarTransicao({
    candidatura,
    de,
    para,
    usuarioId: req.user.id,
    empresaId: req.user.empresa_id,
    motivo,
    req,
  });

  candidatura.motivo_rejeicao = motivo;
  candidatura.estagio_feedback =
    estagio || estagioFeedbackParaStatus(de);
  await candidatura.save();

  res.status(200).json({ status: 'success', data: { data: candidatura } });
});

exports.analisar = catchAsync(async (req, res) => {
  const { candidatura, vaga } = await loadCandidaturaEmpresa(
    req.params.id,
    req.user.empresa_id,
  );
  const candidato = await Candidato.findById(candidatura.candidato_id);

  const analise = await analisarCandidatura({ candidato, vaga, candidatura });
  candidatura.pontuacao_ia = analise.pontuacao_sugerida;
  candidatura.analise_ia = analise;
  await candidatura.save({ validateBeforeSave: false });

  res.status(200).json({
    status: 'success',
    data: { analise, candidatura_id: candidatura._id },
  });
});

exports.briefing = catchAsync(async (req, res) => {
  const { candidatura, vaga } = await loadCandidaturaEmpresa(
    req.params.id,
    req.user.empresa_id,
  );
  const candidato = await Candidato.findById(candidatura.candidato_id);
  const entrevistas = await Entrevista.find({
    candidatura_id: candidatura._id,
  });

  const briefing = await gerarBriefing({
    candidato,
    vaga,
    candidatura,
    entrevistas,
  });

  res.status(200).json({ status: 'success', data: { briefing } });
});

exports.gerarFeedback = catchAsync(async (req, res) => {
  const { motivo, estagio } = req.body;
  const { candidatura, vaga } = await loadCandidaturaEmpresa(
    req.params.id,
    req.user.empresa_id,
  );
  const candidato = await Candidato.findById(candidatura.candidato_id);

  const feedback = await gerarFeedbackRascunho({
    candidato,
    vaga,
    estagio: estagio || candidatura.estagio_feedback || 'I',
    motivo: motivo || candidatura.motivo_rejeicao,
  });

  res.status(200).json({ status: 'success', data: feedback });
});

exports.getEstatisticas = catchAsync(async (req, res) => {
  const vagaIds = await getVagaIdsEmpresa(req.user.empresa_id);

  const porStatus = await Candidatura.aggregate([
    { $match: { vaga_id: { $in: vagaIds } } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  const slaVencido = await Candidatura.countDocuments({
    vaga_id: { $in: vagaIds },
    sla_feedback_ate: { $lt: new Date() },
    status: { $nin: ['contratado', 'rejeitado', 'desqualificado'] },
  });

  res.status(200).json({
    status: 'success',
    data: { porStatus, slaVencido },
  });
});
