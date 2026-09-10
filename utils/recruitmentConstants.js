const VAGA_STATUS = [
  'Rascunho',
  'Em Aprovação',
  'Aberta',
  'Em Andamento',
  'Pausada',
  'Fechada',
  'Cancelada',
  'Rejeitada',
];

const CANDIDATURA_STATUS = [
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
  'rejeitado',
  'desqualificado',
  'nao_compativel',
];

const PROPOSTA_STATUS = [
  'rascunho',
  'pedida',
  'em_aprovacao',
  'aprovada',
  'enviada',
  'aceite',
  'rejeitada',
];

const ONBOARDING_STATUS = [
  'iniciado',
  'em_preenchimento',
  'validado',
  'concluido',
];

const ENTREVISTA_FASE = ['rh', 'assessment', 'bu', 'excom'];

const LEGACY_CANDIDATO_STATUS_MAP = {
  Novo: 'novo',
  'Em Análise': 'triagem',
  Selecionado: 'selecionado',
  Rejeitado: 'rejeitado',
  'Entrevista Agendada': 'entrevista_rh',
  Entrevistado: 'entrevista_rh',
  Aprovado: 'proposta',
  Contratado: 'contratado',
  Desistiu: 'rejeitado',
};

const FEEDBACK_ESTAGIOS = ['I', 'II', 'III'];

module.exports = {
  VAGA_STATUS,
  CANDIDATURA_STATUS,
  PROPOSTA_STATUS,
  ONBOARDING_STATUS,
  ENTREVISTA_FASE,
  LEGACY_CANDIDATO_STATUS_MAP,
  FEEDBACK_ESTAGIOS,
  SLA_FEEDBACK_DIAS: 14,
};
