type LocaleConfig = {
  lang: string;
  ogLocale: string;
};

const LOCALE_CONFIGS: Record<string, LocaleConfig> = {
  es: { lang: "es", ogLocale: "es_ES" },
  "pt-br": { lang: "pt-BR", ogLocale: "pt_BR" },
};

const PUBLIC_PAGES = ["/", "/about", "/careers", "/contact", "/privacy", "/terms", "/security"];

function parseLocalePath(pathname: string): { urlLocale: string | null; basePath: string } {
  const clean = pathname.split("?")[0];
  const segments = clean.split("/").filter(Boolean);
  const first = segments[0]?.toLowerCase();
  if (first && LOCALE_CONFIGS[first]) {
    const rest = segments.slice(1).join("/");
    return { urlLocale: first, basePath: rest ? `/${rest}` : "/" };
  }
  return { urlLocale: null, basePath: clean || "/" };
}

export function injectLocaleMetadata(
  html: string,
  pathname: string,
  baseUrl: string,
): string {
  const { urlLocale, basePath } = parseLocalePath(pathname);
  if (!PUBLIC_PAGES.includes(basePath)) return html;

  const localeConfig = urlLocale ? LOCALE_CONFIGS[urlLocale] : null;
  const lang = localeConfig ? localeConfig.lang : "en";

  const pageSuffix = basePath === "/" ? "" : basePath;
  const enHref = `${baseUrl}${pageSuffix || "/"}`;
  const esHref = `${baseUrl}/es${pageSuffix}`;
  const ptHref = `${baseUrl}/pt-br${pageSuffix}`;
  const canonicalHref = urlLocale
    ? `${baseUrl}/${urlLocale}${pageSuffix}`
    : enHref;

  const metaTags = [
    `    <link rel="canonical" href="${canonicalHref}" />`,
    `    <link rel="alternate" hreflang="x-default" href="${enHref}" />`,
    `    <link rel="alternate" hreflang="en" href="${enHref}" />`,
    `    <link rel="alternate" hreflang="es" href="${esHref}" />`,
    `    <link rel="alternate" hreflang="pt-BR" href="${ptHref}" />`,
    localeConfig ? `    <meta property="og:locale" content="${localeConfig.ogLocale}" />` : "",
  ].filter(Boolean).join("\n");

  let result = html.replace(/<html([^>]*)\blang="[^"]*"/, `<html$1lang="${lang}"`);

  result = result.replace("</head>", `${metaTags}\n  </head>`);

  return result;
}

export function getBaseUrl(req: { protocol: string; get: (header: string) => string | undefined; headers: Record<string, string | string[] | undefined> }): string {
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  const host = (req.headers["x-forwarded-host"] as string) || req.get("host") || "localhost";
  return `${proto}://${host}`;
}
