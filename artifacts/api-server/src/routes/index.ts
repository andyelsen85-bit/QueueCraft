import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import queuecraftRouter from "./queuecraft";
import { csrfProtection, requireAuthenticated } from "../middleware/security";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(csrfProtection, requireAuthenticated, queuecraftRouter);

export default router;
