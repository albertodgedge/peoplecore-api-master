const mongoose = require('mongoose');

const FORMATOS = [
  'multipla_escolha',
  'escala_avaliacao',
  'numerico',
  'texto_livre',
];

const preferenciaRecrutadorSchema = new mongoose.Schema(
  {
    utilizador_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      required: true,
    },
    empresa_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Empresa',
      required: true,
    },
    nome_pergunta: {
      type: String,
      required: [true, 'nome_pergunta é obrigatório'],
      trim: true,
    },
    formato_resposta: {
      type: String,
      enum: FORMATOS,
      required: true,
    },
    intervalo_resposta: { type: String, trim: true },
    opcoes: [{ type: String, trim: true }],
  },
  { timestamps: true },
);

preferenciaRecrutadorSchema.index({ empresa_id: 1, utilizador_id: 1 });

module.exports = mongoose.model(
  'PreferenciaRecrutador',
  preferenciaRecrutadorSchema,
);
module.exports.FORMATOS = FORMATOS;
