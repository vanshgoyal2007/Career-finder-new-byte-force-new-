import { Router, type IRouter } from "express";
import healthRouter from "./health";
import careerPilotRouter from "./careerpilot";
import careerPilotIntegrationsRouter from "./careerpilot-integrations";

const router: IRouter = Router();

router.use(healthRouter);
router.use(careerPilotRouter);
router.use(careerPilotIntegrationsRouter);

export default router;
