import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Belarro OP",
  description: "Belarro farm operations — admin and field",
  manifest: "/manifest.json",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Belarro" },
};

export const viewport: Viewport = {
  themeColor: "#10B981",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  return (
    <html lang="en">
      <body>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `if ('serviceWorker' in navigator) { window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {})); }`,
          }}
        />
        {mapsKey && (
          <>
            <script
              dangerouslySetInnerHTML={{
                __html: `window.initGoogleMaps = function() { window.dispatchEvent(new Event('google-maps-loaded')); };`,
              }}
            />
            <script
              src={`https://maps.googleapis.com/maps/api/js?key=${mapsKey}&libraries=places,marker&loading=async&callback=initGoogleMaps`}
              async
            />
          </>
        )}
      </body>
    </html>
  );
}
