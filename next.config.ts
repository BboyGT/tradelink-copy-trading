import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingIncludes: {
    "/api/brokers/bridge/download": ["./bridges/mt4/*.mq4", "./bridges/mt5/*.mq5"],
  },
  reactStrictMode: false,
};

export default nextConfig;
