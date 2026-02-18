import { prisma } from "../config/prisma.js";
import { Prisma } from "@prisma/client";

type OrderItemLike = {
  productId?: string | null;
  nameSnapshot: string;
  priceSnapshot: number | string | Prisma.Decimal;
  quantity: number;
};

export type StripeLineItemInput = {
  name: string;
  unitAmount: number;
  quantity: number;
  images?: string[];
};

const buildAbsoluteUrl = (url: string, baseUrl?: string) => {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  if (!baseUrl) return null;
  const sanitizedBase = baseUrl.replace(/\/+$/, "");
  const prefix = url.startsWith("/") ? "" : "/";
  return `${sanitizedBase}${prefix}${url}`;
};

export async function buildStripeLineItems(items: OrderItemLike[], assetBaseUrl?: string) {
  const productIds = items.map((item) => item.productId).filter((id): id is string => Boolean(id));
  const images = productIds.length
    ? await prisma.productImage.findMany({
        where: { productId: { in: productIds } },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
      })
    : [];

  const imageMap = new Map<string, string>();
  for (const image of images) {
    if (!imageMap.has(image.productId)) {
      imageMap.set(image.productId, image.url);
    }
  }

  return items.map<StripeLineItemInput>((item) => {
    const imageUrl = item.productId ? imageMap.get(item.productId) : null;
    const absoluteImage = imageUrl ? buildAbsoluteUrl(imageUrl, assetBaseUrl) : null;
    return {
      name: item.nameSnapshot,
      unitAmount: Number(item.priceSnapshot),
      quantity: item.quantity,
      images: absoluteImage ? [absoluteImage] : undefined
    };
  });
}
