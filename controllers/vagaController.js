const Vaga = require('./../models/vagaModel');
const Candidatura = require('./../models/candidaturaModel');
const PerguntaTriagem = require('./../models/perguntaTriagemModel');
const factory = require('./handlerFactory');
const catchAsync = require('./../utils/catchAsync');
const AppError = require('./../utils/appError');
const tenantController = require('./tenantController');

exports.setEmpresaId = tenantController.setEmpresaId;
exports.filterByEmpresa = tenantController.filterByEmpresa;

exports.getAllVagas = catchAsync(async (req, res) => {
  const query = { empresa_id: req.user.empresa_id };
  if (req.query.status) query.status = req.query.status;
  if (req.query.departamento_id) query.departamento_id = req.query.departamento_id;
  const vagas = await Vaga.find(query)
    .populate('departamento_id', 'nome')
    .populate('cargo_id', 'nome titulo departamento_id')
    .sort('-createdAt');

  res.status(200).json({
    status: 'success',
    results: vagas.length,
    data: { data: vagas },
  });
});

exports.getVaga = catchAsync(async (req, res, next) => {
  const doc = await Vaga.findOne({
    _id: req.params.id,
    empresa_id: req.user.empresa_id,
  })
    .populate('departamento_id', 'nome')
    .populate('cargo_id', 'nome titulo departamento_id');

  if (!doc) return next(new AppError('Vaga não encontrada', 404));

  res.status(200).json({ status: 'success', data: { data: doc } });
});

exports.createVaga = factory.createOne(Vaga);

exports.updateVaga = catchAsync(async (req, res, next) => {
  const doc = await Vaga.findOneAndUpdate(
    { _id: req.params.id, empresa_id: req.user.empresa_id },
    req.body,
    { new: true, runValidators: true },
  );
  if (!doc) return next(new AppError('Vaga não encontrada', 404));
  res.status(200).json({ status: 'success', data: { data: doc } });
});

const STATUS_DELETE_LIVRE = ['Rascunho', 'Rejeitada', 'Cancelada'];
const STATUS_DELETE_CASCADE = [
  'Aberta',
  'Em Andamento',
  'Pausada',
  'Em Aprovação',
  'Fechada',
];

exports.deleteVaga = catchAsync(async (req, res, next) => {
  const vaga = await Vaga.findOne({
    _id: req.params.id,
    empresa_id: req.user.empresa_id,
  });
  if (!vaga) return next(new AppError('Vaga não encontrada', 404));

  if (STATUS_DELETE_LIVRE.includes(vaga.status)) {
    await PerguntaTriagem.deleteMany({ vaga_id: vaga._id });
    await Vaga.deleteOne({ _id: vaga._id });
    return res.status(204).json({ status: 'success', data: null });
  }

  if (STATUS_DELETE_CASCADE.includes(vaga.status)) {
    const count = await Candidatura.countDocuments({ vaga_id: vaga._id });
    if (count > 0 && req.query.force !== 'true') {
      return next(
        new AppError(
          `Vaga tem ${count} candidatura(s). Envie ?force=true para apagar em cascata, ou feche a vaga.`,
          409,
        ),
      );
    }
    await Candidatura.deleteMany({ vaga_id: vaga._id });
    await PerguntaTriagem.deleteMany({ vaga_id: vaga._id });
    await Vaga.deleteOne({ _id: vaga._id });
    return res.status(204).json({ status: 'success', data: null });
  }

  return next(
    new AppError(`Não é possível apagar vaga com status ${vaga.status}`, 409),
  );
});
