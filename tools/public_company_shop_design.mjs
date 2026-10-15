import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const designDirectory = resolve(dirname(fileURLToPath(import.meta.url)), 'public-assets', 'company-shop');
const readDesignSource = (filename) => readFileSync(resolve(designDirectory, filename), 'utf8');

export const companyShopStyle = readDesignSource('company.css');
export const companyMarkup = readDesignSource('company-home.html');
export const shopMarkup = readDesignSource('shop-page.html');
export const shopDemoScript = readDesignSource('shop-sample-demo.js');

export function companyShopHeaderHtml(route) {
  const companyActive = route === '/';
  const shopActive = route === '/shop/';
  return `<header class="site-header"><div class="wrap header-inner">
    <a class="brand" href="/" aria-label="SuperMega home">
      <span class="brand-icon" aria-hidden="true"><svg viewBox="0 0 40 40"><rect x="1" y="1" width="38" height="38" rx="7" fill="#07111f"/><path d="m12 13 8 7-8 7m10-1h7" fill="none" stroke="#3b82f6" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      <span class="brand-word">SuperMega</span><span class="brand-domain">Operating software</span>
    </a>
    <nav class="nav-links" aria-label="Main navigation">
      <a href="/" ${companyActive ? 'aria-current="page"' : ''}>Company</a>
      <a href="/shop/" ${shopActive ? 'aria-current="page"' : ''}>Shop</a>
      <a href="/contact/">Contact</a>
      <a href="https://app.supermega.dev/login">Login</a>
    </nav>
  </div></header>`;
}

export function companyShopFooterHtml(route, year) {
  const label = route === '/shop/' ? 'SuperMega / Shop' : 'SuperMega';
  const home = route === '/shop/' ? '/shop/' : '/';
  return `<footer class="footer"><div class="wrap footer-row">
    <a class="brand" href="${home}" aria-label="${label}, back to top"><span class="brand-icon" aria-hidden="true"><svg viewBox="0 0 40 40"><rect x="1" y="1" width="38" height="38" rx="7" fill="#07111f"/><path d="m12 13 8 7-8 7m10-1h7" fill="none" stroke="#3b82f6" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>${label}</span></a>
    <nav class="footer-links" aria-label="Footer"><a href="/contact/">Contact</a><a href="/privacy/">Privacy</a><span>&copy; ${year} SuperMega</span></nav>
  </div></footer>`;
}
