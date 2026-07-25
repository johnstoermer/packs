import "augmented-ui/augmented-ui.min.css";
import "./globals.css";
import "./gameplay-v2.css";
import "./gameplay-clean.css";

export const metadata = {
  title: "PACKWORKS",
  description: "Open card packs, grow a paying binder, and buy better sealed product.",
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
