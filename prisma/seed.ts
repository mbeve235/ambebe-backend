import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

const permissions = [
  { code: "product:create", description: "Create products" },
  { code: "product:update", description: "Update products" },
  { code: "product:delete", description: "Delete products" },
  { code: "order:read", description: "Read orders" },
  { code: "order:updateStatus", description: "Update order status" },
  { code: "user:manage", description: "Manage users" }
];

const roles = [
  { name: "customer", perms: [] as string[] },
  { name: "manager", perms: ["product:create", "product:update", "order:read", "order:updateStatus"] },
  { name: "admin", perms: ["product:create", "product:update", "product:delete", "order:read", "order:updateStatus", "user:manage"] }
];

async function main() {
  for (const perm of permissions) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: { description: perm.description },
      create: perm
    });
  }

  for (const role of roles) {
    const roleRecord = await prisma.role.upsert({
      where: { name: role.name },
      update: {},
      create: { name: role.name }
    });

    const perms = await prisma.permission.findMany({
      where: { code: { in: role.perms } }
    });

    for (const perm of perms) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: roleRecord.id, permissionId: perm.id } },
        update: {},
        create: { roleId: roleRecord.id, permissionId: perm.id }
      });
    }
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const adminName = process.env.SEED_ADMIN_NAME || "Admin";

  if (adminEmail && adminPassword) {
    const adminRole = await prisma.role.findUnique({ where: { name: "admin" } });
    if (!adminRole) {
      throw new Error("Admin role not found");
    }

    const passwordHash = await argon2.hash(adminPassword);
    const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          name: adminName,
          roleId: adminRole.id
        }
      });
    } else {
      await prisma.user.create({
        data: {
          email: adminEmail,
          passwordHash,
          name: adminName,
          roleId: adminRole.id
        }
      });
    }
  }

  const couponCode = process.env.SEED_COUPON_CODE;
  const couponValue = process.env.SEED_COUPON_VALUE;
  const couponType = (process.env.SEED_COUPON_TYPE || "PERCENT").toUpperCase();
  if (couponCode && couponValue) {
    const normalizedCode = couponCode.trim().toUpperCase();
    const value = Number(couponValue);
    if (!Number.isNaN(value) && (couponType === "PERCENT" || couponType === "FIXED")) {
      const minSubtotal = process.env.SEED_COUPON_MIN_SUBTOTAL;
      const maxRedemptions = process.env.SEED_COUPON_MAX_REDEMPTIONS;
      await prisma.coupon.upsert({
        where: { code: normalizedCode },
        update: {
          type: couponType,
          value,
          minSubtotal: minSubtotal ? Number(minSubtotal) : undefined,
          maxRedemptions: maxRedemptions ? Number(maxRedemptions) : undefined,
          isActive: true
        },
        create: {
          code: normalizedCode,
          type: couponType,
          value,
          minSubtotal: minSubtotal ? Number(minSubtotal) : undefined,
          maxRedemptions: maxRedemptions ? Number(maxRedemptions) : undefined,
          isActive: true
        }
      });
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
