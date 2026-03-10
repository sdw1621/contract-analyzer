import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "공정거래 계약서 분석기",
  description: "계약서·약관의 불공정 조항을 AI가 분석합니다. 약관법, 전자상거래법 등 대한민국 공정거래 관련 법령에 기반한 분석을 제공합니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
