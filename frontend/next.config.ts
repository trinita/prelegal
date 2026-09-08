import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // FastAPI serves the frontend, so it is emitted as static files rather than
  // run as a second Node process. Nothing is given up: every page here renders
  // in the browser already.
  output: "export",
};

export default nextConfig;
