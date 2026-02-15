/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['three'],
  serverExternalPackages: ['@neondatabase/serverless'],
}

module.exports = nextConfig
