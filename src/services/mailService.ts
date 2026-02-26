import nodemailer from "nodemailer";
import { env } from "../config/env.js";

const DEFAULT_BRAND_NAME = "{{NOME_DA_MARCA}}";
const DEFAULT_LOGO_URL = "{{LOGO_URL}}";
const DEFAULT_CUSTOMER_NAME = "{{NOME_DO_CLIENTE}}";
const DEFAULT_SUPPORT_EMAIL = "{{EMAIL_SUPORTE}}";
const DEFAULT_EXPIRATION = "{{TEMPO_DE_EXPIRACAO}}";

type BrandEmailContext = {
  brandName: string;
  logoUrl: string;
  supportEmail: string;
  supportUrl: string;
  privacyUrl: string;
  termsUrl: string;
};

type TransactionalTemplateInput = {
  title: string;
  preheader: string;
  greetingName: string;
  intro: string;
  ctaLabel: string;
  ctaUrl: string;
  expirationLabel: string;
  securityNote: string;
  supportAlert: string;
  additionalInfo?: string;
};

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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resolveBrandContext(): BrandEmailContext {
  const brandName = (process.env.BRAND_NAME || "").trim() || DEFAULT_BRAND_NAME;
  const logoUrl = (process.env.MAIL_LOGO_URL || "").trim() || DEFAULT_LOGO_URL;
  const supportEmail = (env.supportEmail || "").trim() || DEFAULT_SUPPORT_EMAIL;

  return {
    brandName,
    logoUrl,
    supportEmail,
    supportUrl: `${env.appBaseUrl}/ajuda`,
    privacyUrl: `${env.appBaseUrl}/politica-de-privacidade`,
    termsUrl: `${env.appBaseUrl}/termos-de-uso`
  };
}

function buildTransactionalEmailTemplate(
  context: BrandEmailContext,
  input: TransactionalTemplateInput
) {
  const brandName = escapeHtml(context.brandName);
  const logoUrl = escapeHtml(context.logoUrl);
  const supportEmail = escapeHtml(context.supportEmail);
  const supportUrl = escapeHtml(context.supportUrl);
  const privacyUrl = escapeHtml(context.privacyUrl);
  const termsUrl = escapeHtml(context.termsUrl);

  const title = escapeHtml(input.title);
  const preheader = escapeHtml(input.preheader);
  const greetingName = escapeHtml(input.greetingName || DEFAULT_CUSTOMER_NAME);
  const intro = escapeHtml(input.intro);
  const ctaLabel = escapeHtml(input.ctaLabel);
  const ctaUrl = escapeHtml(input.ctaUrl);
  const expirationLabel = escapeHtml(input.expirationLabel || DEFAULT_EXPIRATION);
  const securityNote = escapeHtml(input.securityNote);
  const supportAlert = escapeHtml(input.supportAlert);
  const additionalInfo = input.additionalInfo ? `<p style="margin: 0 0 12px 0;">${escapeHtml(input.additionalInfo)}</p>` : "";

  const text = [
    `${input.title} | ${context.brandName}`,
    "",
    `Olá, ${input.greetingName}`,
    "",
    input.intro,
    "",
    `${input.ctaLabel}: ${input.ctaUrl}`,
    "",
    `Se o botão não funcionar, utilize este link completo: ${input.ctaUrl}`,
    "",
    `Este link é pessoal, intransmissível e expira automaticamente em ${input.expirationLabel}.`,
    input.securityNote,
    "Se não foi o utilizador a fazer este pedido, ignore este e-mail.",
    "A equipa nunca solicita a sua palavra-passe por e-mail.",
    input.supportAlert,
    "",
    `Suporte: ${context.supportUrl} | ${context.supportEmail}`,
    `Política de Privacidade: ${context.privacyUrl}`,
    `Termos de Uso: ${context.termsUrl}`,
    "",
    `Equipa ${context.brandName}`
  ].join("\n");

  const html = `<!doctype html>
<html lang="pt">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${title}</title>
    <style>
      @media only screen and (max-width: 600px) {
        .email-container { width: 100% !important; }
        .content { padding: 20px !important; }
        .cta { display: block !important; width: 100% !important; text-align: center !important; }
      }
    </style>
  </head>
  <body style="margin: 0; padding: 0; background-color: #f4f6fb; color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${preheader}</span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f6fb; padding: 24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" class="email-container" style="width: 600px; max-width: 600px; background: #ffffff; border-radius: 14px; overflow: hidden; border: 1px solid #e2e8f0;">
            <tr>
              <td style="padding: 24px 28px 12px 28px; background: linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%);">
                <img src="${logoUrl}" alt="Logo ${brandName}" style="height: 36px; width: auto; max-width: 180px; display: block;" />
              </td>
            </tr>
            <tr>
              <td class="content" style="padding: 28px;">
                <h1 style="margin: 0 0 12px 0; font-size: 24px; line-height: 1.25; color: #0f172a;">${title}</h1>
                <p style="margin: 0 0 16px 0;">Olá, ${greetingName}</p>
                <p style="margin: 0 0 16px 0;">${intro}</p>
                ${additionalInfo}
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 8px 0 16px 0;">
                  <tr>
                    <td style="border-radius: 10px; background-color: #1d4ed8;">
                      <a href="${ctaUrl}" class="cta" style="display: inline-block; padding: 12px 22px; color: #ffffff; text-decoration: none; font-weight: 600;">${ctaLabel}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin: 0 0 8px 0; color: #334155; font-size: 14px;"><strong>Se o botão não funcionar, utilize este link completo:</strong></p>
                <p style="margin: 0 0 16px 0; word-break: break-word; font-size: 14px;"><a href="${ctaUrl}" style="color: #1d4ed8;">${ctaUrl}</a></p>
                <p style="margin: 0 0 12px 0; font-size: 14px; color: #334155;">Este link é pessoal, intransmissível e expira automaticamente em <strong>${expirationLabel}</strong>.</p>
                <p style="margin: 0 0 12px 0; font-size: 14px; color: #334155;">${securityNote}</p>
                <p style="margin: 0 0 12px 0; font-size: 14px; color: #334155;">Se não foi o utilizador a fazer este pedido, ignore este e-mail.</p>
                <p style="margin: 0 0 20px 0; font-size: 14px; color: #334155;">A equipa nunca solicita a sua palavra-passe por e-mail.</p>
                <p style="margin: 0 0 20px 0; font-size: 14px; color: #334155;">${supportAlert}</p>
                <p style="margin: 0; font-size: 14px; color: #0f172a;"><strong>Equipa ${brandName}</strong></p>
              </td>
            </tr>
            <tr>
              <td style="padding: 18px 28px 24px 28px; border-top: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">
                <a href="${supportUrl}" style="color: #1d4ed8; text-decoration: none;">Suporte</a>
                &nbsp;|&nbsp;
                <a href="${privacyUrl}" style="color: #1d4ed8; text-decoration: none;">Política de Privacidade</a>
                &nbsp;|&nbsp;
                <a href="${termsUrl}" style="color: #1d4ed8; text-decoration: none;">Termos de Uso</a>
                <br />
                <span style="display: inline-block; margin-top: 8px;">${supportEmail}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { text, html };
}

export async function sendPasswordResetEmail(
  email: string,
  token: string,
  customerName?: string | null,
  expirationLabel?: string
) {
  const transporter = getTransporter();
  const context = resolveBrandContext();
  const resetUrl = `${env.appBaseUrl}/reset-password?token=${token}`;
  const template = buildTransactionalEmailTemplate(context, {
    title: "Redefinição de Palavra-passe",
    preheader: "Recebemos um pedido para redefinir a sua palavra-passe.",
    greetingName: customerName || DEFAULT_CUSTOMER_NAME,
    intro: "Recebemos um pedido para redefinir a palavra-passe da sua conta.",
    ctaLabel: "Redefinir Palavra-passe",
    ctaUrl: resetUrl,
    expirationLabel: expirationLabel || DEFAULT_EXPIRATION,
    securityNote: "Por segurança, só utilize este link num dispositivo de confiança.",
    supportAlert: "Se suspeitar de atividade indevida, contacte o suporte de imediato."
  });

  await transporter.sendMail({
    from: env.mail.from,
    to: email,
    subject: "Redefinição de Palavra-passe",
    text: template.text,
    html: template.html
  });
}

export async function sendEmailVerificationEmail(
  email: string,
  token: string,
  code: string,
  customerName?: string | null,
  expirationLabel?: string
) {
  const transporter = getTransporter();
  const context = resolveBrandContext();
  const verifyUrl = `${env.appBaseUrl}/verificar-email?token=${token}`;
  const template = buildTransactionalEmailTemplate(context, {
    title: "Confirmação da Conta",
    preheader: "Confirme a sua conta para concluir o registo.",
    greetingName: customerName || DEFAULT_CUSTOMER_NAME,
    intro: "Recebemos o seu registo e falta apenas confirmar a sua conta através do link abaixo.",
    ctaLabel: "Confirmar Conta",
    ctaUrl: verifyUrl,
    expirationLabel: expirationLabel || DEFAULT_EXPIRATION,
    securityNote: "Este link é pessoal e intransmissível.",
    supportAlert: "Caso não reconheça este pedido, contacte o suporte imediatamente.",
    additionalInfo: `Como alternativa, pode utilizar este código de confirmação: ${code}`
  });

  await transporter.sendMail({
    from: env.mail.from,
    to: email,
    subject: "Confirmação da Conta",
    text: template.text,
    html: template.html
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
