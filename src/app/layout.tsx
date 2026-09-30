import type { ReactNode } from "react";

export const metadata = {
  title: "Caf.ai",
  // PLACEHOLDER: no brand icon exists in the plan or wireframes yet; an empty data URI stops the browser's /favicon.ico 404.
  icons: { icon: "data:," },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
