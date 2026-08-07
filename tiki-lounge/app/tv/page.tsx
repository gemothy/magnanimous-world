import type { Metadata } from "next";
import { LoungeExperience } from "@/components/LoungeExperience";

export const metadata: Metadata = {
  title: "TV Lounge",
  description: "The remote-friendly, full-screen Lagoon Lounge experience."
};

export default function TvLounge() {
  return <LoungeExperience tvMode />;
}
