import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import borrowersRouter from "./borrowers";
import paymentsRouter from "./payments";
import analyticsRouter from "./analytics";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(borrowersRouter);
router.use(paymentsRouter);
router.use(analyticsRouter);

export default router;
