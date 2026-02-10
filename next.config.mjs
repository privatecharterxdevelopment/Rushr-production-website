// next.config.mjs

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  images: {
    unoptimized: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async rewrites() {
    return [
      {
        source: '/crm',
        destination: '/dashboard/admin',
      },
      {
        source: '/crm/:path*',
        destination: '/dashboard/admin/:path*',
      },
    ]
  },
}

export default nextConfig
