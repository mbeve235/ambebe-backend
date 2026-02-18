import { env } from "./env.js";

export const swaggerSpec = {
  openapi: "3.0.0",
  info: {
    title: "E-commerce API",
    version: "1.0.0"
  },
  servers: [
    {
      url: `http://127.0.0.1:${env.port}`
    }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT"
      }
    },
    schemas: {
      RegisterRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 8 },
          name: { type: "string", minLength: 2, maxLength: 120 }
        }
      },
      LoginRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 8 }
        }
      },
      RefreshRequest: {
        type: "object",
        required: ["refreshToken"],
        properties: {
          refreshToken: { type: "string", minLength: 10 }
        }
      },
      LogoutRequest: {
        type: "object",
        required: ["refreshToken"],
        properties: {
          refreshToken: { type: "string", minLength: 10 }
        }
      },
      ForgotPasswordRequest: {
        type: "object",
        required: ["email"],
        properties: {
          email: { type: "string", format: "email" }
        }
      },
      ResetPasswordRequest: {
        type: "object",
        required: ["token", "newPassword"],
        properties: {
          token: { type: "string", minLength: 20 },
          newPassword: { type: "string", minLength: 8 }
        }
      },
      UpdateProfileRequest: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", minLength: 2, maxLength: 120 }
        }
      },
      UpdatePasswordRequest: {
        type: "object",
        required: ["currentPassword", "newPassword"],
        properties: {
          currentPassword: { type: "string", minLength: 8 },
          newPassword: { type: "string", minLength: 8 }
        }
      },
      CreateAddressRequest: {
        type: "object",
        required: ["name", "line1", "city", "state", "postalCode", "country"],
        properties: {
          name: { type: "string", minLength: 2, maxLength: 120 },
          line1: { type: "string", minLength: 2 },
          line2: { type: "string" },
          city: { type: "string", minLength: 2 },
          state: { type: "string", minLength: 2 },
          postalCode: { type: "string", minLength: 3 },
          country: { type: "string", minLength: 2, maxLength: 2 },
          phone: { type: "string" },
          isDefault: { type: "boolean" }
        }
      },
      UpdateAddressRequest: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 2, maxLength: 120 },
          line1: { type: "string", minLength: 2 },
          line2: { type: "string" },
          city: { type: "string", minLength: 2 },
          state: { type: "string", minLength: 2 },
          postalCode: { type: "string", minLength: 3 },
          country: { type: "string", minLength: 2, maxLength: 2 },
          phone: { type: "string" },
          isDefault: { type: "boolean" }
        }
      },
      AddCartItemRequest: {
        type: "object",
        required: ["productId", "quantity"],
        properties: {
          productId: { type: "string" },
          variantId: { type: "string", nullable: true },
          quantity: { type: "integer", minimum: 1 }
        }
      },
      UpdateCartItemRequest: {
        type: "object",
        required: ["quantity"],
        properties: {
          quantity: { type: "integer", minimum: 1 }
        }
      },
      UpsertCartItemRequest: {
        type: "object",
        required: ["quantity"],
        properties: {
          quantity: { type: "integer", minimum: 1 }
        }
      },
      CheckoutRequest: {
        type: "object",
        properties: {
          couponCode: { type: "string" },
          paymentProvider: { type: "string", enum: ["MPESA", "EMOLA", "STRIPE", "COD", "PAYPAL"] },
          phone: { type: "string" }
        }
      },
      CreatePaymentRequest: {
        type: "object",
        properties: {
          provider: { type: "string", enum: ["MPESA", "EMOLA", "STRIPE", "COD", "PAYPAL"] },
          phone: { type: "string" }
        }
      },
      ConfirmStripePaymentRequest: {
        type: "object",
        required: ["sessionId"],
        properties: {
          sessionId: { type: "string" }
        }
      },
      NotificationPreferences: {
        type: "object",
        properties: {
          newProductNotificationsEnabled: { type: "boolean" },
          lastProductSeenAt: { type: "string", format: "date-time", nullable: true },
          lastSupportSeenAt: { type: "string", format: "date-time", nullable: true }
        }
      },
      NotificationPreferencesUpdateRequest: {
        type: "object",
        properties: {
          newProductNotificationsEnabled: { type: "boolean" }
        }
      },
      NotificationReadRequest: {
        type: "object",
        required: ["kind", "seenAt"],
        properties: {
          kind: { type: "string", enum: ["product", "support"] },
          seenAt: { type: "string", format: "date-time" }
        }
      },
      UserSummary: {
        type: "object",
        required: ["id", "email"],
        properties: {
          id: { type: "string", format: "uuid" },
          email: { type: "string", format: "email" },
          name: { type: "string" }
        }
      },
      OrderItem: {
        type: "object",
        required: ["id", "quantity", "priceSnapshot", "nameSnapshot", "skuSnapshot", "attributesSnapshot"],
        properties: {
          id: { type: "string", format: "uuid" },
          productId: { type: "string", format: "uuid", nullable: true },
          variantId: { type: "string", format: "uuid", nullable: true },
          quantity: { type: "integer" },
          priceSnapshot: { type: "number" },
          nameSnapshot: { type: "string" },
          skuSnapshot: { type: "string" },
          attributesSnapshot: { type: "object", additionalProperties: true }
        }
      },
      Payment: {
        type: "object",
        required: ["id", "orderId", "status", "amount", "createdAt", "updatedAt"],
        properties: {
          id: { type: "string", format: "uuid" },
          orderId: { type: "string", format: "uuid" },
          status: { type: "string", enum: ["PENDING", "AUTHORIZED", "CAPTURED", "FAILED", "REFUNDED"] },
          amount: { type: "number" },
          provider: { type: "string", nullable: true },
          externalRef: { type: "string", nullable: true },
          checkoutUrl: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      Order: {
        type: "object",
        required: ["id", "userId", "status", "total", "currency", "paymentStatus", "createdAt", "updatedAt"],
        properties: {
          id: { type: "string", format: "uuid" },
          userId: { type: "string", format: "uuid" },
          status: { type: "string", enum: ["PENDING", "PAID", "SHIPPED", "CANCELED"] },
          total: { type: "number" },
          discountTotal: { type: "number" },
          couponId: { type: "string", format: "uuid", nullable: true },
          couponCode: { type: "string", nullable: true },
          currency: { type: "string" },
          paymentStatus: {
            type: "string",
            enum: ["PENDING", "AUTHORIZED", "CAPTURED", "FAILED", "REFUNDED"]
          },
          items: { type: "array", items: { $ref: "#/components/schemas/OrderItem" } },
          payment: { $ref: "#/components/schemas/Payment", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      CheckoutResponse: {
        allOf: [
          { $ref: "#/components/schemas/Order" },
          {
            type: "object",
            required: ["user"],
            properties: {
              user: { $ref: "#/components/schemas/UserSummary" }
            }
          }
        ]
      },
      PaymentResponse: {
        allOf: [
          { $ref: "#/components/schemas/Payment" },
          {
            type: "object",
            required: ["user"],
            properties: {
              user: { $ref: "#/components/schemas/UserSummary" }
            }
          }
        ]
      },
      CreateCategoryRequest: {
        type: "object",
        required: ["name", "slug"],
        properties: {
          name: { type: "string", minLength: 2 },
          slug: { type: "string", minLength: 2 },
          description: { type: "string" }
        }
      },
      UpdateCategoryRequest: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 2 },
          slug: { type: "string", minLength: 2 },
          description: { type: "string" }
        }
      },
      CreateProductVariant: {
        type: "object",
        required: ["sku", "name", "price", "attributes"],
        properties: {
          sku: { type: "string", minLength: 2 },
          name: { type: "string", minLength: 2 },
          price: { type: "number", minimum: 0 },
          attributes: { type: "object", additionalProperties: true }
        }
      },
      CreateProductRequest: {
        type: "object",
        required: ["name", "slug", "basePrice", "variants"],
        properties: {
          name: { type: "string", minLength: 2 },
          slug: { type: "string", minLength: 2 },
          description: { type: "string" },
          basePrice: { type: "number", minimum: 0 },
          status: { type: "string", enum: ["DRAFT", "ACTIVE", "ARCHIVED"] },
          categoryIds: { type: "array", items: { type: "string", format: "uuid" } },
          variants: { type: "array", items: { $ref: "#/components/schemas/CreateProductVariant" } }
        }
      },
      UpdateProductRequest: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 2 },
          slug: { type: "string", minLength: 2 },
          description: { type: "string" },
          basePrice: { type: "number", minimum: 0 },
          status: { type: "string", enum: ["DRAFT", "ACTIVE", "ARCHIVED"] },
          categoryIds: { type: "array", items: { type: "string", format: "uuid" } }
        }
      },
      UpdateProductStatusRequest: {
        type: "object",
        required: ["status"],
        properties: {
          status: { type: "string", enum: ["DRAFT", "ACTIVE", "ARCHIVED"] }
        }
      },
      CategoryReplaceRequest: {
        type: "object",
        required: ["categoryIds"],
        properties: {
          categoryIds: { type: "array", items: { type: "string", format: "uuid" } }
        }
      },
      AddImageLinkRequest: {
        type: "object",
        required: ["url"],
        properties: {
          url: { type: "string", format: "uri" },
          sortOrder: { type: "integer" }
        }
      },
      AddImageUploadRequest: {
        type: "object",
        required: ["file"],
        properties: {
          file: { type: "string", format: "binary" },
          sortOrder: { type: "integer" }
        }
      },
      UpdateImageRequest: {
        type: "object",
        properties: {
          url: { type: "string", format: "uri" },
          sortOrder: { type: "integer" }
        }
      },
      CreateStockItemRequest: {
        type: "object",
        required: ["variantId"],
        properties: {
          variantId: { type: "string", format: "uuid" }
        }
      },
      CreateMovementRequest: {
        type: "object",
        required: ["stockItemId", "delta", "reason"],
        properties: {
          stockItemId: { type: "string", format: "uuid" },
          delta: { type: "integer" },
          reason: { type: "string", minLength: 2 }
        }
      },
      UpdateOrderStatusRequest: {
        type: "object",
        required: ["status"],
        properties: {
          status: { type: "string", enum: ["PENDING", "PAID", "SHIPPED", "CANCELED"] }
        }
      },
      UpdateOrderPaymentStatusRequest: {
        type: "object",
        required: ["paymentStatus"],
        properties: {
          paymentStatus: {
            type: "string",
            enum: ["PENDING", "AUTHORIZED", "CAPTURED", "FAILED", "REFUNDED"]
          }
        }
      },
      UpdateUserRoleRequest: {
        type: "object",
        required: ["roleId"],
        properties: {
          roleId: { type: "string", format: "uuid" }
        }
      },
      AdminUpdateUserPasswordRequest: {
        type: "object",
        required: ["newPassword"],
        properties: {
          newPassword: { type: "string", minLength: 8 }
        }
      },
      CreateUserRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 8 },
          name: { type: "string", minLength: 2, maxLength: 120 },
          role: { type: "string", enum: ["customer", "manager", "admin"] }
        }
      },
      CreateRoleRequest: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", minLength: 2 },
          permissionIds: { type: "array", items: { type: "string", format: "uuid" } }
        }
      },
      UpdateRoleRequest: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", minLength: 2 }
        }
      },
      CreatePermissionRequest: {
        type: "object",
        required: ["code"],
        properties: {
          code: { type: "string", minLength: 2 },
          description: { type: "string" }
        }
      },
      UpdatePermissionRequest: {
        type: "object",
        properties: {
          code: { type: "string", minLength: 2 },
          description: { type: "string" }
        }
      },
      ReplaceRolePermissionsRequest: {
        type: "object",
        required: ["permissionIds"],
        properties: {
          permissionIds: { type: "array", items: { type: "string", format: "uuid" } }
        }
      }
    }
  },
  paths: {
    "/v1/system/health": {
      get: {
        tags: ["System"],
        summary: "Health check",
        responses: {
          200: { description: "OK" }
        }
      }
    },
    "/v1/system/ready": {
      get: {
        tags: ["System"],
        summary: "Readiness check",
        responses: {
          200: { description: "OK" }
        }
      }
    },
    "/v1/system/metrics": {
      get: {
        tags: ["System"],
        summary: "Metrics",
        responses: {
          200: { description: "OK" }
        }
      }
    },
    "/v1/system/webhooks/payments/{provider}": {
      post: {
        tags: ["System"],
        summary: "Payments webhook",
        parameters: [
          { name: "provider", in: "path", required: true, schema: { type: "string" } }
        ],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: { type: "object", additionalProperties: true }
            }
          }
        },
        responses: {
          200: { description: "OK" },
          400: { description: "Bad request" }
        }
      }
    },
    "/v1/system/webhooks/stripe": {
      post: {
        tags: ["System"],
        summary: "Stripe webhook",
        responses: {
          200: { description: "OK" },
          400: { description: "Bad request" }
        }
      }
    },
    "/v1/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register customer",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RegisterRequest" }
            }
          }
        },
        responses: {
          201: { description: "Created" },
          400: { description: "Bad request" }
        }
      }
    },
    "/v1/auth/register/customer": {
      post: {
        tags: ["Auth"],
        summary: "Register customer (alias)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RegisterRequest" }
            }
          }
        },
        responses: {
          201: { description: "Created" },
          400: { description: "Bad request" }
        }
      }
    },
    "/v1/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/LoginRequest" }
            }
          }
        },
        responses: {
          200: { description: "OK" },
          401: { description: "Unauthorized" }
        }
      }
    },
    "/v1/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Refresh token",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RefreshRequest" }
            }
          }
        },
        responses: {
          200: { description: "OK" },
          401: { description: "Unauthorized" }
        }
      }
    },
    "/v1/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Logout",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/LogoutRequest" }
            }
          }
        },
        responses: {
          204: { description: "No content" }
        }
      }
    },
    "/v1/auth/forgot-password": {
      post: {
        tags: ["Auth"],
        summary: "Request password reset",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ForgotPasswordRequest" }
            }
          }
        },
        responses: {
          200: { description: "OK" },
          429: { description: "Too many requests" }
        }
      }
    },
    "/v1/auth/reset-password": {
      post: {
        tags: ["Auth"],
        summary: "Reset password with token",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ResetPasswordRequest" }
            }
          }
        },
        responses: {
          204: { description: "No content" },
          400: { description: "Bad request" },
          429: { description: "Too many requests" }
        }
      }
    },
    "/v1/store/categories": {
      get: {
        tags: ["Store"],
        summary: "List categories",
        responses: {
          200: { description: "OK" }
        }
      }
    },
    "/v1/store/categories/{id}": {
      get: {
        tags: ["Store"],
        summary: "Get category",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          200: { description: "OK" },
          404: { description: "Not found" }
        }
      }
    },
    "/v1/store/categories/{id}/products": {
      get: {
        tags: ["Store"],
        summary: "List products by category",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          200: { description: "OK" },
          404: { description: "Not found" }
        }
      }
    },
    "/v1/store/products": {
      get: {
        tags: ["Store"],
        summary: "List products",
        parameters: [
          { name: "q", in: "query", required: false, schema: { type: "string" } },
          { name: "categoryId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
          { name: "minPrice", in: "query", required: false, schema: { type: "number" } },
          { name: "maxPrice", in: "query", required: false, schema: { type: "number" } },
          {
            name: "sort",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["price_asc", "price_desc", "newest"] }
          },
          { name: "page", in: "query", required: false, schema: { type: "integer", minimum: 1 } },
          { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1 } }
        ],
        responses: {
          200: { description: "OK" }
        }
      }
    },
    "/v1/store/products/{id}": {
      get: {
        tags: ["Store"],
        summary: "Get product by id",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          200: { description: "OK" },
          404: { description: "Not found" }
        }
      }
    },
    "/v1/store/products/slug/{slug}": {
      get: {
        tags: ["Store"],
        summary: "Get product by slug",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: {
          200: { description: "OK" },
          404: { description: "Not found" }
        }
      }
    },
    "/v1/store/products/{id}/variants": {
      get: {
        tags: ["Store"],
        summary: "List product variants",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          200: { description: "OK" }
        }
      }
    },
    "/v1/store/products/{id}/images": {
      get: {
        tags: ["Store"],
        summary: "List product images",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          200: { description: "OK" }
        }
      }
    },
    "/v1/store/variants/{id}": {
      get: {
        tags: ["Store"],
        summary: "Get variant",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          200: { description: "OK" },
          404: { description: "Not found" }
        }
      }
    },
    "/v1/store/variants/{id}/availability": {
      get: {
        tags: ["Store"],
        summary: "Variant availability",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          200: { description: "OK" }
        }
      }
    },
    "/v1/account/profile": {
      get: {
        tags: ["Account"],
        summary: "Get profile",
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "OK" },
          401: { description: "Unauthorized" }
        }
      },
      put: {
        tags: ["Account"],
        summary: "Update profile",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateProfileRequest" }
            }
          }
        },
        responses: {
          200: { description: "OK" },
          400: { description: "Bad request" },
          401: { description: "Unauthorized" }
        }
      }
    },
    "/v1/account/password": {
      patch: {
        tags: ["Account"],
        summary: "Update password",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdatePasswordRequest" }
            }
          }
        },
        responses: {
          204: { description: "No content" },
          400: { description: "Bad request" },
          401: { description: "Unauthorized" }
        }
      }
    },
    "/v1/account/addresses": {
      get: {
        tags: ["Account"],
        summary: "List addresses",
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "OK" },
          401: { description: "Unauthorized" }
        }
      },
      post: {
        tags: ["Account"],
        summary: "Create address",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateAddressRequest" }
            }
          }
        },
        responses: {
          201: { description: "Created" },
          400: { description: "Bad request" },
          401: { description: "Unauthorized" }
        }
      }
    },
    "/v1/account/addresses/{id}": {
      put: {
        tags: ["Account"],
        summary: "Update address",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateAddressRequest" }
            }
          }
        },
        responses: {
          200: { description: "OK" },
          400: { description: "Bad request" },
          401: { description: "Unauthorized" }
        }
      },
      delete: {
        tags: ["Account"],
        summary: "Delete address",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          204: { description: "No content" },
          401: { description: "Unauthorized" }
        }
      }
    },
    "/v1/account/addresses/{id}/default": {
      patch: {
        tags: ["Account"],
        summary: "Set default address",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          204: { description: "No content" },
          401: { description: "Unauthorized" }
        }
      }
    },
    "/v1/account/sessions": {
      get: {
        tags: ["Account"],
        summary: "List sessions",
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "OK" },
          401: { description: "Unauthorized" }
        }
      }
    },
    "/v1/account/sessions/{id}": {
      delete: {
        tags: ["Account"],
        summary: "Revoke session",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          204: { description: "No content" },
          401: { description: "Unauthorized" }
        }
      }
    },
    "/v1/account/cart": {
      get: {
        tags: ["Account"],
        summary: "Get cart",
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "OK" },
          401: { description: "Unauthorized" }
        }
      },
      delete: {
        tags: ["Account"],
        summary: "Clear cart",
        security: [{ bearerAuth: [] }],
        responses: {
          204: { description: "No content" },
          401: { description: "Unauthorized" }
        }
      }
    },
    "/v1/account/cart/items": {
      post: {
        tags: ["Account"],
        summary: "Add cart item",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AddCartItemRequest" }
            }
          }
        },
        responses: {
          201: { description: "Created" },
          400: { description: "Bad request" },
          401: { description: "Unauthorized" }
        }
      }
    },
    "/v1/account/cart/items/{id}": {
      patch: {
        tags: ["Account"],
        summary: "Update cart item",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateCartItemRequest" }
            }
          }
        },
        responses: {
          200: { description: "OK" },
          400: { description: "Bad request" },
          401: { description: "Unauthorized" }
        }
      },
      delete: {
        tags: ["Account"],
        summary: "Delete cart item",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          204: { description: "No content" },
          401: { description: "Unauthorized" }
        }
      }
    },
    "/v1/account/cart/items/by-variant/{variantId}": {
      put: {
        tags: ["Account"],
        summary: "Upsert cart item by variant",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "variantId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpsertCartItemRequest" }
            }
          }
        },
        responses: {
          200: { description: "OK" },
          201: { description: "Created" },
          400: { description: "Bad request" },
          401: { description: "Unauthorized" }
        }
      }
    },
    "/v1/account/checkout/summary": {
      get: {
        tags: ["Account"],
        summary: "Checkout summary",
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "OK" },
          401: { description: "Unauthorized" }
        }
      }
    },
    "/v1/account/checkout": {
      post: {
        tags: ["Account"],
        summary: "Checkout",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "Idempotency-Key", in: "header", required: true, schema: { type: "string" } }
        ],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CheckoutRequest" }
            }
          }
        },
        responses: {
          201: {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CheckoutResponse" }
              }
            }
          },
          400: { description: "Bad request" },
          401: { description: "Unauthorized" },
          409: { description: "Idempotency conflict" }
        }
      }
    },
    "/v1/account/orders": {
      get: {
        tags: ["Account"],
        summary: "List orders",
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "OK" },
          401: { description: "Unauthorized" }
        }
      }
    },
    "/v1/account/orders/{id}": {
      get: {
        tags: ["Account"],
        summary: "Get order",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          200: { description: "OK" },
          404: { description: "Not found" },
          401: { description: "Unauthorized" }
        }
      }
    },
    "/v1/account/orders/{id}/items": {
      get: {
        tags: ["Account"],
        summary: "List order items",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          200: { description: "OK" },
          404: { description: "Not found" },
          401: { description: "Unauthorized" }
        }
      }
    },
    "/v1/account/orders/{id}/cancel": {
      post: {
        tags: ["Account"],
        summary: "Cancel order",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          200: { description: "OK" },
          400: { description: "Bad request" },
          401: { description: "Unauthorized" },
          404: { description: "Not found" }
        }
      }
    },
    "/v1/account/orders/{id}/payments": {
      post: {
        tags: ["Account"],
        summary: "Create payment",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "Idempotency-Key", in: "header", required: true, schema: { type: "string" } }
        ],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreatePaymentRequest" }
            }
          }
        },
        responses: {
          201: {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PaymentResponse" }
              }
            }
          },
          400: { description: "Bad request" },
          401: { description: "Unauthorized" },
          409: { description: "Idempotency conflict" }
        }
      },
      get: {
        tags: ["Account"],
        summary: "List payments for order",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          200: { description: "OK" },
          401: { description: "Unauthorized" },
          404: { description: "Not found" }
        }
      }
    },
    "/v1/account/payments/{id}": {
      get: {
        tags: ["Account"],
        summary: "Get payment",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          200: { description: "OK" },
          401: { description: "Unauthorized" },
          404: { description: "Not found" }
        }
      }
    },
    "/v1/account/stripe/confirm": {
      post: {
        tags: ["Account"],
        summary: "Confirm Stripe payment",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ConfirmStripePaymentRequest" }
            }
          }
        },
        responses: {
          200: { description: "OK" },
          400: { description: "Bad request" },
          401: { description: "Unauthorized" }
        }
      }
    },
    "/v1/account/notification-preferences": {
      get: {
        tags: ["Account"],
        summary: "Get notification preferences",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/NotificationPreferences" }
              }
            }
          },
          401: { description: "Unauthorized" }
        }
      },
      patch: {
        tags: ["Account"],
        summary: "Update notification preferences",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/NotificationPreferencesUpdateRequest" }
            }
          }
        },
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/NotificationPreferences" }
              }
            }
          },
          401: { description: "Unauthorized" }
        }
      }
    },
    "/v1/account/notifications/read": {
      post: {
        tags: ["Account"],
        summary: "Mark notification as read",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/NotificationReadRequest" }
            }
          }
        },
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/NotificationPreferences" }
              }
            }
          },
          401: { description: "Unauthorized" }
        }
      }
    },
    "/v1/staff/categories": {
      get: {
        tags: ["Staff"],
        summary: "List categories",
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "OK" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      },
      post: {
        tags: ["Staff"],
        summary: "Create category",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateCategoryRequest" }
            }
          }
        },
        responses: {
          201: { description: "Created" },
          400: { description: "Bad request" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      }
    },
    "/v1/staff/categories/{id}": {
      put: {
        tags: ["Staff"],
        summary: "Update category",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateCategoryRequest" }
            }
          }
        },
        responses: {
          200: { description: "OK" },
          400: { description: "Bad request" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      },
      delete: {
        tags: ["Staff"],
        summary: "Delete category",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          204: { description: "No content" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      }
    },
    "/v1/staff/products": {
      get: {
        tags: ["Staff"],
        summary: "List products",
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "OK" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      },
      post: {
        tags: ["Staff"],
        summary: "Create product",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateProductRequest" }
            }
          }
        },
        responses: {
          201: { description: "Created" },
          400: { description: "Bad request" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      }
    },
    "/v1/staff/products/{id}": {
      get: {
        tags: ["Staff"],
        summary: "Get product",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          200: { description: "OK" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" },
          404: { description: "Not found" }
        }
      },
      put: {
        tags: ["Staff"],
        summary: "Update product",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateProductRequest" }
            }
          }
        },
        responses: {
          200: { description: "OK" },
          400: { description: "Bad request" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      },
      delete: {
        tags: ["Staff"],
        summary: "Archive product",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          200: { description: "OK" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      }
    },
    "/v1/staff/products/{id}/status": {
      patch: {
        tags: ["Staff"],
        summary: "Update product status",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateProductStatusRequest" }
            }
          }
        },
        responses: {
          200: { description: "OK" },
          400: { description: "Bad request" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      }
    },
    "/v1/staff/products/{id}/categories": {
      put: {
        tags: ["Staff"],
        summary: "Replace product categories",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CategoryReplaceRequest" }
            }
          }
        },
        responses: {
          204: { description: "No content" },
          400: { description: "Bad request" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      }
    },
    "/v1/staff/products/{id}/categories/{categoryId}": {
      post: {
        tags: ["Staff"],
        summary: "Add product category",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "categoryId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          201: { description: "Created" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      },
      delete: {
        tags: ["Staff"],
        summary: "Remove product category",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "categoryId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          204: { description: "No content" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      }
    },
    "/v1/staff/products/{id}/variants": {
      get: {
        tags: ["Staff"],
        summary: "List variants",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          200: { description: "OK" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      },
      post: {
        tags: ["Staff"],
        summary: "Create variant",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateProductVariant" }
            }
          }
        },
        responses: {
          201: { description: "Created" },
          400: { description: "Bad request" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      }
    },
    "/v1/staff/variants/{id}": {
      put: {
        tags: ["Staff"],
        summary: "Update variant",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateProductVariant" }
            }
          }
        },
        responses: {
          200: { description: "OK" },
          400: { description: "Bad request" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      },
      delete: {
        tags: ["Staff"],
        summary: "Delete variant",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          204: { description: "No content" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      }
    },
    "/v1/staff/products/{id}/images/link": {
      post: {
        tags: ["Staff"],
        summary: "Add product image link",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AddImageLinkRequest" }
            }
          }
        },
        responses: {
          201: { description: "Created" },
          400: { description: "Bad request" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      }
    },
    "/v1/staff/products/{id}/images/upload": {
      post: {
        tags: ["Staff"],
        summary: "Upload product image",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: { $ref: "#/components/schemas/AddImageUploadRequest" }
            }
          }
        },
        responses: {
          201: { description: "Created" },
          400: { description: "Bad request" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      }
    },
    "/v1/staff/products/{id}/images/{imageId}": {
      patch: {
        tags: ["Staff"],
        summary: "Update product image",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "imageId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateImageRequest" }
            }
          }
        },
        responses: {
          200: { description: "OK" },
          400: { description: "Bad request" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      },
      delete: {
        tags: ["Staff"],
        summary: "Delete product image",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "imageId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          204: { description: "No content" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      }
    },
    "/v1/staff/inventory/stock-items": {
      get: {
        tags: ["Staff"],
        summary: "List stock items",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "variantId", in: "query", required: false, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          200: { description: "OK" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      },
      post: {
        tags: ["Staff"],
        summary: "Create stock item",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateStockItemRequest" }
            }
          }
        },
        responses: {
          201: { description: "Created" },
          400: { description: "Bad request" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      }
    },
    "/v1/staff/inventory/stock-items/{id}": {
      get: {
        tags: ["Staff"],
        summary: "Get stock item",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          200: { description: "OK" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" },
          404: { description: "Not found" }
        }
      }
    },
    "/v1/staff/inventory/stock-items/{id}/movements": {
      get: {
        tags: ["Staff"],
        summary: "List stock movements",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          200: { description: "OK" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      }
    },
    "/v1/staff/inventory/movements": {
      post: {
        tags: ["Staff"],
        summary: "Create stock movement",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateMovementRequest" }
            }
          }
        },
        responses: {
          201: { description: "Created" },
          400: { description: "Bad request" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      }
    },
    "/v1/staff/orders": {
      get: {
        tags: ["Staff"],
        summary: "List orders",
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "OK" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      }
    },
    "/v1/staff/orders/{id}": {
      get: {
        tags: ["Staff"],
        summary: "Get order",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          200: { description: "OK" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" },
          404: { description: "Not found" }
        }
      }
    },
    "/v1/staff/orders/{id}/items": {
      get: {
        tags: ["Staff"],
        summary: "List order items",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          200: { description: "OK" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      }
    },
    "/v1/staff/orders/{id}/status": {
      patch: {
        tags: ["Staff"],
        summary: "Update order status",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateOrderStatusRequest" }
            }
          }
        },
        responses: {
          200: { description: "OK" },
          400: { description: "Bad request" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      }
    },
    "/v1/staff/orders/{id}/payment-status": {
      patch: {
        tags: ["Staff"],
        summary: "Update payment status",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateOrderPaymentStatusRequest" }
            }
          }
        },
        responses: {
          200: { description: "OK" },
          400: { description: "Bad request" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      }
    },
    "/v1/staff/payments": {
      get: {
        tags: ["Staff"],
        summary: "List payments",
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "OK" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      }
    },
    "/v1/staff/payments/{id}": {
      get: {
        tags: ["Staff"],
        summary: "Get payment",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          200: { description: "OK" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" },
          404: { description: "Not found" }
        }
      }
    },
    "/v1/admin/users": {
      post: {
        tags: ["Admin"],
        summary: "Create user",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateUserRequest" }
            }
          }
        },
        responses: {
          201: { description: "Created" },
          400: { description: "Bad request" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      },
      get: {
        tags: ["Admin"],
        summary: "List users",
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "OK" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      }
    },
    "/v1/admin/users/{id}": {
      get: {
        tags: ["Admin"],
        summary: "Get user",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          200: { description: "OK" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" },
          404: { description: "Not found" }
        }
      }
    },
    "/v1/admin/users/{id}/role": {
      patch: {
        tags: ["Admin"],
        summary: "Update user role",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateUserRoleRequest" }
            }
          }
        },
        responses: {
          200: { description: "OK" },
          400: { description: "Bad request" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      }
    },
    "/v1/admin/users/{id}/password": {
      patch: {
        tags: ["Admin"],
        summary: "Reset user password",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AdminUpdateUserPasswordRequest" }
            }
          }
        },
        responses: {
          204: { description: "No content" },
          400: { description: "Bad request" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      }
    },
    "/v1/admin/roles": {
      get: {
        tags: ["Admin"],
        summary: "List roles",
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "OK" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      },
      post: {
        tags: ["Admin"],
        summary: "Create role",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateRoleRequest" }
            }
          }
        },
        responses: {
          201: { description: "Created" },
          400: { description: "Bad request" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      }
    },
    "/v1/admin/roles/{id}": {
      put: {
        tags: ["Admin"],
        summary: "Update role",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateRoleRequest" }
            }
          }
        },
        responses: {
          200: { description: "OK" },
          400: { description: "Bad request" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      },
      delete: {
        tags: ["Admin"],
        summary: "Delete role",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          204: { description: "No content" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      }
    },
    "/v1/admin/permissions": {
      get: {
        tags: ["Admin"],
        summary: "List permissions",
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "OK" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      },
      post: {
        tags: ["Admin"],
        summary: "Create permission",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreatePermissionRequest" }
            }
          }
        },
        responses: {
          201: { description: "Created" },
          400: { description: "Bad request" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      }
    },
    "/v1/admin/permissions/{id}": {
      put: {
        tags: ["Admin"],
        summary: "Update permission",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdatePermissionRequest" }
            }
          }
        },
        responses: {
          200: { description: "OK" },
          400: { description: "Bad request" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      },
      delete: {
        tags: ["Admin"],
        summary: "Delete permission",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          204: { description: "No content" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      }
    },
    "/v1/admin/roles/{id}/permissions": {
      get: {
        tags: ["Admin"],
        summary: "List role permissions",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          200: { description: "OK" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" },
          404: { description: "Not found" }
        }
      },
      put: {
        tags: ["Admin"],
        summary: "Replace role permissions",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ReplaceRolePermissionsRequest" }
            }
          }
        },
        responses: {
          204: { description: "No content" },
          400: { description: "Bad request" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      }
    },
    "/v1/admin/roles/{id}/permissions/{permissionId}": {
      post: {
        tags: ["Admin"],
        summary: "Add role permission",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "permissionId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          201: { description: "Created" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      },
      delete: {
        tags: ["Admin"],
        summary: "Remove role permission",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "permissionId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          204: { description: "No content" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      }
    },
    "/v1/admin/audit-logs": {
      get: {
        tags: ["Admin"],
        summary: "List audit logs",
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "OK" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      }
    },
    "/v1/admin/audit-logs/{id}": {
      get: {
        tags: ["Admin"],
        summary: "Get audit log",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          200: { description: "OK" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" },
          404: { description: "Not found" }
        }
      }
    },
    "/v1/admin/idempotency-keys": {
      get: {
        tags: ["Admin"],
        summary: "List idempotency keys",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "userId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
          { name: "key", in: "query", required: false, schema: { type: "string" } }
        ],
        responses: {
          200: { description: "OK" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" }
        }
      }
    },
    "/v1/admin/idempotency-keys/{id}": {
      get: {
        tags: ["Admin"],
        summary: "Get idempotency key",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          200: { description: "OK" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" },
          404: { description: "Not found" }
        }
      }
    }
  }
};
