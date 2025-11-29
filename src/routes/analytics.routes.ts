import { Router } from 'express';
import { GroupService } from '../services/group.service';

const router = Router();
const groupService = GroupService.getInstance();

import { authenticate, AuthRequest } from '../middleware/auth';

// Get group analytics
router.get('/groups/:groupId', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { groupId } = req.params;
    if (!req.user?.uid) {
      throw new Error('User not authenticated');
    }
    const analytics = await groupService.getGroupAnalytics(groupId, req.user.uid);
    res.json(analytics);
  } catch (error) {
    next(error);
  }
});

export default router;
