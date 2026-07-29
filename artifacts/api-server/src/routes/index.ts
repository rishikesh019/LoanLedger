import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import borrowersRouter from "./borrowers";
import paymentsRouter from "./payments";
import analyticsRouter from "./analytics";
import collectionsRouter from "./collections";
import fundsRouter from "./funds";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(borrowersRouter);
router.use(paymentsRouter);
router.use(analyticsRouter);
router.use(collectionsRouter);
router.use(fundsRouter);

export default router;
