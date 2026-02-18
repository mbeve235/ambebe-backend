import { prisma } from "../config/prisma.js";

export const productRepo = {
  listPublic() {
    return prisma.product.findMany({
      where: { status: "ACTIVE" },
      include: { images: true, variants: true, categories: { include: { category: true } } }
    });
  },
  findById(id: string) {
    return prisma.product.findUnique({
      where: { id },
      include: { images: true, variants: true, categories: { include: { category: true } } }
    });
  },
  create(data: any) {
    return prisma.product.create({ data });
  },
  update(id: string, data: any) {
    return prisma.product.update({ where: { id }, data });
  }
};
