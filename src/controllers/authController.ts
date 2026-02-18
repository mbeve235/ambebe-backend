import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  loginUser,
  refreshTokens,
  registerUser,
  logoutUser,
  requestPasswordReset,
  resetPassword,
  verifyEmail
} from "../services/authService.js";
import { ApiError } from "../utils/apiError.js";

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().min(2).max(120).optional()
  })
});

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password, name } = req.body;
    const user = await registerUser(email, password, name);
    res.status(201).json({ id: user.id, email: user.email, name: user.name });
  } catch (err) {
    next(err);
  }
}

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8)
  })
});

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body;
    const result = await loginUser(email, password, {
      ip: req.ip,
      userAgent: req.header("user-agent") || undefined
    });
    res.json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: { id: result.user.id, email: result.user.email, name: result.user.name, role: result.user.role.name }
    });
  } catch (err) {
    next(err);
  }
}

export const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(10)
  })
});

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = req.body;
    const tokens = await refreshTokens(refreshToken);
    res.json(tokens);
  } catch (err) {
    next(err);
  }
}

export const logoutSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(10)
  })
});

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = req.body;
    await logoutUser(refreshToken);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().email()
  })
});

export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    await requestPasswordReset(req.body.email);
    res.json({
      message: "If the email exists, a reset token was sent."
    });
  } catch (err) {
    next(err);
  }
}

export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(20),
    newPassword: z.string().min(8)
  })
});

export async function resetPasswordHandler(req: Request, res: Response, next: NextFunction) {
  try {
    await resetPassword(req.body.token, req.body.newPassword);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export const verifyEmailSchema = z.object({
  body: z
    .object({
      token: z.string().min(20).optional(),
      email: z.string().email().optional(),
      code: z.string().min(4).max(10).optional()
    })
    .refine((data) => Boolean(data.token || (data.email && data.code)), {
      message: "Token ou codigo obrigatorio"
    })
});

export async function verifyEmailHandler(req: Request, res: Response, next: NextFunction) {
  try {
    await verifyEmail(req.body);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      throw new ApiError(401, "unauthorized", "Not authenticated");
    }
    res.json({ id: req.user.id, email: req.user.email, name: req.user.name, role: req.user.roleId });
  } catch (err) {
    next(err);
  }
}
