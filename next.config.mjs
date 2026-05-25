/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // pdfjs-dist ships an ESM worker that needs to be served as a static asset.
    // Disable canvas (Node-only dep) when bundling for the browser.
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
