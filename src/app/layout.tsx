import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RM Partiu Viagens CRM",
  description: "Central operacional para vendas, financeiro e acompanhamento da RM Partiu Viagens.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                function cleanExtensionAttributes() {
                  document.querySelectorAll('[bis_skin_checked]').forEach(function (node) {
                    node.removeAttribute('bis_skin_checked');
                  });
                }
                cleanExtensionAttributes();
                new MutationObserver(cleanExtensionAttributes).observe(document.documentElement, {
                  attributes: true,
                  childList: true,
                  subtree: true,
                  attributeFilter: ['bis_skin_checked']
                });
              })();
            `,
          }}
        />
        {children}
      </body>
    </html>
  );
}
