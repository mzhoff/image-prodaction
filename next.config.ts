import type { NextConfig } from 'next';

type ImageRemotePattern = NonNullable<NonNullable<NextConfig['images']>['remotePatterns']>[number];

const localMinioRemotePatterns: ImageRemotePattern[] = [
  {
    protocol: 'http',
    hostname: 'localhost',
    port: '9000',
    pathname: '/**',
  },
  {
    protocol: 'http',
    hostname: '127.0.0.1',
    port: '9000',
    pathname: '/**',
  },
];

const configuredS3RemotePatterns = [
  process.env.S3_PUBLIC_BASE_URL,
  process.env.S3_ENDPOINT,
].flatMap((url) => {
  const pattern = createImageRemotePattern(url);
  return pattern ? [pattern] : [];
});

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  images: {
    remotePatterns: uniqueImageRemotePatterns([
      ...localMinioRemotePatterns,
      ...configuredS3RemotePatterns,
    ]),
  },
  reactStrictMode: true,
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;

function createImageRemotePattern(value: string | undefined): ImageRemotePattern | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return {
      protocol: url.protocol.slice(0, -1) as 'http' | 'https',
      hostname: url.hostname,
      port: url.port,
      pathname: '/**',
    };
  } catch {
    return null;
  }
}

function uniqueImageRemotePatterns(patterns: ImageRemotePattern[]) {
  const seen = new Set<string>();
  return patterns.filter((pattern) => {
    const key = `${pattern.protocol}:${pattern.hostname}:${pattern.port ?? ''}:${pattern.pathname ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
