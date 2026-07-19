import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import dashboardRouter from "./dashboard";
import customersRouter from "./customers";
import plansRouter from "./plans";
import subscriptionsRouter from "./subscriptions";
import invoicesRouter from "./invoices";
import vouchersRouter from "./vouchers";
import routersRouter from "./routers";
import notificationsRouter from "./notifications";
import usersRouter from "./users";
import tenantsRouter from "./tenants";
import portalRouter from "./portal";
import paymentsRouter from "./payments";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(dashboardRouter);
router.use(customersRouter);
router.use(plansRouter);
router.use(subscriptionsRouter);
router.use(invoicesRouter);
router.use(paymentsRouter);
router.use(vouchersRouter);
router.use(routersRouter);
router.use(notificationsRouter);
router.use(usersRouter);
router.use(tenantsRouter);
router.use(portalRouter);

export default router;
