import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'ceblicvdmephhktedsyv.supabase.co',
        pathname: '/storage/v1/object/public/tecnicos-fotos/**',
      },
      {
        protocol: 'https',
        hostname: 'ceblicvdmephhktedsyv.supabase.co',
        pathname: '/storage/v1/object/public/tecnicos-documentos/**',
      },
    ],
  },
  // Security headers are set in src/middleware.ts (single source of truth)
};

export default nextConfig;
