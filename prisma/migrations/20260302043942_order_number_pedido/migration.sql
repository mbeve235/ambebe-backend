/*
  Warnings:

  - A unique constraint covering the columns `[orderNumber]` on the table `Order` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "customerEmailSnapshot" VARCHAR(255),
ADD COLUMN     "customerNameSnapshot" VARCHAR(120),
ADD COLUMN     "customerPhoneSnapshot" VARCHAR(30),
ADD COLUMN     "orderNumber" VARCHAR(24),
ADD COLUMN     "shippingAddressSnapshot" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_paymentStatus_idx" ON "Order"("paymentStatus");

-- CreateIndex
CREATE INDEX "Order_userId_idx" ON "Order"("userId");

-- CreateIndex
CREATE INDEX "Order_total_idx" ON "Order"("total");

-- CreateIndex
CREATE INDEX "Order_customerEmailSnapshot_idx" ON "Order"("customerEmailSnapshot");

-- CreateIndex
CREATE INDEX "Order_customerPhoneSnapshot_idx" ON "Order"("customerPhoneSnapshot");
