import { Router, type IRouter } from "express";
import healthRouter from "./health";
import careerPilotRouter from "./careerpilot";

const router: IRouter = Router();

router.use(healthRouter);
router.use(careerPilotRouter);

export default router;
