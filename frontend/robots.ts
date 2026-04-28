import type { MetadataRoute } from "next";
import { generateRobotsFile } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return generateRobotsFile();
}
