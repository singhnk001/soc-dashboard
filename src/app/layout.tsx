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
    <html lang="en" className="dark h-full w-full">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{localStorage.removeItem('soc_display_scale');if(document.documentElement){document.documentElement.style.zoom='';}}catch(e){}})();`,
          }}
        />
      </head>
      <body className={`${inter.className} flex h-screen w-full overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)] antialiased`}>
        <Sidebar />
        <div className="flex-1 flex flex-col h-full min-h-0 min-w-0 overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto min-h-0 bg-[var(--bg-secondary)]">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
