import { defineAction } from "@relay/next";

interface Product {
  id: string;
  name: string;
  price: number;
}

const products: Product[] = [
  { id: "p_1", name: "Widget", price: 10 },
  { id: "p_2", name: "Gadget", price: 25 },
  { id: "p_3", name: "Sprocket", price: 7 },
];

export const listProducts = defineAction({
  actionId: "list_products",
  method: "GET",
  path: "/api/products",
  label: "List products",
  description: "Returns the full product catalogue.",
  inputs: {},
  returns: {
    products: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          price: { type: "number" },
        },
      },
    },
  },
  async handler() {
    return { products };
  },
});

export function findProduct(id: string): Product | undefined {
  return products.find((p) => p.id === id);
}
