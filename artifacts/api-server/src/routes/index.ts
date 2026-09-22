import { Router, type IRouter } from "express";
import healthRouter from "./health";
import queuecraftRouter from "./queuecraft";

const router: IRouter = Router();

router.use(healthRouter);
router.use(queuecraftRouter);

export default router;
