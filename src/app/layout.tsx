import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

import Header from "@/components/Header";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SOC Dashboard - Security Operations Center",
  description: "Security Operations Center Dashboard for monitoring and alerting",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} flex h-screen overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]`}>
        <Sidebar />
        <main className="flex-1 flex flex-col h-screen overflow-y-auto">
          <Header />
          {children}
        </main>
      </body>
    </html>
  );
}
