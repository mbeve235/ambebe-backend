import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import {
  getProfile,
  updateProfile,
  updateProfileSchema,
  updatePassword,
  updatePasswordSchema,
  listAddresses,
  createAddress,
  addressSchema,
  updateAddress,
  updateAddressSchema,
  deleteAddress,
  setDefaultAddress,
  listSessions,
  revokeSession,
  getCart,
  addItem,
  addCartItemSchema,
  updateItem,
  updateCartItemSchema,
  deleteItem,
  clearCart,
  upsertCartItemByVariant,
  upsertCartItemSchema,
  checkoutSummary,
  checkout,
  checkoutSchema,
  listOrders,
  getOrder,
  listOrderItems,
  cancelOrder,
  idParamSchema,
  createPayment,
  createPaymentSchema,
  confirmStripePayment,
  confirmStripePaymentSchema,
  listOrderPayments,
  getPayment,
  createSupportMessage,
  listSupportMessages,
  supportMessageListSchema,
  supportMessageSchema,
  getNotificationPreferences,
  updateNotificationPreferences,
  notificationPreferencesSchema,
  markNotificationRead,
  markNotificationReadSchema
} from "../controllers/accountController.js";

export const accountRouter = Router();

accountRouter.use(auth);

accountRouter.get("/profile", getProfile);
accountRouter.put("/profile", validate(updateProfileSchema), updateProfile);
accountRouter.patch("/password", validate(updatePasswordSchema), updatePassword);

accountRouter.get("/addresses", listAddresses);
accountRouter.post("/addresses", validate(addressSchema), createAddress);
accountRouter.put("/addresses/:id", validate(updateAddressSchema), updateAddress);
accountRouter.delete("/addresses/:id", validate(idParamSchema), deleteAddress);
accountRouter.patch("/addresses/:id/default", validate(idParamSchema), setDefaultAddress);

accountRouter.get("/sessions", listSessions);
accountRouter.delete("/sessions/:id", validate(idParamSchema), revokeSession);

accountRouter.get("/cart", getCart);
accountRouter.post("/cart/items", validate(addCartItemSchema), addItem);
accountRouter.patch("/cart/items/:id", validate(updateCartItemSchema), updateItem);
accountRouter.delete("/cart/items/:id", validate(idParamSchema), deleteItem);
accountRouter.delete("/cart", clearCart);
accountRouter.put("/cart/items/by-variant/:variantId", validate(upsertCartItemSchema), upsertCartItemByVariant);

accountRouter.get("/checkout/summary", checkoutSummary);
accountRouter.post("/checkout", validate(checkoutSchema), checkout);

accountRouter.get("/orders", listOrders);
accountRouter.get("/orders/:id", validate(idParamSchema), getOrder);
accountRouter.get("/orders/:id/items", validate(idParamSchema), listOrderItems);
accountRouter.post("/orders/:id/cancel", validate(idParamSchema), cancelOrder);

accountRouter.post("/orders/:id/payments", validate(createPaymentSchema), createPayment);
accountRouter.get("/orders/:id/payments", validate(idParamSchema), listOrderPayments);
accountRouter.get("/payments/:id", validate(idParamSchema), getPayment);
accountRouter.post("/stripe/confirm", validate(confirmStripePaymentSchema), confirmStripePayment);

accountRouter.get("/support/messages", validate(supportMessageListSchema), listSupportMessages);
accountRouter.post("/support/messages", validate(supportMessageSchema), createSupportMessage);

accountRouter.get("/notification-preferences", getNotificationPreferences);
accountRouter.patch("/notification-preferences", validate(notificationPreferencesSchema), updateNotificationPreferences);
accountRouter.post("/notifications/read", validate(markNotificationReadSchema), markNotificationRead);
