import "augmented-ui/augmented-ui.min.css";
import "./globals.css";

export const metadata = {
  title: "PACKWORKS",
  description: "Crack packs, complete the binder, and build an isometric card workshop.",
  applicationName: "PACKWORKS",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#10191c",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
