import Stripe from "stripe";
import { env } from "../config/env.js";

let stripeClient: Stripe | null = null;

const getStripeClient = () => {
  if (stripeClient) return stripeClient;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY not configured");
  }
  stripeClient = new Stripe(secretKey, { apiVersion: "2023-10-16" });
  return stripeClient;
};

type StripeSessionInput = {
  orderId: string;
  paymentId: string;
  amount?: number;
  currency: string;
  customerEmail?: string | null;
  lineItems?: StripeLineItemInput[];
};

export type StripeLineItemInput = {
  name: string;
  unitAmount: number;
  quantity: number;
  images?: string[];
};

export async function createStripeCheckoutSession(input: StripeSessionInput) {
  const stripe = getStripeClient();
  const orderNumber = input.orderId.slice(0, 8).toUpperCase();
  const successUrl =
    process.env.STRIPE_SUCCESS_URL ||
    `${env.appBaseUrl}/cliente/pedidos/${input.orderId}?stripe=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl =
    process.env.STRIPE_CANCEL_URL || `${env.appBaseUrl}/cliente/pedidos/${input.orderId}?stripe=cancel`;

  const lineItems = input.lineItems?.length
    ? input.lineItems.map((item) => ({
        quantity: Math.max(1, item.quantity),
        price_data: {
          currency: input.currency.toLowerCase(),
          unit_amount: Math.max(0, Math.round(item.unitAmount * 100)),
          product_data: {
            name: item.name,
            images: item.images?.length ? item.images.slice(0, 8) : undefined
          }
        }
      }))
    : [
        {
          quantity: 1,
          price_data: {
            currency: input.currency.toLowerCase(),
            unit_amount: Math.max(0, Math.round((input.amount ?? 0) * 100)),
            product_data: {
              name: `Pedido #${orderNumber}`
            }
          }
        }
      ];

  if (!lineItems.length) {
    throw new Error("Stripe line items missing");
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer_email: input.customerEmail ?? undefined,
    payment_intent_data: {
      metadata: {
        orderId: input.orderId,
        paymentId: input.paymentId
      }
    },
    line_items: lineItems,
    metadata: {
      orderId: input.orderId,
      paymentId: input.paymentId
    }
  });

  if (!session.url) {
    throw new Error("Stripe session URL not available");
  }

  return { id: session.id, url: session.url };
}

export async function getStripeCheckoutSession(sessionId: string) {
  const stripe = getStripeClient();
  return stripe.checkout.sessions.retrieve(sessionId);
}

export function constructStripeEvent(payload: Buffer, signature: string) {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET not configured");
  }
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}
