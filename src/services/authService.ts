import crypto from "crypto";
import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/apiError.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt.js";
import { sha256 } from "../utils/hash.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { sendEmailVerificationEmail, sendLoginAttemptAlert, sendPasswordResetEmail } from "./mailService.js";

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const EMAIL_VERIFICATION_RESEND_WINDOW_MS = 2 * 60 * 1000;
const PASSWORD_RESET_DAILY_MS = 24 * 60 * 60 * 1000;
const LOGIN_LOCK_THRESHOLD = 5;
const LOGIN_LOCK_MS = 2 * 60 * 1000;

async function createEmailVerificationToken(userId: string) {
  const recentWindow = new Date(Date.now() - EMAIL_VERIFICATION_RESEND_WINDOW_MS);
  const recentToken = await prisma.emailVerificationToken.findFirst({
    where: { userId, createdAt: { gt: recentWindow }, usedAt: null }
  });
  if (recentToken) {
    throw new ApiError(429, "verification_rate_limited", "Aguarde antes de solicitar um novo codigo");
  }

  await prisma.emailVerificationToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() }
  });

  const rawToken = crypto.randomBytes(32).toString("hex");
  const rawCode = String(Math.floor(100000 + Math.random() * 900000));
  await prisma.emailVerificationToken.create({
    data: {
      userId,
      tokenHash: sha256(rawToken),
      codeHash: sha256(rawCode),
      expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS)
    }
  });

  return { token: rawToken, code: rawCode };
}

async function markEmailVerified(userId: string) {
  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { isEmailVerified: true, emailVerifiedAt: now }
    }),
    prisma.emailVerificationToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: now }
    })
  ]);
}

export async function registerUser(email: string, password: string, name?: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new ApiError(409, "email_taken", "Email already registered");
  }

  const role = await prisma.role.findUnique({ where: { name: "customer" } });
  if (!role) {
    throw new ApiError(500, "role_missing", "Default role not configured");
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, passwordHash, name, roleId: role.id, isEmailVerified: false }
  });

  const verification = await createEmailVerificationToken(user.id);
  try {
    await sendEmailVerificationEmail(user.email, verification.token, verification.code);
  } catch (error) {
    await prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    throw error;
  }

  return user;
}

export async function loginUser(
  email: string,
  password: string,
  meta?: { ip?: string; userAgent?: string }
) {
  const emailKey = email.trim().toLowerCase();
  const now = new Date();
  const attempt = await prisma.loginAttempt.findUnique({ where: { email: emailKey } });
  if (attempt?.lockedUntil && attempt.lockedUntil > now) {
    const remainingMs = attempt.lockedUntil.getTime() - now.getTime();
    const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
    throw new ApiError(429, "login_locked", `Muitas tentativas. Aguarde ${remainingMinutes} minutos.`);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { role: true }
  });
  if (!user) {
    await registerFailedLoginAttempt(emailKey, null, meta);
    throw new ApiError(401, "invalid_credentials", "Invalid email or password");
  }

  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) {
    await registerFailedLoginAttempt(emailKey, { email: user.email, name: user.name }, meta);
    throw new ApiError(401, "invalid_credentials", "Invalid email or password");
  }

  await prisma.loginAttempt.updateMany({
    where: { email: emailKey },
    data: { failureCount: 0, lockedUntil: null, lastFailureAt: null }
  });

  if (!user.isEmailVerified) {
    throw new ApiError(403, "email_not_verified", "Confirme seu email para entrar.");
  }

  const payload = { sub: user.id, role: user.role.name };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }
  });

  return { accessToken, refreshToken, user };
}

async function registerFailedLoginAttempt(
  emailKey: string,
  user: { email: string; name?: string | null } | null,
  meta?: { ip?: string; userAgent?: string }
) {
  const now = new Date();
  const existing = await prisma.loginAttempt.findUnique({ where: { email: emailKey } });
  const nextCount = (existing?.failureCount ?? 0) + 1;
  const shouldLock = nextCount % LOGIN_LOCK_THRESHOLD === 0;
  const lockMultiplier = Math.floor(nextCount / LOGIN_LOCK_THRESHOLD);
  const lockUntil = shouldLock ? new Date(now.getTime() + LOGIN_LOCK_MS * lockMultiplier) : null;

  await prisma.loginAttempt.upsert({
    where: { email: emailKey },
    update: {
      failureCount: nextCount,
      lockedUntil: lockUntil ?? null,
      lastFailureAt: now
    },
    create: {
      email: emailKey,
      failureCount: nextCount,
      lockedUntil: lockUntil ?? null,
      lastFailureAt: now
    }
  });

  if (shouldLock && user) {
    try {
      await sendLoginAttemptAlert({
        email: user.email,
        name: user.name,
        attempts: nextCount,
        lockMinutes: Math.max(1, Math.round((LOGIN_LOCK_MS * lockMultiplier) / 60000)),
        ip: meta?.ip,
        userAgent: meta?.userAgent
      });
    } catch {
      // ignore alert failures
    }
  }
}

export async function verifyEmail(params: { token?: string; email?: string; code?: string }) {
  if (params.token) {
    const tokenHash = sha256(params.token);
    const record = await prisma.emailVerificationToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } }
    });
    if (!record) {
      throw new ApiError(400, "invalid_verification_token", "Link de verificacao invalido ou expirado");
    }

    const user = await prisma.user.findUnique({ where: { id: record.userId } });
    if (!user) {
      throw new ApiError(404, "not_found", "User not found");
    }

    if (!user.isEmailVerified) {
      await markEmailVerified(user.id);
    } else {
      await prisma.emailVerificationToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() }
      });
    }

    return user;
  }

  if (params.email && params.code) {
    const email = params.email.trim();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new ApiError(400, "invalid_verification_code", "Codigo de verificacao invalido ou expirado");
    }

    const codeHash = sha256(params.code.trim());
    const record = await prisma.emailVerificationToken.findFirst({
      where: { userId: user.id, codeHash, usedAt: null, expiresAt: { gt: new Date() } }
    });
    if (!record) {
      throw new ApiError(400, "invalid_verification_code", "Codigo de verificacao invalido ou expirado");
    }

    if (!user.isEmailVerified) {
      await markEmailVerified(user.id);
    } else {
      await prisma.emailVerificationToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() }
      });
    }

    return user;
  }

  throw new ApiError(400, "invalid_request", "Token ou codigo obrigatorio");
}

export async function refreshTokens(refreshToken: string) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new ApiError(401, "invalid_refresh", "Invalid refresh token");
  }

  const tokenHash = sha256(refreshToken);
  const record = await prisma.refreshToken.findFirst({
    where: {
      userId: payload.sub,
      tokenHash,
      revokedAt: null
    }
  });

  if (!record) {
    throw new ApiError(401, "invalid_refresh", "Refresh token revoked or not found");
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { role: true }
  });
  if (!user) {
    throw new ApiError(401, "invalid_refresh", "User not found");
  }

  const newPayload = { sub: user.id, role: user.role.name };
  const newAccess = signAccessToken(newPayload);
  const newRefresh = signRefreshToken(newPayload);

  const newRecord = await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(newRefresh),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }
  });

  await prisma.refreshToken.update({
    where: { id: record.id },
    data: {
      revokedAt: new Date(),
      replacedByTokenId: newRecord.id
    }
  });

  return { accessToken: newAccess, refreshToken: newRefresh };
}

export async function logoutUser(refreshToken: string) {
  const tokenHash = sha256(refreshToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() }
  });
}

export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return null;
  }

  const oneDayAgo = new Date(Date.now() - PASSWORD_RESET_DAILY_MS);
  if (user.lastPasswordResetAt && user.lastPasswordResetAt > oneDayAgo) {
    throw new ApiError(429, "reset_rate_limited", "Voce ja atualizou sua senha nas ultimas 24 horas");
  }

  const recentToken = await prisma.passwordResetToken.findFirst({
    where: { userId: user.id, createdAt: { gt: oneDayAgo } }
  });
  if (recentToken) {
    throw new ApiError(429, "reset_rate_limited", "Aguarde 24 horas para solicitar um novo link");
  }

  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() }
  });

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = sha256(rawToken);
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    }
  });

  await sendPasswordResetEmail(user.email, rawToken);
  return null;
}

export async function resetPassword(token: string, newPassword: string) {
  const tokenHash = sha256(token);
  const record = await prisma.passwordResetToken.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() }
    }
  });
  if (!record) {
    throw new ApiError(400, "invalid_reset_token", "Invalid or expired reset token");
  }

  const user = await prisma.user.findUnique({ where: { id: record.userId } });
  if (!user) {
    throw new ApiError(404, "not_found", "User not found");
  }
  const oneDayAgo = new Date(Date.now() - PASSWORD_RESET_DAILY_MS);
  if (user.lastPasswordResetAt && user.lastPasswordResetAt > oneDayAgo) {
    throw new ApiError(429, "reset_rate_limited", "Voce ja atualizou sua senha nas ultimas 24 horas");
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: record.userId },
    data: { passwordHash, lastPasswordResetAt: new Date() }
  });

  await prisma.passwordResetToken.update({
    where: { id: record.id },
    data: { usedAt: new Date() }
  });

  await prisma.refreshToken.updateMany({
    where: { userId: record.userId, revokedAt: null },
    data: { revokedAt: new Date() }
  });
}
