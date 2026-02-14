import { Router } from 'express';
import { ExportController } from '../controllers/export.controller';
import { authenticate } from '../middleware/auth';

const router = Router();
const exportController = ExportController.getInstance(); // Use static getter

router.use(authenticate);

router.get('/', (req, res, next) => exportController.getExport(req, res, next));

export const exportRoutes = router;
