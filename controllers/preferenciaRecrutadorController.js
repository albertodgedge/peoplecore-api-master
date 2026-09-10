const PreferenciaRecrutador = require('../models/preferenciaRecrutadorModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

exports.getAll = catchAsync(async (req, res) => {
  const docs = await PreferenciaRecrutador.find({
    empresa_id: req.user.empresa_id,
    utilizador_id: req.user.id,
  }).sort('-createdAt');

  res.status(200).json({
    status: 'success',
    results: docs.length,
    data: { data: docs },
  });
});

exports.create = catchAsync(async (req, res) => {
  const doc = await PreferenciaRecrutador.create({
    nome_pergunta: req.body.nome_pergunta,
    formato_resposta: req.body.formato_resposta,
    intervalo_resposta: req.body.intervalo_resposta,
    opcoes: req.body.opcoes,
    utilizador_id: req.user.id,
    empresa_id: req.user.empresa_id,
  });

  res.status(201).json({ status: 'success', data: { data: doc } });
});

exports.update = catchAsync(async (req, res, next) => {
  const allowed = [
    'nome_pergunta',
    'formato_resposta',
    'intervalo_resposta',
    'opcoes',
  ];
  const patch = {};
  allowed.forEach((k) => {
    if (req.body[k] !== undefined) patch[k] = req.body[k];
  });

  const doc = await PreferenciaRecrutador.findOneAndUpdate(
    {
      _id: req.params.id,
      empresa_id: req.user.empresa_id,
      utilizador_id: req.user.id,
    },
    patch,
    { new: true, runValidators: true },
  );

  if (!doc) return next(new AppError('Preferência não encontrada', 404));

  res.status(200).json({ status: 'success', data: { data: doc } });
});

exports.remove = catchAsync(async (req, res, next) => {
  const doc = await PreferenciaRecrutador.findOneAndDelete({
    _id: req.params.id,
    empresa_id: req.user.empresa_id,
    utilizador_id: req.user.id,
  });

  if (!doc) return next(new AppError('Preferência não encontrada', 404));

  res.status(204).json({ status: 'success', data: null });
});
