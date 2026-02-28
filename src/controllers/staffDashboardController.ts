import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma.js";

type PeriodKey = "day" | "month" | "quarter";
type SalesWindow = "24h" | "7d" | "30d";

const STOCK_MIN = 5;
const GROSS_MARGIN_RATE = 0.34;
const NET_MARGIN_RATE = 0.19;

const RECOGNIZED_ORDER_STATUSES = new Set(["PAID", "SHIPPED"]);
const RECOGNIZED_PAYMENT_STATUSES = new Set(["CAPTURED"]);
const PIPELINE_PAYMENT_STATUSES = new Set(["PENDING", "AUTHORIZED"]);

const toNumber = (v: unknown) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  if (v && typeof v === "object" && "toNumber" in v && typeof (v as { toNumber?: unknown }).toNumber === "function") {
    try {
      const n = (v as { toNumber: () => number }).toNumber();
      return Number.isFinite(n) ? n : 0;
    } catch {
      return 0;
    }
  }
  return 0;
};

const toDate = (v?: string | null | Date) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

function periodRange(period: PeriodKey, now: Date, offset = 0) {
  if (period === "day") {
    const s = addDays(startOfDay(now), offset);
    return { start: s, end: addDays(s, 1) };
  }
  if (period === "month") {
    const s = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return { start: s, end: new Date(s.getFullYear(), s.getMonth() + 1, 1) };
  }
  const qStart = Math.floor(now.getMonth() / 3) * 3 + offset * 3;
  const s = new Date(now.getFullYear(), qStart, 1);
  return { start: s, end: new Date(s.getFullYear(), s.getMonth() + 3, 1) };
}

function channelFromProvider(provider?: string | null) {
  const p = (provider || "").toUpperCase();
  if (p.includes("MPESA") || p.includes("EMOLA")) return "Mobile";
  if (p.includes("PAYPAL")) return "Marketplace";
  if (p.includes("FACEBOOK") || p.includes("INSTAGRAM")) return "Social";
  if (p.includes("STRIPE") || p.includes("COD")) return "Site";
  return "Other";
}

function isRevenueRecognized(order: { status: string; paymentStatus: string }) {
  return RECOGNIZED_ORDER_STATUSES.has(order.status) || RECOGNIZED_PAYMENT_STATUSES.has(order.paymentStatus);
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[index];
}

export const staffDashboardSchema = z.object({
  query: z.object({
    period: z.enum(["day", "month", "quarter"]).optional(),
    window: z.enum(["24h", "7d", "30d"]).optional()
  })
});

export async function getStaffDashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const period = (req.query.period as PeriodKey | undefined) ?? "month";
    const window = (req.query.window as SalesWindow | undefined) ?? "7d";
    const now = new Date();
    const curr = periodRange(period, now);
    const prev = periodRange(period, now, -1);
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const todayStart = startOfDay(now);
    const weekStart = addDays(todayStart, -6);
    const salesStart = window === "24h" ? dayAgo : window === "7d" ? sevenAgo : thirtyAgo;

    const [products, stockItems, orders, payments] = await prisma.$transaction([
      prisma.product.findMany({
        include: { categories: { include: { category: true } } }
      }),
      prisma.stockItem.findMany({
        include: { variant: true }
      }),
      prisma.order.findMany({
        include: { items: true, user: true },
        orderBy: { createdAt: "desc" }
      }),
      prisma.payment.findMany({
        include: { order: true },
        orderBy: { createdAt: "desc" }
      })
    ]);

    const productById = new Map(products.map((p) => [p.id, p]));

    const inCurr = orders.filter((o) => {
      const d = toDate(o.createdAt);
      return d ? d >= curr.start && d < curr.end : false;
    });
    const inPrev = orders.filter((o) => {
      const d = toDate(o.createdAt);
      return d ? d >= prev.start && d < prev.end : false;
    });

    const recognizedCurr = inCurr.filter(isRevenueRecognized);
    const recognizedPrev = inPrev.filter(isRevenueRecognized);
    const recognizedRevenue = recognizedCurr.reduce((sum, o) => sum + toNumber(o.total), 0);
    const recognizedRevenuePrev = recognizedPrev.reduce((sum, o) => sum + toNumber(o.total), 0);
    const expectedRevenue = recognizedRevenuePrev;
    const deltaPct = expectedRevenue > 0 ? ((recognizedRevenue - expectedRevenue) / expectedRevenue) * 100 : 0;
    const avgTicketRecognized = recognizedCurr.length ? recognizedRevenue / recognizedCurr.length : 0;
    const successRatePct = inCurr.length ? (recognizedCurr.length / inCurr.length) * 100 : 0;
    const authorizedRevenue = inCurr
      .filter((o) => o.paymentStatus === "AUTHORIZED" && !isRevenueRecognized({ status: o.status, paymentStatus: "CAPTURED" }))
      .reduce((sum, o) => sum + toNumber(o.total), 0);

    const salesByCategoryCurr = new Map<string, number>();
    const salesByCategoryPrev = new Map<string, number>();
    for (const order of recognizedCurr) {
      for (const item of order.items ?? []) {
        const amount = toNumber(item.priceSnapshot) * toNumber(item.quantity);
        const product = item.productId ? productById.get(item.productId) : null;
        const categoryName = product?.categories?.[0]?.category?.name || "Uncategorized";
        salesByCategoryCurr.set(categoryName, (salesByCategoryCurr.get(categoryName) || 0) + amount);
      }
    }
    for (const order of recognizedPrev) {
      for (const item of order.items ?? []) {
        const amount = toNumber(item.priceSnapshot) * toNumber(item.quantity);
        const product = item.productId ? productById.get(item.productId) : null;
        const categoryName = product?.categories?.[0]?.category?.name || "Uncategorized";
        salesByCategoryPrev.set(categoryName, (salesByCategoryPrev.get(categoryName) || 0) + amount);
      }
    }
    const categoryMix = Array.from(salesByCategoryCurr.entries())
      .map(([label, revenue]) => {
        const prevRevenue = salesByCategoryPrev.get(label) || 0;
        const sharePct = recognizedRevenue > 0 ? (revenue / recognizedRevenue) * 100 : 0;
        const deltaCategoryPct = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0;
        return { label, revenue, sharePct, deltaPct: deltaCategoryPct };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);

    const channelMap = new Map<string, number>();
    for (const payment of payments) {
      const d = toDate(payment.createdAt);
      if (!d || d < curr.start || d >= curr.end) continue;
      if (!RECOGNIZED_PAYMENT_STATUSES.has(payment.status)) continue;
      const channel = channelFromProvider(payment.provider);
      channelMap.set(channel, (channelMap.get(channel) || 0) + toNumber(payment.amount));
    }
    const channelMix = ["Site", "Mobile", "Marketplace", "Social", "Other"].map((label) => ({
      label,
      revenue: channelMap.get(label) || 0
    }));

    const inventoryValue = stockItems.reduce((sum, item) => sum + toNumber(item.variant?.price) * item.onHand, 0);
    const criticalStock = stockItems.filter((i) => i.onHand <= 0);
    const warningStock = stockItems.filter((i) => i.onHand > 0 && i.onHand <= STOCK_MIN);

    const fastMap = new Map<string, number>();
    for (const order of orders) {
      const d = toDate(order.createdAt);
      if (!d || d < dayAgo) continue;
      for (const item of order.items ?? []) {
        const key = item.productId || item.nameSnapshot;
        fastMap.set(key, (fastMap.get(key) || 0) + toNumber(item.quantity));
      }
    }
    const fastValues = Array.from(fastMap.values());
    const dynamicThreshold = Math.max(1, Math.floor(percentile(fastValues, 0.9)));
    const fastMoving = Array.from(fastMap.entries())
      .map(([id, qty]) => ({ id, qty, name: productById.get(id)?.name || id }))
      .filter((entry) => entry.qty >= dynamicThreshold)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 8);

    const pendingOrders = orders.filter((o) => o.status === "PENDING" || o.paymentStatus === "PENDING");
    const problemOrders = orders.filter((o) => o.paymentStatus === "FAILED" || o.paymentStatus === "REFUNDED");
    const delayedOrders = orders.filter((o) => {
      const d = toDate(o.createdAt);
      if (!d) return false;
      return o.status !== "SHIPPED" && o.status !== "CANCELED" && (now.getTime() - d.getTime()) / (1000 * 60 * 60) >= 48;
    });
    const refunds = payments.filter((p) => p.status === "REFUNDED");
    const refundTotal = refunds.reduce((sum, p) => sum + toNumber(p.amount), 0);

    const perfByProduct = new Map<string, { name: string; qty: number; revenue: number; price: number }>();
    for (const order of orders) {
      const d = toDate(order.createdAt);
      if (!d || d < salesStart) continue;
      for (const item of order.items ?? []) {
        const id = item.productId || `legacy:${item.nameSnapshot}`;
        const current = perfByProduct.get(id) || {
          name: productById.get(id)?.name || item.nameSnapshot || "Product",
          qty: 0,
          revenue: 0,
          price: toNumber(productById.get(id)?.basePrice)
        };
        current.qty += toNumber(item.quantity);
        current.revenue += toNumber(item.priceSnapshot) * toNumber(item.quantity);
        perfByProduct.set(id, current);
      }
    }
    const topProducts = Array.from(perfByProduct.entries())
      .map(([id, value]) => ({
        id,
        name: value.name,
        qty: value.qty,
        revenue: value.revenue,
        profitEstimate: value.revenue * NET_MARGIN_RATE
      }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);
    const lowPerformance = products
      .map((product) => ({ id: product.id, name: product.name, sold: perfByProduct.get(product.id)?.qty || 0 }))
      .filter((product) => product.sold === 0)
      .slice(0, 10);
    const highMarginEstimated = products
      .map((product) => ({
        id: product.id,
        name: product.name,
        price: toNumber(product.basePrice),
        grossEstimate: toNumber(product.basePrice) * GROSS_MARGIN_RATE
      }))
      .sort((a, b) => b.grossEstimate - a.grossEstimate)
      .slice(0, 10);

    const revenueToday = orders
      .filter((o) => {
        const d = toDate(o.createdAt);
        return d ? d >= todayStart && isRevenueRecognized(o) : false;
      })
      .reduce((sum, o) => sum + toNumber(o.total), 0);
    const revenueWeek = orders
      .filter((o) => {
        const d = toDate(o.createdAt);
        return d ? d >= weekStart && isRevenueRecognized(o) : false;
      })
      .reduce((sum, o) => sum + toNumber(o.total), 0);
    const revenueMonth = orders
      .filter((o) => {
        const d = toDate(o.createdAt);
        return d ? d >= monthStart && d < monthEnd && isRevenueRecognized(o) : false;
      })
      .reduce((sum, o) => sum + toNumber(o.total), 0);
    const grossEstimateMonth = revenueMonth * GROSS_MARGIN_RATE;
    const netEstimateMonth = revenueMonth * NET_MARGIN_RATE;
    const capturedPayments = payments
      .filter((p) => p.status === "CAPTURED")
      .reduce((sum, p) => sum + toNumber(p.amount), 0);
    const pipelinePayments = payments
      .filter((p) => PIPELINE_PAYMENT_STATUSES.has(p.status))
      .reduce((sum, p) => sum + toNumber(p.amount), 0);
    const projRevenue = (revenueMonth / Math.max(1, now.getDate())) * new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const projNet = projRevenue * NET_MARGIN_RATE;

    const revenueLast30 = orders
      .filter((o) => {
        const d = toDate(o.createdAt);
        return d ? d >= thirtyAgo && isRevenueRecognized(o) : false;
      })
      .reduce((sum, o) => sum + toNumber(o.total), 0);
    const avgDaily = revenueLast30 / 30;
    const demand30 = avgDaily * 30;
    const demand60 = avgDaily * 60;
    const demand90 = avgDaily * 90;

    res.json({
      meta: {
        generatedAt: now.toISOString(),
        period,
        window,
        dataFreshness: "near_realtime",
        metricVersion: "2026.02.v1"
      },
      cockpit: {
        criticalStockCount: criticalStock.length,
        delayedOrdersCount: delayedOrders.length,
        recognizedRevenueToday: revenueToday,
        recognizedRevenueMonth: revenueMonth,
        receivablesPipeline: pipelinePayments,
        actions: [
          { id: "stock", label: "Critical stock", count: criticalStock.length, href: "/gestor/estoque", severity: "high" },
          { id: "delays", label: "Delayed orders", count: delayedOrders.length, href: "/gestor/pedidos", severity: "high" },
          { id: "problems", label: "Problem orders", count: problemOrders.length, href: "/gestor/pedidos", severity: "medium" }
        ]
      },
      salesHealth: {
        recognizedRevenue,
        authorizedRevenue,
        expectedRevenue,
        deltaPct,
        avgTicketRecognized,
        successRatePct,
        categoryMix,
        channelMix
      },
      operations: {
        pendingOrders: pendingOrders.length,
        delayedOrders: delayedOrders.length,
        problemOrders: problemOrders.length,
        refunds: {
          count: refunds.length,
          total: refundTotal
        },
        topPending: pendingOrders.slice(0, 8),
        topDelayed: delayedOrders.slice(0, 8),
        topProblem: problemOrders.slice(0, 8)
      },
      inventory: {
        totalStockValue: inventoryValue,
        criticalCount: criticalStock.length,
        warningCount: warningStock.length,
        fastMovingCount: fastMoving.length,
        fastMovingThreshold24h: dynamicThreshold,
        criticalItems: criticalStock.slice(0, 12),
        fastMoving
      },
      finance: {
        revenueToday,
        revenueWeek,
        revenueMonth,
        grossEstimateMonth,
        netEstimateMonth,
        capturedPayments,
        pipelinePayments,
        projRevenue,
        projNet
      },
      products: {
        topProducts,
        lowPerformance,
        highMarginEstimated
      },
      forecast: {
        demand30,
        demand60,
        demand90,
        categoryTrend: categoryMix.map((item) => ({ label: item.label, revenue: item.revenue, deltaPct: item.deltaPct }))
      }
    });
  } catch (err) {
    next(err);
  }
}
