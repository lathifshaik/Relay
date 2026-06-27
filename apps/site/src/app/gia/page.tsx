import type { Metadata } from "next";
import GiaTest from "./GiaTest";

export const metadata: Metadata = {
  title: "GIA Practice Test",
  description: "Thomas International GIA practice test — 5 sections, 3 minutes each.",
};

export default function GiaPage() {
  return <GiaTest />;
}
