/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 媒體全部來自外部網址，圖片不需要 Next 的圖片最佳化管線
  images: { unoptimized: true },
};

export default nextConfig;
