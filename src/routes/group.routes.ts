import { Router } from 'express';
import { GroupController } from '../controllers/group.controller';
import { authenticate } from '../middleware/auth';

const router = Router();
const groupController = GroupController.getInstance();

// Apply authentication to all group routes
router.use(authenticate);

// Group management
router.post('/', groupController.createGroup);
router.post('/:groupId/members', groupController.addGroupMember);
router.post('/:groupId/leave', groupController.leaveGroup);
router.post('/:groupId/expenses', groupController.addGroupExpense);
router.post('/:groupId/expenses/:expenseId/pay', groupController.markExpenseAsPaid);
router.post('/:groupId/settle', groupController.settleGroup);
router.get('/:groupId/analytics', groupController.getGroupAnalytics);

export default router;
