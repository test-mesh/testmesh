import type { Metadata } from "next";
import { Space_Grotesk, Geist_Mono } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/lib/providers/query-provider";
import { ThemeProvider } from "@/lib/providers/theme-provider";
import { AuthProvider } from "@/lib/auth/AuthContext";
import { MainLayout } from "@/components/layout";
import { WorkspaceProvider } from "@/components/workspaces/WorkspaceProvider";
import { Toaster } from "@/components/ui/sonner";
import { CloudAuthGuard } from "@/components/auth/CloudAuthGuard";

const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-sans' });

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TestMesh - E2E Integration Testing Platform",
  description: "Execute YAML-defined tests across HTTP, Database, Kafka, gRPC, WebSocket, and Browser protocols",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={spaceGrotesk.variable} suppressHydrationWarning>
      <body
        className={`${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <QueryProvider>
            <AuthProvider>
              <CloudAuthGuard>
                <WorkspaceProvider>
                  <MainLayout>{children}</MainLayout>
                </WorkspaceProvider>
              </CloudAuthGuard>
            </AuthProvider>
          </QueryProvider>
          <Toaster richColors theme="dark" />
        </ThemeProvider>
      </body>
    </html>
  );
}
