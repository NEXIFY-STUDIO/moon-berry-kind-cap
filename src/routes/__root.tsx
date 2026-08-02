import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { Toaster } from "sonner";
import appCss from "../styles.css?url";
import {
  SITE_DESCRIPTION,
  SITE_TITLE,
  buildHeadJsonLdScripts,
} from "@/lib/seo/json-ld";
import { LocaleProvider } from "@/lib/i18n/context";

/** Absolute-path social image (resolves against deploy origin). */
const OG_IMAGE = "/android-chrome-512x512.png";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      { title: SITE_TITLE },
      { name: "description", content: SITE_DESCRIPTION },
      { name: "theme-color", content: "#0a0a0b" },
      { name: "application-name", content: "Blueprint" },
      { name: "author", content: "Blueprint Scanner" },
      {
        name: "keywords",
        content:
          "blueprint, frontend snapshot, reverse engineering, WordPress, JetEngine, Elementor, PWA, crawl",
      },
      { name: "robots", content: "index, follow" },

      // Open Graph
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Blueprint" },
      { property: "og:locale", content: "en_US" },
      { property: "og:locale:alternate", content: "sk_SK" },
      { property: "og:title", content: SITE_TITLE },
      { property: "og:description", content: SITE_DESCRIPTION },
      { property: "og:image", content: OG_IMAGE },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:width", content: "512" },
      { property: "og:image:height", content: "512" },
      {
        property: "og:image:alt",
        content: "Blueprint Scanner — frontend reverse-spec tool",
      },

      // Twitter / X Card
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: SITE_TITLE },
      { name: "twitter:description", content: SITE_DESCRIPTION },
      { name: "twitter:image", content: OG_IMAGE },
      {
        name: "twitter:image:alt",
        content: "Blueprint Scanner — frontend reverse-spec tool",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: "/apple-touch-icon.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "32x32",
        href: "/favicon-32x32.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "16x16",
        href: "/favicon-16x16.png",
      },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      // Auth-gated preview proxies 401 credential-less manifest fetches.
      // Spec: https://www.w3.org/TR/appmanifest/#using-a-link-element-to-link-to-a-manifest
      {
        rel: "manifest",
        href: "/site.webmanifest",
        crossOrigin: "use-credentials",
      },

    ],
    scripts: buildHeadJsonLdScripts(),
  }),
  component: RootDocument,
});

function RootDocument() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-dvh bg-bg text-fg antialiased">
        <LocaleProvider>
          <Outlet />
          <Toaster
            theme="dark"
            position="bottom-right"
            toastOptions={{
              className: "border border-border bg-bg-elevated text-fg",
            }}
          />
        </LocaleProvider>
        <Scripts />
      </body>
    </html>
  );
}
