export default {
  // GitHub Pages 프로젝트 페이지는 /<repo>/ 하위에서 서빙된다
  base: process.env.BASE_PATH ?? "/coindodger/",
  server: { port: 5188, open: false },
  build: { target: "es2022", chunkSizeWarningLimit: 6000 },
};
