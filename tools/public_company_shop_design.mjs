import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { superMegaBrandIdentity, superMegaBrandMark } from '../showroom/src/core/brand-mark.ts';

const designDirectory = resolve(dirname(fileURLToPath(import.meta.url)), 'public-assets', 'company-shop');
const readDesignSource = (filename) => readFileSync(resolve(designDirectory, filename), 'utf8');

export const companyShopStyle = readDesignSource('company.css');
export const companyMarkup = readDesignSource('company-home.html');
export const shopMarkup = readDesignSource('shop-page.html');
export const shopDemoScript = readDesignSource('shop-sample-demo.js');

export const brandMarkHtml = `<svg viewBox="${superMegaBrandMark.viewBox}" width="${superMegaBrandMark.width}" height="${superMegaBrandMark.height}" focusable="false"><path d="${superMegaBrandMark.path}" fill="none" stroke="${superMegaBrandIdentity.accent}" stroke-width="${superMegaBrandMark.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function brandFaviconSvg(accent) {
  if (!/^#[0-9a-f]{6}$/i.test(accent)) throw new Error('brand_accent_invalid');
  if (accent.toLowerCase() !== superMegaBrandIdentity.accent) throw new Error('brand_accent_mismatch');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${superMegaBrandMark.viewBox}" role="img" aria-label="${superMegaBrandIdentity.name} terminal mark" shape-rendering="geometricPrecision">
  <path d="${superMegaBrandMark.path}" fill="none" stroke="${accent}" stroke-width="${superMegaBrandMark.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>\n`;
}

export function companyShopHeaderHtml(route) {
  const shopActive = route === '/shop/';
  const contactActive = route === '/contact/';
  const loginHref = shopActive ? 'https://app.supermega.dev/login?product=shop' : 'https://app.supermega.dev/login';
  return `<header class="site-header"><div class="wrap header-inner">
    <a class="brand" href="/" aria-label="${superMegaBrandIdentity.name} home">
      <span class="brand-mark" aria-hidden="true">${brandMarkHtml}</span>
      <span class="brand-word">${superMegaBrandIdentity.name}</span>
    </a>
    <nav class="nav-links" aria-label="Main navigation">
      <a href="/shop/" ${shopActive ? 'aria-current="page"' : ''}>Shop</a>
      <a href="/contact/" ${contactActive ? 'aria-current="page"' : ''}>Contact</a>
      <a href="${loginHref}">Login</a>
    </nav>
  </div></header>`;
}

export function companyShopFooterHtml(route, year) {
  const label = route === '/shop/' ? `${superMegaBrandIdentity.name} Shop` : superMegaBrandIdentity.name;
  const home = route === '/shop/' ? '/shop/' : '/';
  return `<footer class="footer"><div class="wrap footer-row">
    <a class="brand" href="${home}" aria-label="${label}, back to top"><span class="brand-mark" aria-hidden="true">${brandMarkHtml}</span><span class="brand-word">${superMegaBrandIdentity.name}</span></a>
    <nav class="footer-links" aria-label="Footer"><a href="/contact/">Contact</a><a href="/privacy/">Privacy</a><span>&copy; ${year} ${superMegaBrandIdentity.name}</span></nav>
  </div></footer>`;
}
