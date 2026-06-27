import type { NextConfig } from "next";
import path from "node:path";

const repositoryRoot = path.resolve(process.cwd(), "../..");

const nextConfig: NextConfig = {
  outputFileTracingRoot: repositoryRoot,
  allowedDevOrigins: ['localhost', '127.0.0.1'],
  turbopack: {
    root: repositoryRoot,
  },
};

export default nextConfig;
