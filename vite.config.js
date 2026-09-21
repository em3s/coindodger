// 빌드만 하위 경로(/coindodger/)로 나간다. 개발 서버는 루트로 둬야 편하다.
// 에셋 경로는 src/config.js 의 BASE_URL 이 양쪽을 알아서 흡수한다.
export default ({ command }) => ({
  base: command === "build" ? process.env.BASE_PATH ?? "/coindodger/" : "/",
  server: { port: 5188, open: false },
  build: { target: "es2022", chunkSizeWarningLimit: 6000 },
});
