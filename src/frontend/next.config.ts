import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: {
    // bottom-left（デフォルト）は入力欄、bottom-rightは送信ボタンと重なる。
    // /create の見出し行の左側（タイトル・保存状態インジケーター）はテキストのみで
    // クリック可能な要素がないため、top-leftを採用。
    position: "top-left",
  },
};

export default nextConfig;
