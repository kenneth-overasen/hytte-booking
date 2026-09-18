/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['pdfkit', '@prisma/client'],
  experimental: {
    // Trust only the origins we explicitly configure for Server Actions.
    serverActions: {
      allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    },
  },
};
export default nextConfig;
