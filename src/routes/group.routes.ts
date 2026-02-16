import { Router } from 'express';
import { GroupController } from '../controllers/group.controller';
import { authenticate } from '../middleware/auth';

const router = Router();
const groupController = GroupController.getInstance();

// Apply authentication to all group routes
router.use(authenticate);

// Group management
router.get('/', groupController.listGroups);
router.post('/', groupController.createGroup);
router.get('/:groupId', groupController.getGroup);
router.put('/:groupId', groupController.updateGroup);
router.delete('/:groupId', groupController.deleteGroup);
router.post('/:groupId/members', groupController.addGroupMember);
router.delete('/:groupId/members/:memberId', groupController.removeGroupMember);
router.post('/:groupId/leave', groupController.leaveGroup);
router.post('/:groupId/expenses', groupController.addGroupExpense);
router.post('/:groupId/expenses/:expenseId/pay', groupController.markExpenseAsPaid);
router.post('/:groupId/settle', groupController.settleGroup);
router.get('/:groupId/expenses', groupController.getGroupExpenses);
router.get('/:groupId/analytics', groupController.getGroupAnalytics);

export default router;
