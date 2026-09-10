/** Papéis exigidos por número de níveis de aprovação (ordem canónica). */
const PAPEIS_POR_NIVEIS = {
  1: ['diretor_departamento'],
  2: ['diretor_rh', 'diretor_departamento'],
  3: ['diretor_rh', 'diretor_departamento', 'diretor_geral'],
};

function papeisExigidos(niveis) {
  const n = Number(niveis) || 3;
  return PAPEIS_POR_NIVEIS[n] || PAPEIS_POR_NIVEIS[3];
}

function aprovadoresOrdenados(aprovadores = []) {
  return [...aprovadores].sort(
    (a, b) => (a.ordem || 999) - (b.ordem || 999),
  );
}

function faltamAprovadores(vaga) {
  const lista = vaga.aprovadores || [];
  if (!lista.length) {
    return papeisExigidos(vaga.niveis_aprovacao);
  }

  // Legado (hm/pbp/ta): se já há aprovadores sem papéis novos, não bloquear
  const temPapeisNovos = lista.some((a) =>
    ['diretor_rh', 'diretor_departamento', 'diretor_geral'].includes(a.papel),
  );
  if (!temPapeisNovos) return [];

  const exigidos = papeisExigidos(vaga.niveis_aprovacao);
  const presentes = new Set(lista.map((a) => a.papel));
  return exigidos.filter((p) => !presentes.has(p));
}

/** Índice do próximo nível pendente (sequencial). -1 se todos aprovados. */
function indiceNivelPendente(vaga) {
  const ordenados = aprovadoresOrdenados(vaga.aprovadores);
  const exigidos = new Set(papeisExigidos(vaga.niveis_aprovacao));
  const relevantes = ordenados.filter((a) => exigidos.has(a.papel));

  // Se só há papéis legado, usar ordem completa
  const lista = relevantes.length ? relevantes : ordenados;

  for (let i = 0; i < lista.length; i += 1) {
    if (lista[i].status !== 'aprovado') return i;
  }
  return -1;
}

function nivelPendenteActual(vaga) {
  const ordenados = aprovadoresOrdenados(vaga.aprovadores);
  const exigidos = new Set(papeisExigidos(vaga.niveis_aprovacao));
  const relevantes = ordenados.filter((a) => exigidos.has(a.papel));
  const lista = relevantes.length ? relevantes : ordenados;
  const idx = indiceNivelPendente(vaga);
  if (idx < 0) return null;
  return lista[idx];
}

function todosNiveisAprovados(vaga) {
  return indiceNivelPendente(vaga) === -1 && (vaga.aprovadores || []).length > 0;
}

function encontrarAprovador(vaga, { usuarioId, papel, ordem }) {
  const lista = vaga.aprovadores || [];
  if (papel != null && ordem != null) {
    const byPapelOrdem = lista.findIndex(
      (a) => a.papel === papel && Number(a.ordem) === Number(ordem),
    );
    if (byPapelOrdem >= 0) return byPapelOrdem;
  }
  if (papel) {
    const byPapel = lista.findIndex((a) => a.papel === papel);
    if (byPapel >= 0) return byPapel;
  }
  return lista.findIndex((a) => String(a.usuario_id) === String(usuarioId));
}

module.exports = {
  PAPEIS_POR_NIVEIS,
  papeisExigidos,
  aprovadoresOrdenados,
  faltamAprovadores,
  indiceNivelPendente,
  nivelPendenteActual,
  todosNiveisAprovados,
  encontrarAprovador,
};
