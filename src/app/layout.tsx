import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "はてなベース AI OFFICE",
  description:
    "社長の指示をPMが分解し、AI社員が並行して働くバーチャルオフィス。Claude Fable 5 で動きます。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0A2846",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      {/* ブラウザ拡張が body に属性を足すことがあるため、その差分は無視する */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
