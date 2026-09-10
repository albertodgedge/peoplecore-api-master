const LogSistema = require('../models/logSistemaModel');

/**
 * Pipeline alinhado ao frontend (docs/backend-recrutamento-atualizacao.md).
 * Ordem: novo → triagem → selecionado → entrevista_rh → entrevista_bu →
 * assessment → [entrevista_excom] → finalista → ref_check → proposta →
 * aceite → contratado → onboarding
 */
const TRANSICOES = {
  novo: ['triagem', 'desqualificado', 'nao_compativel'],
  triagem: ['selecionado', 'desqualificado', 'rejeitado', 'nao_compativel'],
  selecionado: [
    'entrevista_rh',
    'rejeitado',
    'desqualificado',
    'nao_compativel',
  ],
  entrevista_rh: ['entrevista_bu', 'rejeitado', 'desqualificado'],
  entrevista_bu: ['assessment', 'rejeitado', 'desqualificado'],
  assessment: ['entrevista_excom', 'finalista', 'rejeitado', 'desqualificado'],
  entrevista_excom: ['finalista', 'rejeitado', 'desqualificado'],
  finalista: ['ref_check', 'rejeitado'],
  ref_check: ['proposta', 'rejeitado'],
  proposta: ['aceite', 'rejeitado'],
  aceite: ['contratado'],
  contratado: ['onboarding'],
  onboarding: [],
  rejeitado: [],
  desqualificado: [],
  nao_compativel: ['triagem'],
};

const ORDEM_PIPELINE = [
  'novo',
  'triagem',
  'selecionado',
  'entrevista_rh',
  'entrevista_bu',
  'assessment',
  'entrevista_excom',
  'finalista',
  'ref_check',
  'proposta',
  'aceite',
  'contratado',
  'onboarding',
];

const FASE_PARA_STATUS = {
  rh: 'entrevista_rh',
  assessment: 'assessment',
  bu: 'entrevista_bu',
  excom: 'entrevista_excom',
};

const STATUS_PARA_FASE = Object.fromEntries(
  Object.entries(FASE_PARA_STATUS).map(([k, v]) => [v, k]),
);

function podeTransicionar(de, para) {
  if (de === para) return true;
  const permitidos = TRANSICOES[de] || [];
  return permitidos.includes(para);
}

function proximoEstadoAposEntrevista(statusAtual, requerExcom) {
  const map = {
    entrevista_rh: 'entrevista_bu',
    entrevista_bu: 'assessment',
    assessment: requerExcom ? 'entrevista_excom' : 'finalista',
    entrevista_excom: 'finalista',
  };
  return map[statusAtual] || null;
}

function estagioFeedbackParaStatus(status) {
  if (
    ['novo', 'triagem', 'selecionado', 'desqualificado', 'nao_compativel'].includes(
      status,
    )
  ) {
    return 'I';
  }
  if (
    [
      'entrevista_rh',
      'entrevista_bu',
      'assessment',
      'entrevista_excom',
    ].includes(status)
  ) {
    return 'II';
  }
  return 'III';
}

async function registarTransicao({
  candidatura,
  de,
  para,
  usuarioId,
  empresaId,
  motivo,
  req,
}) {
  candidatura.historico_estados = candidatura.historico_estados || [];
  candidatura.historico_estados.push({
    de,
    para,
    usuario_id: usuarioId,
    motivo,
    data: new Date(),
  });
  candidatura.status = para;

  if (empresaId) {
    await LogSistema.create({
      usuario_id: usuarioId,
      empresa_id: empresaId,
      acao: `Candidatura ${de} → ${para}`,
      modulo: 'Recrutamento',
      detalhes: {
        candidatura_id: candidatura._id,
        de,
        para,
        motivo,
      },
      ip: req?.ip,
      severidade: 'Info',
    });
  }
}

module.exports = {
  TRANSICOES,
  ORDEM_PIPELINE,
  FASE_PARA_STATUS,
  STATUS_PARA_FASE,
  podeTransicionar,
  proximoEstadoAposEntrevista,
  estagioFeedbackParaStatus,
  registarTransicao,
};
