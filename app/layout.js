import "augmented-ui/augmented-ui.min.css";
import "./globals.css";
import "./gameplay-v2.css";

export const metadata = {
  title: "PACKWORKS",
  description: "Open sealed product, build a paying binder, and take a twelve-card deck through the local league.",
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
