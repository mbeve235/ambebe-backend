import nodemailer from "nodemailer";
import { env } from "../config/env.js";

function getTransporter() {
  if (!env.mail.host || !env.mail.from) {
    throw new Error("Mail transport not configured");
  }

  return nodemailer.createTransport({
    host: env.mail.host,
    port: env.mail.port,
    secure: env.mail.port === 465,
    auth: env.mail.user
      ? {
          user: env.mail.user,
          pass: env.mail.pass
        }
      : undefined
  });
}

export async function sendPasswordResetEmail(email: string, token: string) {
  const transporter = getTransporter();
  const resetUrl = `${env.appBaseUrl}/reset-password?token=${token}`;

  await transporter.sendMail({
    from: env.mail.from,
    to: email,
    subject: "Password reset",
    text: `Use this link to reset your password: ${resetUrl}`,
    html: `<p>Use this link to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p>`
  });
}

export async function sendEmailVerificationEmail(email: string, token: string, code: string) {
  const transporter = getTransporter();
  const verifyUrl = `${env.appBaseUrl}/verificar-email?token=${token}`;

  await transporter.sendMail({
    from: env.mail.from,
    to: email,
    subject: "Confirmacao de email",
    text: `Confirme sua conta pelo link: ${verifyUrl}\nOu use este codigo: ${code}`,
    html: `<p>Confirme sua conta pelo link:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>Ou use este codigo: <strong>${code}</strong></p>`
  });
}

export async function sendSupportMessageEmail(params: {
  userEmail: string;
  userName?: string | null;
  subject: string;
  message: string;
  messageId: string;
}) {
  if (!env.supportEmail) {
    throw new Error("Support email not configured");
  }

  const transporter = getTransporter();
  const supportUrl = `${env.appBaseUrl}/admin/suporte`;
  const senderLabel = params.userName ? `${params.userName} <${params.userEmail}>` : params.userEmail;

  await transporter.sendMail({
    from: env.mail.from,
    to: env.supportEmail,
    subject: `Novo suporte: ${params.subject}`,
    text: `Mensagem de ${senderLabel}\n\n${params.message}\n\nAbrir painel: ${supportUrl}\nID: ${params.messageId}`,
    html: `<p>Mensagem de <strong>${senderLabel}</strong></p><p>${params.message}</p><p><a href="${supportUrl}">Abrir painel</a></p><p>ID: ${params.messageId}</p>`
  });
}

export async function sendSupportReplyEmail(params: {
  userEmail: string;
  userName?: string | null;
  subject: string;
  reply: string;
}) {
  const transporter = getTransporter();
  const supportUrl = `${env.appBaseUrl}/cliente/suporte`;
  const userLabel = params.userName ? params.userName : params.userEmail;

  await transporter.sendMail({
    from: env.mail.from,
    to: params.userEmail,
    subject: `Resposta do suporte: ${params.subject}`,
    text: `Ola ${userLabel},\n\nResposta do suporte:\n${params.reply}\n\nAcompanhe em: ${supportUrl}`,
    html: `<p>Ola ${userLabel},</p><p>Resposta do suporte:</p><p>${params.reply}</p><p><a href="${supportUrl}">Acompanhar suporte</a></p>`
  });
}

export async function sendLoginAttemptAlert(params: {
  email: string;
  name?: string | null;
  attempts: number;
  lockMinutes: number;
  ip?: string;
  userAgent?: string;
}) {
  const transporter = getTransporter();
  const label = params.name ? params.name : params.email;
  const metadata = [
    params.ip ? `IP: ${params.ip}` : null,
    params.userAgent ? `Navegador: ${params.userAgent}` : null
  ]
    .filter(Boolean)
    .join("\n");

  await transporter.sendMail({
    from: env.mail.from,
    to: params.email,
    subject: "Alerta de tentativas de login",
    text: `Ola ${label},\n\nDetectamos ${params.attempts} tentativas de login falhadas na sua conta. Por seguranca, o acesso foi bloqueado por ${params.lockMinutes} minutos.\n\n${metadata}\n\nSe nao foi voce, altere sua senha imediatamente.`,
    html: `<p>Ola ${label},</p><p>Detectamos <strong>${params.attempts}</strong> tentativas de login falhadas na sua conta. Por seguranca, o acesso foi bloqueado por <strong>${params.lockMinutes} minutos</strong>.</p>${metadata ? `<p>${metadata.replace(/\n/g, "<br />")}</p>` : ""}<p>Se nao foi voce, altere sua senha imediatamente.</p>`
  });
}
