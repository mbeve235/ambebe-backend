import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import {
  addCartItemSchema,
  addItem,
  checkout,
  checkoutSchema,
  createAddress,
  createAddressSchema,
  deleteAddress,
  deleteItem,
  getCart,
  getProfile,
  listAddresses,
  listOrders,
  updateAddress,
  updateAddressSchema,
  updateCartItemSchema,
  updateItem,
  updateProfile,
  updateProfileSchema,
  updatePassword,
  updatePasswordSchema,
  idParamSchema
} from "../controllers/meController.js";

export const meRouter = Router();

meRouter.use(auth);

meRouter.get("/profile", getProfile);
meRouter.put("/profile", validate(updateProfileSchema), updateProfile);
meRouter.patch("/password", validate(updatePasswordSchema), updatePassword);

meRouter.get("/addresses", listAddresses);
meRouter.post("/addresses", validate(createAddressSchema), createAddress);
meRouter.put("/addresses/:id", validate(updateAddressSchema), updateAddress);
meRouter.delete("/addresses/:id", validate(idParamSchema), deleteAddress);

meRouter.get("/cart", getCart);
meRouter.post("/cart/items", validate(addCartItemSchema), addItem);
meRouter.patch("/cart/items/:id", validate(updateCartItemSchema), updateItem);
meRouter.delete("/cart/items/:id", validate(idParamSchema), deleteItem);

meRouter.post("/checkout", validate(checkoutSchema), checkout);
meRouter.get("/orders", listOrders);
