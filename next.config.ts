import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable React strict mode for Three.js compatibility
  reactStrictMode: false,

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
    ],
  },

  // Ignore TypeScript build errors (React Three Fiber types are provided at runtime)
  typescript: {
    ignoreBuildErrors: true,
  },

  // webpack: (config) => {
  //   // Handle GLSL shaders
  //   config.module.rules.push({
  //     test: /\.(glsl|vs|fs|vert|frag)$/,
  //     type: 'asset/source',
  //   });

  //   // Suppress warnings for certain modules
  //   config.resolve.fallback = {
  //     ...config.resolve.fallback,
  //     fs: false,
  //     path: false,
  //   };

  //   return config;
  // },

  // Transpile Three.js and R3F packages
  transpilePackages: ["three", "@react-three/fiber", "@react-three/drei"],
};

export default nextConfig;
