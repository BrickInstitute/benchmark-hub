/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  experimental: {
    serverComponentsExternalPackages: ["sharp", "playwright"],
    instrumentationHook: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
