/** @type {import('next').NextConfig} */
const nextConfig = {
  // React Strict Mode は開発時にマウントを2回走らせる。
  // react-three-fiber はこの二重マウントで WebGL ルートの生成に失敗することがあり、
  // 3Dオフィスが真っ白のまま初期化されない。3Dを使う都合で無効にしている。
  reactStrictMode: false,
};

export default nextConfig;
