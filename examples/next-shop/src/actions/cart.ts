import { defineAction } from "@relay/next";
import { findProduct } from "./products";

interface CartLine {
  product_id: string;
  name: string;
  quantity: number;
  price: number;
}

const cart: CartLine[] = [];

export const getCart = defineAction({
  actionId: "get_cart",
  method: "GET",
  path: "/api/cart",
  label: "Get cart contents",
  inputs: {},
  returns: {
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          product_id: { type: "string" },
          name: { type: "string" },
          quantity: { type: "integer" },
          price: { type: "number" },
        },
      },
    },
    total: { type: "number" },
  },
  async handler() {
    const total = cart.reduce((sum, line) => sum + line.price * line.quantity, 0);
    return { lines: cart, total };
  },
});

export const addToCart = defineAction({
  actionId: "add_to_cart",
  method: "POST",
  path: "/api/cart",
  label: "Add a product to the cart",
  inputs: {
    product_id: { type: "string", required: true },
    quantity: { type: "integer", min: 1, max: 99, required: true },
  },
  returns: {
    cart_id: { type: "string" },
    total_items: { type: "integer" },
  },
  async handler({ product_id, quantity }) {
    const product = findProduct(product_id as string);
    if (!product) {
      throw new Error("ProductNotFound");
    }
    const existing = cart.find((l) => l.product_id === product_id);
    if (existing) {
      existing.quantity += quantity as number;
    } else {
      cart.push({
        product_id: product.id,
        name: product.name,
        quantity: quantity as number,
        price: product.price,
      });
    }
    const total_items = cart.reduce((sum, l) => sum + l.quantity, 0);
    return { cart_id: "c_1", total_items };
  },
});
