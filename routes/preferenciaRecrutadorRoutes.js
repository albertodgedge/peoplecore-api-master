const express = require('express');
const preferenciaRecrutadorController = require('../controllers/preferenciaRecrutadorController');
const authController = require('../controllers/authController');

const router = express.Router();

router.use(authController.protect);
router.use(authController.checkPermissaoModulo('Recrutamento'));

router
  .route('/')
  .get(preferenciaRecrutadorController.getAll)
  .post(preferenciaRecrutadorController.create);

router
  .route('/:id')
  .patch(preferenciaRecrutadorController.update)
  .delete(preferenciaRecrutadorController.remove);

module.exports = router;
