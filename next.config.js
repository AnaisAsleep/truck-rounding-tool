/** @type {import('next').NextConfig} */
const nextConfig = {
  // Don't fail the build on ESLint warnings/errors
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Don't fail the build on TypeScript errors
  typescript: {
    ignoreBuildErrors: true,
  },
  // xlsx uses some Node.js internals; tell webpack to ignore them on client side
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        stream: false,
        crypto: false,
        zlib: false,
        http: false,
        https: false,
        net: false,
        tls: false,
        child_process: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
