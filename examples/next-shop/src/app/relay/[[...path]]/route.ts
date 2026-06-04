import { createRelayHandler } from "@relay/next";
import { addToCart, getCart } from "@/actions/cart";
import { listProducts } from "@/actions/products";

const relay = createRelayHandler({
  appName: "next-shop",
  appVersion: "0.1.0",
  actions: [listProducts, getCart, addToCart],
  ...(process.env.RELAY_SIGNING_KEY ? { signingKey: process.env.RELAY_SIGNING_KEY } : {}),
});

export { relay as GET, relay as POST };
