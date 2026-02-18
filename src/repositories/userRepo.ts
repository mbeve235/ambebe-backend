import { prisma } from "../config/prisma.js";

export const userRepo = {
  findByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
      include: { role: true }
    });
  },
  findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      include: { role: true }
    });
  }
};
