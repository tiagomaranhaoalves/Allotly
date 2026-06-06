import { useEffect } from "react";

interface PageMeta {
  title: string;
  description: string;
}

function setMetaTag(selector: string, attr: string, value: string) {
  let el = document.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    const [attrName, attrValue] = selector
      .replace(/^\[|\]$/g, "")
      .split(/="|"$/)
      .filter(Boolean);
    if (attrName && attrValue) {
      el.setAttribute(attrName, attrValue);
    }
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
  return el;
}

export function usePageMeta({ title, description }: PageMeta) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title;

    const descEl = setMetaTag('meta[name="description"]', "content", description);
    const prevDesc = descEl.getAttribute("content") ?? "";

    const ogTitleEl = setMetaTag('meta[property="og:title"]', "content", title);
    const prevOgTitle = ogTitleEl.getAttribute("content") ?? "";

    const ogDescEl = setMetaTag('meta[property="og:description"]', "content", description);
    const prevOgDesc = ogDescEl.getAttribute("content") ?? "";

    const twTitleEl = setMetaTag('meta[name="twitter:title"]', "content", title);
    const prevTwTitle = twTitleEl.getAttribute("content") ?? "";

    const twDescEl = setMetaTag('meta[name="twitter:description"]', "content", description);
    const prevTwDesc = twDescEl.getAttribute("content") ?? "";

    return () => {
      document.title = prevTitle;
      descEl.setAttribute("content", prevDesc);
      ogTitleEl.setAttribute("content", prevOgTitle);
      ogDescEl.setAttribute("content", prevOgDesc);
      twTitleEl.setAttribute("content", prevTwTitle);
      twDescEl.setAttribute("content", prevTwDesc);
    };
  }, [title, description]);
}
