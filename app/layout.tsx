import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-game",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const base = new URL(`${protocol}://${host}`);
  const title = "Sky Duel — Browser Biplane Dogfights";
  const description =
    "A fast, stripped-back pixel biplane dogfight for two to six pilots. Climb, lead your shot, and recover from the stall.";
  return {
    metadataBase: base,
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: new URL("/og.png", base).toString(), width: 1536, height: 1024 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [new URL("/og.png", base).toString()],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={geistMono.variable}>
        {children}
      </body>
    </html>
  );
}
