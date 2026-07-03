import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 狭い画面では4隅どの位置でも他要素と重なるため、非表示にする。
  devIndicators: false,
};

export default nextConfig;
