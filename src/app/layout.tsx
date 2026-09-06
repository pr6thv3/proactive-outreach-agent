import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "Proactive Outreach Agent — Observe-Think-Act Architecture",
  description: "Multi-agent workflow showing orchestrator, sub-agents, and tool integrations across four phases: Observe, Think, Act, Re-Eval",
  keywords: ["AI Agent", "Proactive Outreach", "Multi-Agent", "Sales Automation", "LLM"],
  authors: [{ name: "Proactive Outreach Agent" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
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
        className="antialiased bg-background text-foreground"
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
