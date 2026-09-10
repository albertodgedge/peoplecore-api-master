const assert = require('assert');
const crypto = require('crypto');
const {
  podeTransicionar,
  proximoEstadoAposEntrevista,
  estagioFeedbackParaStatus,
} = require('../../utils/recruitmentPipeline');
const { calcularPontuacao } = require('../../utils/screeningEvaluator');
const {
  faltamAprovadores,
  nivelPendenteActual,
  todosNiveisAprovados,
  papeisExigidos,
} = require('../../utils/vagaAprovacao');

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

console.log('recruitment pipeline');
test('novo → triagem permitido', () => {
  assert.strictEqual(podeTransicionar('novo', 'triagem'), true);
});
test('novo → contratado bloqueado', () => {
  assert.strictEqual(podeTransicionar('novo', 'contratado'), false);
});
test('triagem → selecionado', () => {
  assert.strictEqual(podeTransicionar('triagem', 'selecionado'), true);
});
test('aceite → contratado (não onboarding directo)', () => {
  assert.strictEqual(podeTransicionar('aceite', 'contratado'), true);
  assert.strictEqual(podeTransicionar('aceite', 'onboarding'), false);
});
test('contratado → onboarding', () => {
  assert.strictEqual(podeTransicionar('contratado', 'onboarding'), true);
});
test('nao_compativel → triagem', () => {
  assert.strictEqual(podeTransicionar('nao_compativel', 'triagem'), true);
});
test('entrevista_rh → entrevista_bu após sim', () => {
  assert.strictEqual(
    proximoEstadoAposEntrevista('entrevista_rh', false),
    'entrevista_bu',
  );
});
test('assessment sem excom → finalista', () => {
  assert.strictEqual(
    proximoEstadoAposEntrevista('assessment', false),
    'finalista',
  );
});
test('assessment com excom → entrevista_excom', () => {
  assert.strictEqual(
    proximoEstadoAposEntrevista('assessment', true),
    'entrevista_excom',
  );
});
test('estágio feedback triagem = I', () => {
  assert.strictEqual(estagioFeedbackParaStatus('triagem'), 'I');
});

console.log('vaga aprovação sequencial');
test('3 níveis exigem 3 papéis', () => {
  assert.deepStrictEqual(papeisExigidos(3), [
    'diretor_rh',
    'diretor_departamento',
    'diretor_geral',
  ]);
});
test('1 nível só diretor_departamento', () => {
  assert.deepStrictEqual(papeisExigidos(1), ['diretor_departamento']);
});
test('faltam aprovadores detectados', () => {
  const faltam = faltamAprovadores({
    niveis_aprovacao: 2,
    aprovadores: [{ papel: 'diretor_rh', usuario_id: '1', ordem: 1 }],
  });
  assert.deepStrictEqual(faltam, ['diretor_departamento']);
});
test('nível pendente é o primeiro não aprovado', () => {
  const pendente = nivelPendenteActual({
    niveis_aprovacao: 3,
    aprovadores: [
      {
        papel: 'diretor_rh',
        usuario_id: '1',
        ordem: 1,
        status: 'aprovado',
      },
      {
        papel: 'diretor_departamento',
        usuario_id: '2',
        ordem: 2,
        status: 'pendente',
      },
      {
        papel: 'diretor_geral',
        usuario_id: '3',
        ordem: 3,
        status: 'pendente',
      },
    ],
  });
  assert.strictEqual(pendente.papel, 'diretor_departamento');
});
test('todos níveis aprovados', () => {
  assert.strictEqual(
    todosNiveisAprovados({
      niveis_aprovacao: 1,
      aprovadores: [
        {
          papel: 'diretor_departamento',
          usuario_id: '1',
          ordem: 1,
          status: 'aprovado',
        },
      ],
    }),
    true,
  );
});

console.log('screening evaluator');
test('desqualifica pergunta eliminatória', () => {
  const perguntas = [
    {
      _id: '1',
      texto: 'CNH?',
      tipo: 'sim_nao',
      obrigatoria: true,
      eh_desclassificatoria: true,
      resposta_esperada: 'sim',
      peso: 1,
    },
  ];
  const result = calcularPontuacao(perguntas, [
    { pergunta_id: '1', resposta: 'nao' },
  ]);
  assert.strictEqual(result.desqualificado, true);
});
test('pontuação positiva', () => {
  const perguntas = [
    {
      _id: '1',
      texto: 'Experiência?',
      tipo: 'sim_nao',
      obrigatoria: true,
      eh_desclassificatoria: false,
      resposta_esperada: 'sim',
      peso: 2,
    },
  ];
  const result = calcularPontuacao(perguntas, [
    { pergunta_id: '1', resposta: 'sim' },
  ]);
  assert.strictEqual(result.pontuacao_triagem, 100);
});

console.log('form token');
test('token criptográfico tem 48 chars hex', () => {
  const token = crypto.randomBytes(24).toString('hex');
  assert.strictEqual(token.length, 48);
});

console.log('\nTodos os testes passaram.');
