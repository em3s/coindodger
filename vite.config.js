import { VitePWA } from "vite-plugin-pwa";

// 빌드만 하위 경로(/coindodger/)로 나간다. 개발 서버는 루트로 둬야 편하다.
// 에셋 경로는 src/config.js 의 BASE_URL 이 양쪽을 알아서 흡수한다.
export default ({ command }) => {
  const base = command === "build" ? process.env.BASE_PATH ?? "/coindodger/" : "/";
  return {
    base,
    define: {
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
    server: { port: 5188, open: false },
    build: { target: "es2022", chunkSizeWarningLimit: 6000 },
    plugins: [
      VitePWA({
        // 새 버전을 몰래 갈아끼우지 않고, 우리가 만든 배너로 알린 뒤 사용자가 누르면 적용한다
        registerType: "prompt",
        includeAssets: ["icons/*.png"],
        manifest: {
          name: "Coin Dozer",
          short_name: "Coin Dozer",
          description: "실제 기계 구조를 물리로 재현한 코인 푸셔. 시계이자 방치형 장난감.",
          lang: "ko",
          start_url: base,
          scope: base,
          display: "standalone",
          orientation: "any",
          background_color: "#05060a",
          theme_color: "#05060a",
          icons: [
            { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
            {
              src: "icons/icon-maskable-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          // Babylon 번들과 Havok wasm이 커서 기본 상한(2MB)으로는 캐시되지 않는다
          globPatterns: ["**/*.{js,css,html,wasm,env,png}"],
          maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
          cleanupOutdatedCaches: true,
        },
        devOptions: { enabled: false },
      }),
    ],
  };
};
