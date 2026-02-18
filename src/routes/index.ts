import { Router } from "express";
import { authRouter } from "./authRoutes.js";
import { adminRouter } from "./adminRoutes.js";
import { systemRouter } from "./systemRoutes.js";
import { storeRouter } from "./storeRoutes.js";
import { accountRouter } from "./accountRoutes.js";
import { staffRouter } from "./staffRoutes.js";

export const router = Router();

router.use("/system", systemRouter);
router.use("/auth", authRouter);
router.use("/store", storeRouter);
router.use("/account", accountRouter);
router.use("/staff", staffRouter);
router.use("/admin", adminRouter);
