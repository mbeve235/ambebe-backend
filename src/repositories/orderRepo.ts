import { prisma } from "../config/prisma.js";

export const orderRepo = {
  listByUser(userId: string) {
    return prisma.order.findMany({
      where: { userId },
      include: { items: true, payment: true }
    });
  },
  listAll() {
    return prisma.order.findMany({
      include: { items: true, payment: true, user: true }
    });
  }
};
