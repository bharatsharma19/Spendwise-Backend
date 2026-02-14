import { CronController } from '../controllers/cron.controller';
import { BaseRouter } from './base.routes';

export class CronRouter extends BaseRouter {
  private cronController: CronController;

  constructor() {
    super();
    this.cronController = CronController.getInstance();

    // Trigger recurring expense processing
    // Note: We don't use addProtectedRoute because this is a system route
    // protected by a static secret, not a user JWT.
    this.router.post('/process', this.asRequestHandler(this.cronController.processRecurring));
  }
}

export default new CronRouter().getRouter();
