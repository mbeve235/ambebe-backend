import { Router } from "express";
import { health, ready, metrics, paymentWebhook, stripeWebhook } from "../controllers/systemController.js";

export const systemRouter = Router();

systemRouter.get("/health", health);
systemRouter.get("/ready", ready);
systemRouter.get("/metrics", metrics);
systemRouter.post("/webhooks/payments/:provider", paymentWebhook);
systemRouter.post("/webhooks/stripe", stripeWebhook);
