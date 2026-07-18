/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  outputFileTracingRoot: import.meta.dirname,
  // The engine keeps an in-memory autonomous run loop on the server singleton;
  // these packages are server-only and should not be bundled for the browser.
  serverExternalPackages: ["@solana/web3.js", "@coral-xyz/anchor", "pg", "pg-native", "pg-connection-string"],
};

export default nextConfig;
