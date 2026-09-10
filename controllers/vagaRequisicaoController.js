const Vaga = require('../models/vagaModel');
const PerguntaTriagem = require('../models/perguntaTriagemModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { assertVagaEmpresa } = require('../utils/recruitmentTenant');
const { gerarDescricaoVaga } = require('../utils/recruitmentAiService');
const LogSistema = require('../models/logSistemaModel');
const {
  faltamAprovadores,
  nivelPendenteActual,
  todosNiveisAprovados,
  encontrarAprovador,
  papeisExigidos,
} = require('../utils/vagaAprovacao');

exports.submeterAprovacao = catchAsync(async (req, res, next) => {
  const vaga = await assertVagaEmpresa(req.params.id, req.user.empresa_id);

  if (!['Rascunho', 'Rejeitada'].includes(vaga.status)) {
    return next(
      new AppError(
        'Apenas vagas em Rascunho ou Rejeitada podem ser submetidas',
        400,
      ),
    );
  }

  const faltam = faltamAprovadores(vaga);
  if (faltam.length) {
    return next(
      new AppError(
        `Faltam aprovadores exigidos (${vaga.niveis_aprovacao || 3} níveis): ${faltam.join(', ')}. Exigidos: ${papeisExigidos(vaga.niveis_aprovacao).join(', ')}`,
        400,
      ),
    );
  }

  vaga.status = 'Em Aprovação';
  if (vaga.aprovadores?.length) {
    vaga.aprovadores = vaga.aprovadores.map((a) => ({
      ...(a.toObject?.() || a),
      status: 'pendente',
      data: undefined,
      comentario: undefined,
    }));
  }
  await vaga.save({ validateBeforeSave: false });

  res.status(200).json({ status: 'success', data: { data: vaga } });
});

exports.aprovar = catchAsync(async (req, res, next) => {
  const { comentario, papel, ordem } = req.body;
  const vaga = await assertVagaEmpresa(req.params.id, req.user.empresa_id);

  if (vaga.status !== 'Em Aprovação') {
    return next(new AppError('Vaga não está em aprovação', 400));
  }

  const pendente = nivelPendenteActual(vaga);
  if (!pendente) {
    return next(new AppError('Não há níveis pendentes de aprovação', 400));
  }

  const isAdmin =
    req.user.role === 'super-admin' || req.user.role === 'admin';
  const isCurrentUser =
    String(pendente.usuario_id) === String(req.user.id);
  const matchesRequested =
    (!papel || papel === pendente.papel) &&
    (ordem == null || Number(ordem) === Number(pendente.ordem));

  if (!isCurrentUser && !isAdmin) {
    return next(
      new AppError(
        `Apenas o aprovador do nível actual (${pendente.papel}, ordem ${pendente.ordem}) pode aprovar`,
        403,
      ),
    );
  }

  if ((papel || ordem != null) && !matchesRequested && !isAdmin) {
    return next(
      new AppError(
        `Nível incorrecto. Pendente: ${pendente.papel} (ordem ${pendente.ordem})`,
        400,
      ),
    );
  }

  const idx = encontrarAprovador(vaga, {
    usuarioId: pendente.usuario_id,
    papel: pendente.papel,
    ordem: pendente.ordem,
  });

  if (idx < 0) {
    return next(new AppError('Aprovador não encontrado na requisição', 404));
  }

  vaga.aprovadores[idx].status = 'aprovado';
  vaga.aprovadores[idx].data = new Date();
  vaga.aprovadores[idx].comentario = comentario;

  if (todosNiveisAprovados(vaga)) {
    vaga.status = 'Aberta';
    if (!vaga.data_abertura) vaga.data_abertura = new Date();
  }

  await vaga.save();

  res.status(200).json({ status: 'success', data: { data: vaga } });
});

exports.rejeitar = catchAsync(async (req, res, next) => {
  const { comentario, papel, ordem } = req.body;
  const vaga = await assertVagaEmpresa(req.params.id, req.user.empresa_id);

  if (vaga.status !== 'Em Aprovação') {
    return next(new AppError('Vaga não está em aprovação', 400));
  }

  const idx = encontrarAprovador(vaga, {
    usuarioId: req.user.id,
    papel,
    ordem,
  });

  if (idx >= 0) {
    vaga.aprovadores[idx].status = 'rejeitado';
    vaga.aprovadores[idx].data = new Date();
    vaga.aprovadores[idx].comentario = comentario;
  } else if (req.user.role !== 'super-admin' && req.user.role !== 'admin') {
    return next(new AppError('Não é aprovador desta requisição', 403));
  }

  vaga.status = 'Rejeitada';
  await vaga.save({ validateBeforeSave: false });

  res.status(200).json({ status: 'success', data: { data: vaga } });
});

exports.publicar = catchAsync(async (req, res, next) => {
  const vaga = await assertVagaEmpresa(req.params.id, req.user.empresa_id);

  if (!['Aberta', 'Pausada'].includes(vaga.status)) {
    return next(new AppError('Vaga deve estar aberta para publicar', 400));
  }

  const { interna, externa, data_fecho_previsto } = req.body;
  if (interna) vaga.data_publicacao_interna = new Date(interna);
  if (externa) vaga.data_publicacao_externa = new Date(externa);
  if (!vaga.data_publicacao_externa) {
    vaga.data_publicacao_externa = new Date();
  }
  if (data_fecho_previsto) vaga.data_fecho_previsto = new Date(data_fecho_previsto);
  vaga.status = 'Aberta';

  await vaga.save();

  res.status(200).json({ status: 'success', data: { data: vaga } });
});

exports.removerPublicacao = catchAsync(async (req, res, next) => {
  const vaga = await assertVagaEmpresa(req.params.id, req.user.empresa_id);

  vaga.data_publicacao_externa = null;
  vaga.data_publicacao_interna = null;
  vaga.status = 'Pausada';
  await vaga.save({ validateBeforeSave: false });

  res.status(200).json({
    status: 'success',
    message: 'Publicação removida',
    data: { data: vaga },
  });
});

exports.linkPublico = catchAsync(async (req, res, next) => {
  const vaga = await assertVagaEmpresa(req.params.id, req.user.empresa_id);

  if (!vaga.form_token) {
    return next(
      new AppError('Vaga sem token público. Aprove e publique primeiro.', 400),
    );
  }

  const base =
    process.env.CLIENT_URL ||
    process.env.SERVER_URL ||
    `${req.protocol}://${req.get('host')}`;

  res.status(200).json({
    status: 'success',
    data: {
      slug: vaga.slug,
      form_token: vaga.form_token,
      url: `${base}/vaga/${vaga.slug}-${vaga.form_token}`,
      api_url: `/api/v1/publico/vagas/${vaga.slug}-${vaga.form_token}`,
    },
  });
});

exports.gerarDescricao = catchAsync(async (req, res, next) => {
  const vaga = await assertVagaEmpresa(req.params.id, req.user.empresa_id);
  const { bullet_points, idiomas } = req.body;

  if (!bullet_points) {
    return next(new AppError('bullet_points é obrigatório', 400));
  }

  const gerado = await gerarDescricaoVaga({
    cargo: vaga.cargo,
    bulletPoints: bullet_points,
    idiomas,
  });

  if (gerado.descricao_interna) vaga.descricao_interna = gerado.descricao_interna;
  if (gerado.descricao_externa) vaga.descricao_externa = gerado.descricao_externa;
  if (gerado.descricao_traducoes) {
    vaga.descricao_traducoes = gerado.descricao_traducoes;
  }
  await vaga.save({ validateBeforeSave: false });

  await LogSistema.create({
    usuario_id: req.user.id,
    empresa_id: req.user.empresa_id,
    acao: 'Descrição de vaga gerada',
    modulo: 'Recrutamento',
    detalhes: { vaga_id: vaga._id, provider: gerado.provider },
    ip: req.ip,
  });

  res.status(200).json({
    status: 'success',
    data: { data: vaga, provider: gerado.provider },
  });
});

exports.listarPerguntas = catchAsync(async (req, res) => {
  await assertVagaEmpresa(req.params.vagaId, req.user.empresa_id);
  const perguntas = await PerguntaTriagem.find({
    vaga_id: req.params.vagaId,
  }).sort('ordem');

  res.status(200).json({
    status: 'success',
    results: perguntas.length,
    data: { data: perguntas },
  });
});

exports.criarPergunta = catchAsync(async (req, res) => {
  await assertVagaEmpresa(req.params.vagaId, req.user.empresa_id);

  const pergunta = await PerguntaTriagem.create({
    ...req.body,
    vaga_id: req.params.vagaId,
  });

  res.status(201).json({ status: 'success', data: { data: pergunta } });
});

exports.atualizarPergunta = catchAsync(async (req, res, next) => {
  await assertVagaEmpresa(req.params.vagaId, req.user.empresa_id);

  const pergunta = await PerguntaTriagem.findOneAndUpdate(
    { _id: req.params.perguntaId, vaga_id: req.params.vagaId },
    req.body,
    { new: true, runValidators: true },
  );

  if (!pergunta) return next(new AppError('Pergunta não encontrada', 404));

  res.status(200).json({ status: 'success', data: { data: pergunta } });
});

exports.removerPergunta = catchAsync(async (req, res, next) => {
  await assertVagaEmpresa(req.params.vagaId, req.user.empresa_id);

  const pergunta = await PerguntaTriagem.findOneAndDelete({
    _id: req.params.perguntaId,
    vaga_id: req.params.vagaId,
  });

  if (!pergunta) return next(new AppError('Pergunta não encontrada', 404));

  res.status(204).json({ status: 'success', data: null });
});
