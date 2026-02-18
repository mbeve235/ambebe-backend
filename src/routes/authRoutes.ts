import { Router } from "express";
import {
  forgotPassword,
  forgotPasswordSchema,
  login,
  loginSchema,
  logout,
  logoutSchema,
  refresh,
  refreshSchema,
  register,
  registerSchema,
  resetPasswordHandler,
  resetPasswordSchema,
  verifyEmailHandler,
  verifyEmailSchema
} from "../controllers/authController.js";
import { validate } from "../middlewares/validate.js";
import { rateLimit } from "../middlewares/rateLimit.js";

export const authRouter = Router();

authRouter.post("/register", validate(registerSchema), register);
authRouter.post("/register/customer", validate(registerSchema), register);
authRouter.post("/login", rateLimit(), validate(loginSchema), login);
authRouter.post("/refresh", validate(refreshSchema), refresh);
authRouter.post("/logout", validate(logoutSchema), logout);
authRouter.post("/forgot-password", rateLimit(), validate(forgotPasswordSchema), forgotPassword);
authRouter.post("/reset-password", rateLimit(), validate(resetPasswordSchema), resetPasswordHandler);
authRouter.post("/verify-email", validate(verifyEmailSchema), verifyEmailHandler);
