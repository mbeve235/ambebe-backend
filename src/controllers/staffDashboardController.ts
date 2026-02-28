import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma.js";

type PeriodKey = "day" | "month" | "quarter";
type SalesWindow = "24h" | "7d" | "30d";

const STOCK_MIN = 5;
const RECOGNIZED_ORDER_STATUSES = new Set(["PAID", "SHIPPED"]);
const RECOGNIZED_PAYMENT_STATUSES = new Set(["CAPTURED"]);
const PIPELINE_PAYMENT_STATUSES = new Set(["PENDING", "AUTHORIZED"]);

const TAX_RATE = Number(process.env.DASHBOARD_TAX_RATE ?? 0.16);
const OPERATING_EXPENSE_RATE = Number(process.env.DASHBOARD_OPERATING_EXPENSE_RATE ?? 0.04);
const DEFAULT_FREIGHT_SUBSIDY_PER_ORDER = Number(process.env.DASHBOARD_FREIGHT_SUBSIDY_PER_ORDER ?? 0);
const PROJECTION_GROWTH_WEIGHT = Number(process.env.DASHBOARD_PROJECTION_GROWTH_WEIGHT ?? 0.55);

const gatewayFeeByProvider: Record<string, { fixed: number; variable: number }> = {
  STRIPE: { fixed: 0, variable: 0.039 },
  MPESA: { fixed: 0, variable: 0.02 },
  EMOLA: { fixed: 0, variable: 0.02 },
  PAYPAL: { fixed: 0, variable: 0.045 },
  COD: { fixed: 0, variable: 0 }
};

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
  if (order.status === "CANCELED") return false;
  if (order.paymentStatus === "REFUNDED" || order.paymentStatus === "FAILED") return false;
  return RECOGNIZED_ORDER_STATUSES.has(order.status) || RECOGNIZED_PAYMENT_STATUSES.has(order.paymentStatus);
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[index];
}

function extractCostPriceSnapshot(
  attributesSnapshot: unknown,
  variantId: string | null | undefined,
  variantCostMap: Map<string, number>
) {
  if (attributesSnapshot && typeof attributesSnapshot === "object" && !Array.isArray(attributesSnapshot)) {
    const source = attributesSnapshot as Record<string, unknown>;
    const snapshot = toNumber(source.costPriceSnapshot ?? source.costPrice ?? source.cost ?? source.cmv);
    if (snapshot > 0) return snapshot;
  }
  return variantId ? variantCostMap.get(variantId) ?? 0 : 0;
}

function getGatewayFeeTotal(provider: string | null | undefined, orderNetRevenue: number) {
  const key = (provider || "").toUpperCase();
  const cfg = gatewayFeeByProvider[key] ?? { fixed: 0, variable: 0.03 };
  return Math.max(0, cfg.fixed + orderNetRevenue * cfg.variable);
}

type ItemFinancial = {
  orderId: string;
  orderCreatedAt: Date;
  productId: string | null;
  productName: string;
  categoryName: string;
  channel: string;
  quantity: number;
  grossRevenue: number;
  discountAllocated: number;
  netRevenue: number;
  cmv: number;
  gatewayFee: number;
  tax: number;
  freightSubsidy: number;
  grossProfit: number;
  operationalProfit: number;
  netProfit: number;
};

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
    const ninetyAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const todayStart = startOfDay(now);
    const weekStart = addDays(todayStart, -6);
    const salesStart = window === "24h" ? dayAgo : window === "7d" ? sevenAgo : thirtyAgo;

    const [products, stockItems, orders, payments] = await prisma.$transaction([
      prisma.product.findMany({
        include: {
          variants: true,
          categories: { include: { category: true } }
        }
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
    const variantCostMap = new Map<string, number>();
    for (const product of products) {
      for (const variant of product.variants) {
        const attrs = variant.attributes;
        let cost = 0;
        if (attrs && typeof attrs === "object" && !Array.isArray(attrs)) {
          const source = attrs as Record<string, unknown>;
          cost = toNumber(source.costPrice ?? source.cost ?? source.cmv);
        }
        variantCostMap.set(variant.id, cost);
      }
    }

    const paymentByOrderId = new Map<string, string | null>();
    for (const payment of payments) {
      if (!paymentByOrderId.has(payment.orderId)) {
        paymentByOrderId.set(payment.orderId, payment.provider ?? null);
      }
    }

    const recognizedOrders = orders.filter(isRevenueRecognized);
    const itemFinancials: ItemFinancial[] = [];
    for (const order of recognizedOrders) {
      const createdAt = toDate(order.createdAt);
      if (!createdAt) continue;
      const orderGross = (order.items ?? []).reduce((sum, item) => sum + toNumber(item.priceSnapshot) * toNumber(item.quantity), 0);
      if (orderGross <= 0) continue;

      const orderDiscount = toNumber(order.discountTotal);
      const orderNetBeforeCosts = Math.max(0, orderGross - orderDiscount);
      const provider = paymentByOrderId.get(order.id) ?? null;
      const gatewayFeeTotal = getGatewayFeeTotal(provider, orderNetBeforeCosts);
      const freightSubsidyTotal = DEFAULT_FREIGHT_SUBSIDY_PER_ORDER;
      const channel = channelFromProvider(provider);

      for (const item of order.items ?? []) {
        const qty = Math.max(0, toNumber(item.quantity));
        if (qty <= 0) continue;
        const unitPrice = toNumber(item.priceSnapshot);
        const grossRevenue = unitPrice * qty;
        const weight = orderGross > 0 ? grossRevenue / orderGross : 0;
        const discountAllocated = orderDiscount * weight;
        const netRevenue = Math.max(0, grossRevenue - discountAllocated);
        const costUnit = extractCostPriceSnapshot(item.attributesSnapshot, item.variantId, variantCostMap);
        const cmv = costUnit * qty;
        const gatewayFee = gatewayFeeTotal * weight;
        const freightSubsidy = freightSubsidyTotal * weight;
        const tax = netRevenue * TAX_RATE;
        const grossProfit = netRevenue - cmv;
        const operationalProfit = grossProfit - gatewayFee - tax - freightSubsidy;
        const netProfit = operationalProfit - netRevenue * OPERATING_EXPENSE_RATE;

        const product = item.productId ? productById.get(item.productId) : null;
        const categoryName = product?.categories?.[0]?.category?.name || "Uncategorized";

        itemFinancials.push({
          orderId: order.id,
          orderCreatedAt: createdAt,
          productId: item.productId,
          productName: product?.name || item.nameSnapshot || "Product",
          categoryName,
          channel,
          quantity: qty,
          grossRevenue,
          discountAllocated,
          netRevenue,
          cmv,
          gatewayFee,
          tax,
          freightSubsidy,
          grossProfit,
          operationalProfit,
          netProfit
        });
      }
    }

    const inCurrOrders = recognizedOrders.filter((order) => {
      const d = toDate(order.createdAt);
      return d ? d >= curr.start && d < curr.end : false;
    });
    const inPrevOrders = recognizedOrders.filter((order) => {
      const d = toDate(order.createdAt);
      return d ? d >= prev.start && d < prev.end : false;
    });

    const inCurrItems = itemFinancials.filter((item) => item.orderCreatedAt >= curr.start && item.orderCreatedAt < curr.end);
    const inPrevItems = itemFinancials.filter((item) => item.orderCreatedAt >= prev.start && item.orderCreatedAt < prev.end);

    const revenueGrossCurr = inCurrItems.reduce((sum, item) => sum + item.grossRevenue, 0);
    const revenueNetCurr = inCurrItems.reduce((sum, item) => sum + item.netRevenue, 0);
    const cmvCurr = inCurrItems.reduce((sum, item) => sum + item.cmv, 0);
    const gatewayFeeCurr = inCurrItems.reduce((sum, item) => sum + item.gatewayFee, 0);
    const taxCurr = inCurrItems.reduce((sum, item) => sum + item.tax, 0);
    const freightCurr = inCurrItems.reduce((sum, item) => sum + item.freightSubsidy, 0);
    const grossProfitCurr = inCurrItems.reduce((sum, item) => sum + item.grossProfit, 0);
    const operationalProfitCurr = inCurrItems.reduce((sum, item) => sum + item.operationalProfit, 0);
    const netProfitCurr = inCurrItems.reduce((sum, item) => sum + item.netProfit, 0);

    const revenueNetPrev = inPrevItems.reduce((sum, item) => sum + item.netRevenue, 0);
    const expectedRevenue = revenueNetPrev;
    const deltaPct = expectedRevenue > 0 ? ((revenueNetCurr - expectedRevenue) / expectedRevenue) * 100 : 0;
    const avgTicketRecognized = inCurrOrders.length ? revenueNetCurr / inCurrOrders.length : 0;
    const successRatePct = orders.length ? (inCurrOrders.length / Math.max(1, orders.filter((o) => { const d = toDate(o.createdAt); return d ? d >= curr.start && d < curr.end : false; }).length)) * 100 : 0;
    const authorizedRevenue = orders
      .filter((o) => {
        const d = toDate(o.createdAt);
        return d ? d >= curr.start && d < curr.end && o.paymentStatus === "AUTHORIZED" && o.status !== "CANCELED" : false;
      })
      .reduce((sum, o) => sum + toNumber(o.total), 0);

    const salesByCategoryCurr = new Map<string, number>();
    const salesByCategoryPrev = new Map<string, number>();
    for (const item of inCurrItems) {
      salesByCategoryCurr.set(item.categoryName, (salesByCategoryCurr.get(item.categoryName) || 0) + item.netRevenue);
    }
    for (const item of inPrevItems) {
      salesByCategoryPrev.set(item.categoryName, (salesByCategoryPrev.get(item.categoryName) || 0) + item.netRevenue);
    }
    const categoryMix = Array.from(salesByCategoryCurr.entries())
      .map(([label, revenue]) => {
        const prevRevenue = salesByCategoryPrev.get(label) || 0;
        const sharePct = revenueNetCurr > 0 ? (revenue / revenueNetCurr) * 100 : 0;
        const deltaCategoryPct = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0;
        return { label, revenue, sharePct, deltaPct: deltaCategoryPct };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);

    const channelMap = new Map<string, number>();
    for (const item of inCurrItems) {
      channelMap.set(item.channel, (channelMap.get(item.channel) || 0) + item.netRevenue);
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
      if (!isRevenueRecognized(order)) continue;
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

    const windowItems = itemFinancials.filter((item) => item.orderCreatedAt >= salesStart);
    const perfByProduct = new Map<string, { name: string; qty: number; revenue: number; netProfit: number }>();
    for (const item of windowItems) {
      const id = item.productId || `legacy:${item.productName}`;
      const current = perfByProduct.get(id) || {
        name: item.productName,
        qty: 0,
        revenue: 0,
        netProfit: 0
      };
      current.qty += item.quantity;
      current.revenue += item.netRevenue;
      current.netProfit += item.netProfit;
      perfByProduct.set(id, current);
    }
    const topProducts = Array.from(perfByProduct.entries())
      .map(([id, value]) => ({
        id,
        name: value.name,
        qty: value.qty,
        revenue: value.revenue,
        profitEstimate: value.netProfit
      }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);
    const lowPerformance = products
      .map((product) => ({ id: product.id, name: product.name, sold: perfByProduct.get(product.id)?.qty || 0 }))
      .filter((product) => product.sold === 0)
      .slice(0, 10);
    const highMarginEstimated = products
      .map((product) => {
        const variantCosts = product.variants
          .map((variant) => {
            const attrs = variant.attributes;
            if (attrs && typeof attrs === "object" && !Array.isArray(attrs)) {
              const source = attrs as Record<string, unknown>;
              return toNumber(source.costPrice ?? source.cost ?? source.cmv);
            }
            return 0;
          })
          .filter((cost) => cost > 0);
        const avgCost = variantCosts.length ? variantCosts.reduce((sum, value) => sum + value, 0) / variantCosts.length : 0;
        const grossEstimate = Math.max(0, toNumber(product.basePrice) - avgCost);
        return {
          id: product.id,
          name: product.name,
          price: toNumber(product.basePrice),
          grossEstimate
        };
      })
      .sort((a, b) => b.grossEstimate - a.grossEstimate)
      .slice(0, 10);

    const monthItems = itemFinancials.filter((item) => item.orderCreatedAt >= monthStart && item.orderCreatedAt < monthEnd);
    const revenueToday = itemFinancials.filter((item) => item.orderCreatedAt >= todayStart).reduce((sum, item) => sum + item.netRevenue, 0);
    const revenueWeek = itemFinancials.filter((item) => item.orderCreatedAt >= weekStart).reduce((sum, item) => sum + item.netRevenue, 0);
    const revenueMonth = monthItems.reduce((sum, item) => sum + item.netRevenue, 0);
    const grossEstimateMonth = monthItems.reduce((sum, item) => sum + item.grossProfit, 0);
    const netEstimateMonth = monthItems.reduce((sum, item) => sum + item.netProfit, 0);
    const capturedPayments = payments.filter((p) => p.status === "CAPTURED").reduce((sum, p) => sum + toNumber(p.amount), 0);
    const pipelinePayments = payments.filter((p) => PIPELINE_PAYMENT_STATUSES.has(p.status)).reduce((sum, p) => sum + toNumber(p.amount), 0);

    const historical90Orders = orders.filter((order) => {
      const d = toDate(order.createdAt);
      return d ? d >= ninetyAgo : false;
    });
    const historical90Recognized = itemFinancials.filter((item) => item.orderCreatedAt >= ninetyAgo);
    const netRevenue90 = historical90Recognized.reduce((sum, item) => sum + item.netRevenue, 0);
    const netProfit90 = historical90Recognized.reduce((sum, item) => sum + item.netProfit, 0);
    const netMargin90 = netRevenue90 > 0 ? netProfit90 / netRevenue90 : 0;

    const daysInWindow = 90;
    const recognizedOrderCount90 = new Set(historical90Recognized.map((item) => item.orderId)).size;
    const ordersPerDay90 = recognizedOrderCount90 / daysInWindow;

    const revenueLast14 = itemFinancials
      .filter((item) => item.orderCreatedAt >= addDays(now, -14))
      .reduce((sum, item) => sum + item.netRevenue, 0);
    const revenuePrev14 = itemFinancials
      .filter((item) => item.orderCreatedAt >= addDays(now, -28) && item.orderCreatedAt < addDays(now, -14))
      .reduce((sum, item) => sum + item.netRevenue, 0);
    const growthRecent = revenuePrev14 > 0 ? (revenueLast14 - revenuePrev14) / revenuePrev14 : 0;
    const growthAdjusted = Math.max(-0.35, Math.min(0.5, growthRecent * PROJECTION_GROWTH_WEIGHT));

    const aov30Base = (() => {
      const items30 = itemFinancials.filter((item) => item.orderCreatedAt >= thirtyAgo);
      const orders30 = new Set(items30.map((item) => item.orderId)).size;
      const rev30 = items30.reduce((sum, item) => sum + item.netRevenue, 0);
      return orders30 > 0 ? rev30 / orders30 : 0;
    })();
    const aov60Base = (() => {
      const start = addDays(now, -60);
      const items60 = itemFinancials.filter((item) => item.orderCreatedAt >= start);
      const orders60 = new Set(items60.map((item) => item.orderId)).size;
      const rev60 = items60.reduce((sum, item) => sum + item.netRevenue, 0);
      return orders60 > 0 ? rev60 / orders60 : 0;
    })();
    const aov90Base = (() => {
      const orders90 = new Set(historical90Recognized.map((item) => item.orderId)).size;
      return orders90 > 0 ? netRevenue90 / orders90 : 0;
    })();
    const projectedTicket = aov30Base * 0.5 + aov60Base * 0.3 + aov90Base * 0.2;

    const canceled90 = historical90Orders.filter((order) => order.status === "CANCELED" || order.paymentStatus === "FAILED" || order.paymentStatus === "REFUNDED").length;
    const cancelRate90 = historical90Orders.length ? canceled90 / historical90Orders.length : 0;

    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const remainingDays = Math.max(0, daysInMonth - now.getDate());
    const projectedOrdersRemaining = Math.max(0, ordersPerDay90 * (1 + growthAdjusted) * remainingDays);
    const projectedRevenueRemainingRaw = projectedOrdersRemaining * projectedTicket;
    const projectedRevenueRemaining = projectedRevenueRemainingRaw * (1 - cancelRate90);
    const projectedNetRemaining = projectedRevenueRemaining * netMargin90;

    const projRevenue = revenueMonth + projectedRevenueRemaining;
    const projNet = netEstimateMonth + projectedNetRemaining;

    const avgDaily = netRevenue90 / 90;
    const demand30 = avgDaily * 30;
    const demand60 = avgDaily * 60;
    const demand90 = avgDaily * 90;

    res.json({
      meta: {
        generatedAt: now.toISOString(),
        period,
        window,
        dataFreshness: "near_realtime",
        metricVersion: "2026.02.v2-cmv",
        assumptions: {
          taxRate: TAX_RATE,
          operatingExpenseRate: OPERATING_EXPENSE_RATE,
          freightSubsidyPerOrder: DEFAULT_FREIGHT_SUBSIDY_PER_ORDER,
          projectionGrowthWeight: PROJECTION_GROWTH_WEIGHT
        }
      },
      cockpit: {
        criticalStockCount: criticalStock.length,
        delayedOrdersCount: delayedOrders.length,
        recognizedRevenueToday: revenueToday,
        recognizedRevenueMonth: revenueMonth,
        receivablesPipeline: pipelinePayments,
        actions: [
          { id: "stock", label: "Critical stock", count: criticalStock.length, href: "/gestor/estoque", severity: "high" },
          { id: "delays", label: "Delayed orders", count: delayedOrders.length, href: "/gestor/pedidos?preset=delayed", severity: "high" },
          { id: "problems", label: "Problem orders", count: problemOrders.length, href: "/gestor/pedidos?preset=problem", severity: "medium" }
        ]
      },
      salesHealth: {
        recognizedRevenue: revenueNetCurr,
        authorizedRevenue,
        expectedRevenue,
        deltaPct,
        avgTicketRecognized,
        successRatePct,
        categoryMix,
        channelMix,
        revenueGross: revenueGrossCurr,
        revenueNet: revenueNetCurr,
        cmv: cmvCurr,
        gatewayFees: gatewayFeeCurr,
        taxes: taxCurr,
        freightSubsidy: freightCurr,
        grossProfit: grossProfitCurr,
        operationalProfit: operationalProfitCurr,
        netProfit: netProfitCurr
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
        projNet,
        profitModel: {
          realizedNetProfitMonth: netEstimateMonth,
          projectedNetProfitMonth: projNet,
          projectedRevenueRemaining,
          projectedOrdersRemaining,
          projectedTicket,
          recentGrowthPct: growthRecent * 100,
          averageCancelRatePct: cancelRate90 * 100
        }
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

