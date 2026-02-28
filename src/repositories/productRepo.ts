import { prisma } from "../config/prisma.js";

export const productRepo = {
  listPublic() {
    return prisma.product.findMany({
      where: {
        status: "ACTIVE",
        variants: { some: { stockItem: { is: { onHand: { gt: 0 } } } } }
      },
      include: {
        images: true,
        variants: { where: { stockItem: { is: { onHand: { gt: 0 } } } } },
        categories: { include: { category: true } }
      }
    });
  },
  findById(id: string) {
    return prisma.product.findFirst({
      where: {
        id,
        status: "ACTIVE",
        variants: { some: { stockItem: { is: { onHand: { gt: 0 } } } } }
      },
      include: {
        images: true,
        variants: { where: { stockItem: { is: { onHand: { gt: 0 } } } } },
        categories: { include: { category: true } }
      }
    });
  },
  create(data: any) {
    return prisma.product.create({ data });
  },
  update(id: string, data: any) {
    return prisma.product.update({ where: { id }, data });
  }
};
