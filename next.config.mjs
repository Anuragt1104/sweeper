/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The engine keeps an in-memory autonomous run loop on the server singleton;
  // these packages are server-only and should not be bundled for the browser.
  serverExternalPackages: ["@solana/web3.js"],
};

export default nextConfig;
