/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['three'],
  experimental: {
    serverComponentsExternalPackages: ['@neondatabase/serverless']
  },
  images: {
    domains: ['localhost']
  },
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL
  }
}

module.exports = nextConfig
