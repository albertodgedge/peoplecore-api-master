/**
 * Defaults para campos novos de Vaga + nota sobre enum candidatura.
 * Uso: npm run migrate:recruitment-v2-fields
 */
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const dns = require('dns');

dns.setServers(['8.8.8.8', '1.1.1.1']);
dotenv.config({ path: './config.env' });

const Vaga = require('../models/vagaModel');

async function main() {
  const DB = process.env.DATABASE.replace(
    '<PASSWORD>',
    process.env.DATABASE_PASSWORD,
  );
  await mongoose.connect(DB);

  const result = await Vaga.updateMany(
    {
      $or: [
        { niveis_aprovacao: { $exists: false } },
        { niveis_aprovacao: null },
        { modelo_requisicao: { $exists: false } },
        { modelo_requisicao: null },
      ],
    },
    {
      $set: {
        niveis_aprovacao: 3,
        modelo_requisicao: 'padrao_3',
      },
    },
  );

  console.log(
    `Vagas actualizadas (defaults niveis/modelo): matched=${result.matchedCount} modified=${result.modifiedCount}`,
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
