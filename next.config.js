/** @type {import('next').NextConfig} */
const nextConfig = {
  // xlsx uses some Node.js internals; tell webpack to ignore them on client side
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        stream: false,
        crypto: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
