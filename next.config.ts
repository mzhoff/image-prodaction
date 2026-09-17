import type { NextConfig } from 'next';
import { IMAGE_GENERATION_REQUEST_MAX_BYTES } from './src/shared/api/image-request-limits';

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  experimental: {
    cpus: 2,
    // The default 10 MiB truncates valid JSON containing multiple image references.
    proxyClientMaxBodySize: IMAGE_GENERATION_REQUEST_MAX_BYTES,
  },
  logging: { incomingRequests: { ignore: [/\/identity\/callback/] } },
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), payment=(), usb=()' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
      ],
    }];
  },
  turbopack: {
    root: process.cwd(),
    // Явный UI bridge для ChatModule 0.12; его бизнес-пакеты не форкаются.
    resolveAlias: { 'lucide-react': '@prodactionpro/ui-core/icons' },
  },
  webpack(config) {
    config.resolve.alias['lucide-react$'] = '@prodactionpro/ui-core/icons';
    return config;
  },
};

export default nextConfig;
