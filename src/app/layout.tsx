import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import "katex/dist/katex.min.css";
import { Toaster } from "@/components/ui/toaster";
import { SpeedInsights } from "@vercel/speed-insights/next";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ADposter — платформа тестов",
  description: "Создавай тесты, делись версиями и расти: личная и общая библиотека, дерево версий, материалы и ИИ-репетитор — в одном месте.",
  keywords: ["тесты", "quiz", "education", "adposter", "библиотека знаний", "версии"],
  authors: [{ name: "ADposter" }],
  icons: {
    icon: "/logo-icon.png",
    apple: "/logo-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${bricolage.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
        {/* Real-user Core Web Vitals (LCP / INP / CLS) → Vercel dashboard */}
        <SpeedInsights />
      </body>
    </html>
  );
}
