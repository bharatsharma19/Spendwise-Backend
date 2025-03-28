import { Router } from 'express';
import { GroupService } from '../services/group.service';

const router = Router();
const groupService = GroupService.getInstance();

// Get group analytics
router.get('/groups/:groupId', async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const analytics = await groupService.getGroupAnalytics(groupId);
    res.json(analytics);
  } catch (error) {
    next(error);
  }
});

export default router;
