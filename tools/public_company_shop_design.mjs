import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { superMegaBrandIdentity, superMegaBrandMark } from '../showroom/src/core/brand-mark.ts';

const designDirectory = resolve(dirname(fileURLToPath(import.meta.url)), 'public-assets', 'company-shop');
const readDesignSource = (filename) => readFileSync(resolve(designDirectory, filename), 'utf8');

export const companyShopStyle = readDesignSource('company.css');
export const shopMarkup = readDesignSource('shop-page.html');
// The optional interactive example uses the same rights-cleared, illustrative
// catalog as the browser capture. Embed these small derivatives so the source
// demo cannot silently drift back to fabricated products or remote hotlinks.
const sourceCatalog = JSON.parse(readFileSync(resolve(designDirectory, '..', '..', 'qa-assets', 'shop-products', 'sources.json'), 'utf8'));
const demoCatalog = sourceCatalog.products.map(product => ({
  id: product.sku,
  name: product.name,
  myanmar: product.name_my,
  category: product.category,
  price: product.sample_catalog_price_mmk,
  initialStock: product.sample_opening_stock,
  photo: `data:image/png;base64,${readFileSync(resolve(designDirectory, '..', '..', 'qa-assets', 'shop-products', product.file)).toString('base64')}`,
}));
export const shopDemoScript = readDesignSource('shop-sample-demo.js').replace('__SHOP_SAMPLE_PRODUCTS__', JSON.stringify(demoCatalog));

export const brandMarkHtml = `<svg viewBox="${superMegaBrandMark.viewBox}" width="${superMegaBrandMark.width}" height="${superMegaBrandMark.height}" focusable="false"><path d="${superMegaBrandMark.path}" fill="none" stroke="${superMegaBrandIdentity.accent}" stroke-width="${superMegaBrandMark.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function brandFaviconSvg(accent) {
  if (!/^#[0-9a-f]{6}$/i.test(accent)) throw new Error('brand_accent_invalid');
  if (accent.toLowerCase() !== superMegaBrandIdentity.accent) throw new Error('brand_accent_mismatch');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${superMegaBrandMark.viewBox}" role="img" aria-label="${superMegaBrandIdentity.name} terminal mark" shape-rendering="geometricPrecision">
  <path d="${superMegaBrandMark.path}" fill="none" stroke="${accent}" stroke-width="${superMegaBrandMark.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>\n`;
}

export function companyShopHeaderHtml(route, locale = 'en') {
  const isMyanmar = locale === 'my';
  const baseRoute = route.startsWith('/my/') ? route.slice(3) : route;
  const shopActive = baseRoute === '/shop/';
  const contactActive = baseRoute === '/contact/';
  const shopHref = isMyanmar ? '/my/shop/' : '/shop/';
  const contactHref = isMyanmar ? '/my/contact/' : '/contact/';
  const switchHref = ['/shop/', '/contact/', '/privacy/'].includes(baseRoute)
    ? (isMyanmar ? baseRoute : `/my${baseRoute}`) : '/my/shop/';
  return `<header class="site-header"><div class="wrap header-inner">
    <a class="brand" href="${shopHref}" aria-label="${superMegaBrandIdentity.name} ${isMyanmar ? 'ဆိုင်' : 'Shop'}">
      <span class="brand-mark" aria-hidden="true">${brandMarkHtml}</span>
      <span class="brand-word">${superMegaBrandIdentity.name}</span>
    </a>
    <nav class="nav-links" aria-label="${isMyanmar ? 'အဓိက လမ်းညွှန်' : 'Main navigation'}">
      <a href="${shopHref}" ${shopActive ? 'aria-current="page"' : ''}>${isMyanmar ? 'ဆိုင်' : 'Shop'}</a>
      <a href="${contactHref}" ${contactActive ? 'aria-current="page"' : ''}>${isMyanmar ? 'ဆက်သွယ်ရန်' : 'Contact'}</a>
      <a href="${switchHref}" data-language-switch hreflang="${isMyanmar ? 'en' : 'my'}">${isMyanmar ? 'အင်္ဂလိပ်' : 'မြန်မာ'}</a>
    </nav>
  </div></header>`;
}

export function companyShopFooterHtml(_route, year, locale = 'en') {
  const isMyanmar = locale === 'my';
  const home = isMyanmar ? '/my/shop/' : '/shop/';
  return `<footer class="footer"><div class="wrap footer-row">
    <a class="brand" href="${home}" aria-label="${superMegaBrandIdentity.name} ${isMyanmar ? 'ဆိုင်' : 'Shop'}"><span class="brand-mark" aria-hidden="true">${brandMarkHtml}</span><span class="brand-word">${superMegaBrandIdentity.name}</span></a>
    <nav class="footer-links" aria-label="${isMyanmar ? 'အောက်ခြေ လမ်းညွှန်' : 'Footer'}"><a href="${isMyanmar ? '/my/contact/' : '/contact/'}">${isMyanmar ? 'ဆက်သွယ်ရန်' : 'Contact'}</a><a href="${isMyanmar ? '/my/privacy/' : '/privacy/'}">${isMyanmar ? 'ကိုယ်ရေးအချက်အလက် မူဝါဒ' : 'Privacy'}</a><span>&copy; ${year} ${superMegaBrandIdentity.name}</span></nav>
  </div></footer>`;
}
