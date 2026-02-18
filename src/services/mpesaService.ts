import crypto from "crypto";

type MpesaConfig = {
  baseUrl: string;
  apiKey: string;
  publicKey: string;
  serviceProviderCode: string;
  c2bPath: string;
  sessionPath: string;
  market: string;
  environment: string;
  country: string;
  currency: string;
  purchasedItemsDesc: string;
  sessionDelayMs: number;
  origin?: string;
  timeoutMs: number;
};

export type MpesaPaymentResult = {
  ok: boolean;
  responseCode: string | null;
  responseDesc: string | null;
  transactionId: string | null;
  raw: unknown;
};

type MpesaPaymentInput = {
  amount: number;
  customerMsisdn: string;
  orderId: string;
  paymentId: string;
};

const DEFAULT_C2B_PATH = "/ipg/v2/[market]/c2bPayment/singleStage/";

function getMpesaConfig(): MpesaConfig {
  const baseUrl = process.env.MPESA_BASE_URL;
  const apiKey = process.env.MPESA_API_KEY;
  const publicKey = process.env.MPESA_PUBLIC_KEY;
  const serviceProviderCode = process.env.MPESA_SERVICE_PROVIDER_CODE;
  if (!baseUrl || !apiKey || !publicKey || !serviceProviderCode) {
    throw new Error("MPESA credentials not configured");
  }
  const market = process.env.MPESA_MARKET || "vodacomMOZ";
  const environment = process.env.MPESA_ENVIRONMENT || "sandbox";
  const baseUrlLower = baseUrl.toLowerCase();
  const isVmHost = baseUrlLower.includes("vm.co.mz");
  const defaultSessionPath = isVmHost
    ? `/ipg/v2/${market}/getSession/`
    : `/${environment}/ipg/v2/${market}/getSession/`;
  const defaultC2bPath = isVmHost
    ? DEFAULT_C2B_PATH.replace("[market]", market)
    : `/${environment}${DEFAULT_C2B_PATH.replace("[market]", market)}`;
  const sessionPath = process.env.MPESA_SESSION_PATH || defaultSessionPath;
  return {
    baseUrl,
    apiKey,
    publicKey,
    serviceProviderCode,
    c2bPath: process.env.MPESA_C2B_PATH || defaultC2bPath,
    sessionPath,
    market,
    environment,
    country: process.env.MPESA_COUNTRY || "MOZ",
    currency: process.env.MPESA_CURRENCY || "MZN",
    purchasedItemsDesc: process.env.MPESA_PURCHASE_DESC || "AMBEBE purchase",
    sessionDelayMs: Number(process.env.MPESA_SESSION_DELAY_MS || 0),
    origin: process.env.MPESA_ORIGIN || undefined,
    timeoutMs: Number(process.env.MPESA_TIMEOUT_MS || 15000)
  };
}

function normalizePublicKey(key: string) {
  const trimmed = key.trim();
  if (trimmed.includes("BEGIN PUBLIC KEY")) {
    return trimmed;
  }
  const body = trimmed.replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g)?.join("\n") ?? body;
  return `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----`;
}

function buildMpesaToken(value: string, publicKey: string) {
  const pem = normalizePublicKey(publicKey);
  const encrypted = crypto.publicEncrypt(
    { key: pem, padding: crypto.constants.RSA_PKCS1_PADDING },
    Buffer.from(value)
  );
  return encrypted.toString("base64");
}

function safeJsonParse(payload: string) {
  if (!payload) return null;
  try {
    return JSON.parse(payload);
  } catch {
    return payload;
  }
}

function extractString(payload: unknown, keys: string[]) {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return null;
}

function makeReference(prefix: string, id: string) {
  const compact = id.replace(/-/g, "").toUpperCase();
  return `${prefix}${compact.slice(0, 12)}`;
}

type MpesaSessionResult = {
  ok: boolean;
  responseCode: string | null;
  responseDesc: string | null;
  sessionId: string | null;
  raw: unknown;
};

async function createMpesaSession(config: MpesaConfig): Promise<MpesaSessionResult> {
  const token = buildMpesaToken(config.apiKey, config.publicKey);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(`${config.baseUrl}${config.sessionPath}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(config.origin ? { Origin: config.origin } : {})
      },
      signal: controller.signal
    });
    const text = await response.text();
    const data = safeJsonParse(text);
    const responseCode = extractString(data, ["output_ResponseCode", "responseCode", "code"]);
    const responseDesc = extractString(data, ["output_ResponseDesc", "responseDesc", "message"]);
    const sessionId = extractString(data, ["output_SessionID", "sessionId", "sessionID"]);
    const ok = response.ok && (!!sessionId || responseCode === "INS-0" || responseCode === "0");
    return { ok, responseCode, responseDesc, sessionId, raw: data };
  } finally {
    clearTimeout(timeout);
  }
}

export function normalizeMpesaMsisdn(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (!digits) {
    throw new Error("Numero M-PESA invalido");
  }
  let normalized = digits;
  if (digits.startsWith("258")) {
    normalized = digits;
  } else if (digits.startsWith("0")) {
    normalized = `258${digits.slice(1)}`;
  } else if (digits.length === 9) {
    normalized = `258${digits}`;
  }
  if (normalized.length < 9 || normalized.length > 15) {
    throw new Error("Numero M-PESA invalido");
  }
  return normalized;
}

export async function createMpesaPayment(input: MpesaPaymentInput): Promise<MpesaPaymentResult> {
  const config = getMpesaConfig();
  let session: MpesaSessionResult | null = null;
  try {
    session = await createMpesaSession(config);
  } catch (error) {
    return {
      ok: false,
      responseCode: null,
      responseDesc: error instanceof Error ? error.message : "Falha ao iniciar sessao M-PESA",
      transactionId: null,
      raw: { error: error instanceof Error ? error.message : error }
    };
  }
  if (!session.ok || !session.sessionId) {
    return {
      ok: false,
      responseCode: session.responseCode,
      responseDesc: session.responseDesc ?? "Falha ao iniciar sessao M-PESA",
      transactionId: null,
      raw: { session: session.raw }
    };
  }

  if (config.sessionDelayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, config.sessionDelayMs));
  }

  const sessionToken = buildMpesaToken(session.sessionId, config.publicKey);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  const payload = {
    input_TransactionReference: makeReference("TX", input.paymentId),
    input_CustomerMSISDN: input.customerMsisdn,
    input_Amount: Number(input.amount).toFixed(2),
    input_Country: config.country,
    input_Currency: config.currency,
    input_ServiceProviderCode: config.serviceProviderCode,
    input_ThirdPartyConversationID: makeReference("TP", input.orderId),
    input_PurchasedItemsDesc: config.purchasedItemsDesc
  };

  try {
    const response = await fetch(`${config.baseUrl}${config.c2bPath}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        "Content-Type": "application/json",
        ...(config.origin ? { Origin: config.origin } : {})
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const text = await response.text();
    const data = safeJsonParse(text);
    const responseCode = extractString(data, ["output_ResponseCode", "responseCode", "code"]);
    const responseDesc = extractString(data, ["output_ResponseDesc", "responseDesc", "message"]);
    const transactionId = extractString(data, ["output_TransactionID", "transactionId", "output_TransactionId"]);
    const conversationId = extractString(data, ["output_ConversationID", "conversationId"]);
    const thirdPartyConversationId = extractString(data, ["output_ThirdPartyConversationID"]);

    const ok =
      response.ok &&
      (!responseCode || responseCode === "INS-0" || responseCode === "0" || responseCode.toLowerCase() === "success");

    return {
      ok,
      responseCode,
      responseDesc,
      transactionId,
      raw: { session: session.raw, payment: data, conversationId, thirdPartyConversationId }
    };
  } finally {
    clearTimeout(timeout);
  }
}
