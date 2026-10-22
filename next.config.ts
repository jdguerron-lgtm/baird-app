import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // /admin/guia lee docs/GUIA-OPERACION-LOGISTICA.md con fs en el servidor:
  // hay que incluir el archivo en el bundle serverless de Vercel (fuera de
  // `src/`, el tracing automático no lo detecta).
  outputFileTracingIncludes: {
    '/admin/guia': ['./docs/GUIA-OPERACION-LOGISTICA.md'],
  },
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
      {
        protocol: 'https',
        hostname: 'ceblicvdmephhktedsyv.supabase.co',
        pathname: '/storage/v1/object/public/evidencias-servicio/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
  // Security headers are set in src/middleware.ts (single source of truth)
};

export default nextConfig;
