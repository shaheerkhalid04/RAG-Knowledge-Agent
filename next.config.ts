import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Python API lives at api/index.py. In development it runs as a separate
  // uvicorn process; in production Vercel serves it as a serverless function.
  rewrites: async () => [
    {
      source: "/api/py/:path*",
      destination:
        process.env.NODE_ENV === "development"
          ? "http://127.0.0.1:8000/api/py/:path*"
          : "/api/",
    },
  ],
};

export default nextConfig;
