import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import { env } from "../config/env.js";

export type JwtPayload = {
  sub: string;
  role: string;
};

export function signAccessToken(payload: JwtPayload) {
  const expiresIn = env.jwtAccessTtl as SignOptions["expiresIn"];
  return jwt.sign(payload, env.jwtAccessSecret, { expiresIn });
}

export function signRefreshToken(payload: JwtPayload) {
  const expiresIn = env.jwtRefreshTtl as SignOptions["expiresIn"];
  return jwt.sign(payload, env.jwtRefreshSecret, { expiresIn });
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, env.jwtAccessSecret) as JwtPayload;
}

export function verifyRefreshToken(token: string) {
  return jwt.verify(token, env.jwtRefreshSecret) as JwtPayload;
}
