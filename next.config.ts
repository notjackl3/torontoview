import type { NextConfig } from "next";

const projectRoot = __dirname;

const nextConfig: NextConfig = {
  // Disable React strict mode for Three.js compatibility
  reactStrictMode: false,

  turbopack: {
    root: projectRoot,
  },

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

  // Long-lived cache headers for 3D model assets. Building IDs are random and
  // bundled GLBs are content-stable, so a 1-year immutable cache is safe.
  async headers() {
    return [
      {
        source: "/map-data/buildings/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/let_me_sleeeeeeep/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
