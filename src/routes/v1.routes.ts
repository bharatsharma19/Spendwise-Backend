import { Router } from 'express';
import analyticsRoutes from './analytics.routes';
import authRoutes from './auth.routes';
import cronRoutes from './cron.routes';
import expenseRoutes from './expense.routes';
import { exportRoutes } from './export.routes';
import groupRoutes from './group.routes';
import notificationRoutes from './notification.routes';
import userRoutes from './user.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/expenses', expenseRoutes);
router.use('/groups', groupRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/notifications', notificationRoutes);
router.use('/cron', cronRoutes);
router.use('/export', exportRoutes);

export default router;
