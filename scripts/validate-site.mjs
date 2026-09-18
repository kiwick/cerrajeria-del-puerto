import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { load } from 'cheerio';

const root = process.cwd();
const fixtures = path.join(root, 'tests', 'fixtures', 'current');
const dist = path.join(root, 'dist');
const publicFiles = ['robots.txt', 'sitemap.xml', 'llms.txt', 'CNAME'];
const pages = [
  { name: 'Home', fixture: 'index.html', output: 'index.html', url: 'https://www.cerrajeriadelpuertogandia.com/' },
  { name: 'Gandía', fixture: 'gandia.html', output: 'gandia/index.html', url: 'https://www.cerrajeriadelpuertogandia.com/gandia/', validateFaq: true },
  { name: 'Playa de Gandía', fixture: 'playa-de-gandia.html', output: 'playa-de-gandia/index.html', url: 'https://www.cerrajeriadelpuertogandia.com/playa-de-gandia/', validateFaq: true },
  { name: 'Oliva', fixture: 'oliva.html', output: 'oliva/index.html', url: 'https://www.cerrajeriadelpuertogandia.com/oliva/', validateFaq: true },
  { name: 'Playa de Oliva', fixture: 'playa-de-oliva.html', output: 'playa-de-oliva/index.html', url: 'https://www.cerrajeriadelpuertogandia.com/playa-de-oliva/', validateFaq: true },
  { name: 'Tavernes de la Valldigna', fixture: 'tavernes-de-la-valldigna.html', output: 'tavernes-de-la-valldigna/index.html', url: 'https://www.cerrajeriadelpuertogandia.com/tavernes-de-la-valldigna/', validateFaq: true },
  { name: 'Xeraco', fixture: 'xeraco.html', output: 'xeraco/index.html', url: 'https://www.cerrajeriadelpuertogandia.com/xeraco/', validateFaq: true },
  { name: 'Seguridad en puertas y cerraduras', fixture: 'seguridad-puertas-cerraduras.html', output: 'seguridad-puertas-cerraduras/index.html', url: 'https://www.cerrajeriadelpuertogandia.com/seguridad-puertas-cerraduras/', validateFaq: true, allowClientJavaScript: true },
  { name: 'Daimús', fixture: 'daimus.html', output: 'daimus/index.html', url: 'https://www.cerrajeriadelpuertogandia.com/daimus/', validateFaq: true },
];

const normalize = (value = '') => value.replace(/\s+/g, ' ').trim();
const sortedAttributes = (element) => Object.fromEntries(Object.entries(element.attribs ?? {}).sort(([a], [b]) => a.localeCompare(b)));

function extract(html) {
  const $ = load(html);
  const meta = (selector, attribute = 'content') => $(selector).map((_, element) => $(element).attr(attribute) ?? '').get();
  const links = $('a').map((_, element) => ({
    attributes: sortedAttributes(element),
    text: normalize($(element).text()),
    accessibleText: normalize($(element).attr('aria-label') || $(element).text()),
  })).get();
  const jsonLd = $('script[type="application/ld+json"]').map((_, element) => JSON.parse($(element).html())).get();
  const visibleRoot = $('body').clone();
  visibleRoot.find('script,style').remove();
  const graphNodes = jsonLd.flatMap((schema) => schema['@graph'] ?? [schema]);
  const business = graphNodes.find((node) => {
    const type = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
    return type.includes('LocalBusiness');
  });
  return {
    doctype: /^\s*<!doctype html>/i.test(html),
    title: $('title').text(),
    description: meta('meta[name="description"]'), robots: meta('meta[name="robots"]'), canonical: meta('link[rel="canonical"]', 'href'),
    openGraph: $('meta[property^="og:"]').map((_, element) => ({ property: $(element).attr('property'), content: $(element).attr('content') })).get(),
    twitter: $('meta[name^="twitter:"]').map((_, element) => ({ name: $(element).attr('name'), content: $(element).attr('content') })).get(),
    h1: $('h1').map((_, element) => normalize($(element).text())).get(),
    headings: $('h2,h3').map((_, element) => ({ tag: element.tagName.toLowerCase(), text: normalize($(element).text()) })).get(),
    visibleText: normalize(visibleRoot.text()), links,
    phones: links.filter(({ attributes }) => attributes.href?.startsWith('tel:')),
    whatsapp: links.filter(({ attributes }) => attributes.href?.startsWith('https://wa.me/')),
    facebook: links.filter(({ attributes }) => attributes.href?.includes('facebook.com')),
    instagram: links.filter(({ attributes }) => attributes.href?.includes('instagram.com')),
    googleMaps: links.filter(({ attributes }) => attributes.href?.includes('google.com/maps')),
    faqs: $('#faq details').map((_, element) => ({ question: normalize($(element).find('summary').text()), answer: normalize($(element).find('p').text()) })).get(),
    jsonLd,
    breadcrumb: graphNodes.filter((node) => node['@type'] === 'BreadcrumbList'),
    aggregateRating: business?.aggregateRating ?? null,
    areaServed: business?.areaServed ?? null,
    scripts: $('script').map((_, element) => ({ type: $(element).attr('type') ?? '', src: $(element).attr('src') ?? '' })).get(),
    hydration: $('astro-island,astro-slot').length,
    images: $('img').map((_, element) => ({ src: $(element).attr('src') ?? '', alt: $(element).attr('alt') ?? '', width: $(element).attr('width') ?? '', height: $(element).attr('height') ?? '', loading: $(element).attr('loading') ?? '' })).get(),
    comparison: {
      systemHeaders: $('thead th[data-system-column]').length,
      criteriaRows: $('tbody th[scope="row"]').length,
      valueCells: $('tbody td[data-system-column]').length,
    },
  };
}

const pageResults = [];
for (const page of pages) {
  const baseline = extract(await readFile(path.join(fixtures, page.fixture), 'utf8'));
  const generated = extract(await readFile(path.join(dist, page.output), 'utf8'));
  const checks = [
    ['doctype', baseline.doctype, generated.doctype], ['title', baseline.title, generated.title],
    ['description', baseline.description, generated.description], ['robots', baseline.robots, generated.robots],
    ['canonical', baseline.canonical, generated.canonical], ['OpenGraph', baseline.openGraph, generated.openGraph],
    ['Twitter metadata', baseline.twitter, generated.twitter], ['H1', baseline.h1, generated.h1],
    ['H2/H3 sequence', baseline.headings, generated.headings], ['visible normalized text', baseline.visibleText, generated.visibleText],
    ['links, order, attributes and accessible text', baseline.links, generated.links], ['telephone links', baseline.phones, generated.phones],
    ['WhatsApp links', baseline.whatsapp, generated.whatsapp], ['Facebook links', baseline.facebook, generated.facebook],
    ['Instagram links', baseline.instagram, generated.instagram], ['Google Maps links', baseline.googleMaps, generated.googleMaps],
    ['visible FAQs and order', baseline.faqs, generated.faqs], ['JSON-LD', baseline.jsonLd, generated.jsonLd],
    ['BreadcrumbList', baseline.breadcrumb, generated.breadcrumb], ['aggregateRating', baseline.aggregateRating, generated.aggregateRating],
    ['areaServed', baseline.areaServed, generated.areaServed],
  ];
  console.log(`PAGE ${page.name}`);
  for (const [name, expected, actual] of checks) {
    assert.deepStrictEqual(actual, expected, `${page.name}: ${name} differs from baseline`);
    console.log(`PASS ${name}`);
  }
  assert.equal(generated.h1.length, 1, `${page.name}: expected exactly one H1`);
  const clientScripts = generated.scripts.filter(({ type }) => type !== 'application/ld+json');
  if (page.allowClientJavaScript) assert.equal(clientScripts.length, 1, `${page.name}: expected exactly one comparator script`);
  else assert.equal(clientScripts.length, 0, `${page.name}: unexpected client JavaScript found`);
  assert.equal(generated.hydration, 0, `${page.name}: Astro hydration markup found`);
  if (page.allowClientJavaScript) {
    assert.deepStrictEqual(generated.comparison, { systemHeaders: 6, criteriaRows: 8, valueCells: 48 }, `${page.name}: complete comparison matrix must exist in static HTML`);
    assert.ok(!generated.scripts.some(({ src }) => src), `${page.name}: comparator JavaScript must remain isolated inline`);
    assert.ok(!(await readFile(path.join(dist, page.output), 'utf8')).includes('innerHTML'), `${page.name}: comparator must not generate content with innerHTML`);
  }
  assert.equal(generated.canonical[0], page.url, `${page.name}: canonical does not match public URL`);
  assert.deepStrictEqual(generated.robots, ['index,follow'], `${page.name}: robots must be index,follow`);
  const faqPage = generated.jsonLd.flatMap((schema) => schema['@graph'] ?? [schema]).find((node) => node['@type'] === 'FAQPage');
  if (page.validateFaq) {
    const structuredFaqs = faqPage?.mainEntity?.map((item) => ({ question: item.name, answer: item.acceptedAnswer?.text })) ?? [];
    assert.deepStrictEqual(structuredFaqs, generated.faqs, `${page.name}: visible FAQ differs from FAQPage JSON-LD`);
  }
  console.log('PASS exactly one H1');
  console.log(page.allowClientJavaScript ? 'PASS one isolated comparator script and no hydration' : 'PASS no client JavaScript or hydration');
  pageResults.push({ name: page.name, checks: checks.map(([name]) => name), status: 'PASS' });
}

for (const file of publicFiles) {
  assert.deepStrictEqual(await readFile(path.join(dist, file)), await readFile(path.join(fixtures, file)), `${file} differs byte-for-byte from baseline`);
  console.log(`PASS ${file} byte-for-byte`);
}

const generatedHtmlFiles = [];
const generatedJsFiles = [];
async function inspectOutput(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await inspectOutput(fullPath);
    else if (entry.name.endsWith('.html')) generatedHtmlFiles.push(path.relative(dist, fullPath).replaceAll('\\', '/'));
    else if (entry.name.endsWith('.js')) generatedJsFiles.push(path.relative(dist, fullPath).replaceAll('\\', '/'));
  }
}
await inspectOutput(dist);
assert.deepStrictEqual(generatedHtmlFiles.sort(), pages.map(({ output }) => output).sort(), 'Unexpected Astro HTML pages were generated');
assert.deepStrictEqual(generatedJsFiles, [], 'JavaScript assets were generated');
console.log('PASS exactly nine expected HTML pages');
console.log('PASS no JavaScript assets');

const sitemap = await readFile(path.join(dist, 'sitemap.xml'), 'utf8');
const sitemapUrls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
assert.deepStrictEqual(sitemapUrls, pages.map(({ url }) => url), 'Sitemap URLs differ from expected public URLs');
for (const url of sitemapUrls) {
  const parsed = new URL(url);
  assert.equal(parsed.protocol, 'https:', `Sitemap URL is not HTTPS: ${url}`);
  assert.equal(parsed.hostname, 'www.cerrajeriadelpuertogandia.com', `Sitemap URL does not use production www host: ${url}`);
  assert.ok(parsed.pathname.endsWith('/'), `Sitemap URL has no trailing slash: ${url}`);
}
console.log('PASS sitemap contains exactly nine HTTPS www URLs with trailing slashes');
const outputText = await Promise.all(generatedHtmlFiles.map((file) => readFile(path.join(dist, file), 'utf8')));
assert.ok(!outputText.join('\n').includes('github.io'), 'github.io URL found in generated HTML');
console.log('PASS no github.io URLs in generated HTML');

// Explicit requirements supplement fixture parity: a regenerated fixture cannot
// silently accept a regression in the new landing page or its internal links.
const daimus = extract(await readFile(path.join(dist, 'daimus/index.html'), 'utf8'));
const daimusHtml = await readFile(path.join(dist, 'daimus/index.html'), 'utf8');
const $daimus = load(daimusHtml);
const domain = 'https://www.cerrajeriadelpuertogandia.com';
assert.equal(daimus.title, 'Cerrajero 24h en Daimús | Cerrajería del Puerto');
assert.deepStrictEqual(daimus.description, ['Cerrajero 24h en Daimús. Apertura de puertas, cambio de cerraduras y bombines. Llegada habitual de 10 minutos.']);
assert.deepStrictEqual(daimus.h1, ['Cerrajero 24h en Daimús']);
assert.deepStrictEqual(daimus.areaServed, [{ '@type': 'City', name: 'Daimús' }, { '@type': 'Place', name: 'Playa de Daimús' }]);
assert.deepStrictEqual(daimus.breadcrumb[0]?.itemListElement, [
  { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${domain}/` },
  { '@type': 'ListItem', position: 2, name: 'Cerrajero en Daimús', item: `${domain}/daimus/` },
]);
for (const [property, content] of Object.entries({ 'og:title': daimus.title, 'og:description': daimus.description[0], 'og:url': `${domain}/daimus/` })) {
  assert.equal($daimus(`meta[property="${property}"]`).attr('content'), content);
}
assert.ok(daimus.phones.length > 0 && daimus.phones.every(({ attributes }) => attributes.href === 'tel:+34687929669'));
assert.ok(daimus.whatsapp.length > 0 && daimus.whatsapp.every(({ attributes }) => new URL(attributes.href).pathname === '/34687929669'));
assert.equal(daimus.faqs.length, 7);
assert.deepStrictEqual($daimus('#zona .areas span').map((_, el) => $daimus(el).text()).get(), ['Daimús', 'Playa de Daimús']);
assert.ok(daimus.visibleText.includes('Llegada habitual: 10 minutos'));
assert.ok(daimus.visibleText.includes('El tráfico, el punto exacto y la disponibilidad en el momento de la llamada pueden hacer variar este tiempo.'));
assert.ok(!/menos de 10 minutos|10 minutos garantizados/i.test(daimus.visibleText));
assert.ok(!/"(?:Product|Offer|Review|AggregateRating|aggregateRating)"/.test(JSON.stringify(daimus.jsonLd)));
const $home = load(await readFile(path.join(dist, 'index.html'), 'utf8'));
assert.equal($home('.areas a[href="/daimus/"]').length, 1, 'Home must link directly to Daimús in its existing zones');
const llms = await readFile(path.join(dist, 'llms.txt'), 'utf8');
assert.ok(llms.includes(`${domain}/daimus/`) && llms.includes('Playa de Daimús'));
const robots = await readFile(path.join(dist, 'robots.txt'), 'utf8');
assert.match(robots, /^Allow:\s*\/\s*$/m);
assert.ok(!/^Disallow:\s*\S+/m.test(robots), 'Unexpected crawl restriction');
assert.ok(robots.includes(`Sitemap: ${domain}/sitemap.xml`));
assert.equal(new Set(sitemapUrls).size, 9);
assert.ok(![sitemap, llms, robots].join('\n').includes('github.io'));
console.log('PASS Daimús SEO, coverage, contact, breadcrumb, home, sitemap, llms and robots');

const expectedReviews = JSON.parse(await readFile(path.join(root, 'tests/fixtures/daimus-reviews.json'), 'utf8'));
const actualReviews = $daimus('#opiniones .review').map((_, el) => ({ author: $daimus(el).find('footer strong').text(), text: $daimus(el).find('blockquote').text() })).get();
assert.deepStrictEqual(actualReviews, expectedReviews, 'Review authors and texts must match supplied screenshots exactly');
const contentNormalize = (text) => normalize(text.replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'"));
const texts = ($, selector) => $(selector).map((_, el) => contentNormalize($(el).text())).get();
const uniqueContent = [];
for (const page of pages.filter(({ name }) => name !== 'Daimús' && name !== 'Seguridad en puertas y cerraduras')) {
  const $other = load(await readFile(path.join(dist, page.output), 'utf8'));
  const previousReviews = texts($other, '#opiniones blockquote');
  const previousAuthors = texts($other, '#opiniones .review footer strong');
  for (const review of actualReviews) {
    assert.ok(!previousReviews.some((text) => text === contentNormalize(review.text) || text === `"${contentNormalize(review.text)}"`), `Review reused in ${page.name}`);
    assert.ok(!previousAuthors.includes(contentNormalize(review.author)), `Review author reused in ${page.name}`);
  }
  if (page.name === 'Home') continue;
  const duplicateParagraphs = texts($daimus, 'main p').filter((text) => texts($other, 'main p').includes(text));
  const duplicateHeadings = texts($daimus, 'main h2').filter((text) => texts($other, 'main h2').includes(text));
  const duplicateFaqs = texts($daimus, '#faq summary, #faq details p').filter((text) => texts($other, '#faq summary, #faq details p').includes(text));
  assert.deepStrictEqual(duplicateParagraphs, [], `Identical paragraphs in ${page.name}`);
  assert.deepStrictEqual(duplicateHeadings, [], `Identical H2 in ${page.name}`);
  assert.deepStrictEqual(duplicateFaqs, [], `Identical FAQs in ${page.name}`);
  uniqueContent.push({ page: page.name, identicalParagraphs: 0, identicalH2: 0, identicalFaqs: 0 });
}
console.log('PASS three exact reviews, no reused authors or texts');
console.log('PASS unique content', JSON.stringify(uniqueContent));

// Resolve local HTML links, fragments and assets without contacting production.
for (const page of pages) {
  const $ = load(await readFile(path.join(dist, page.output), 'utf8'));
  for (const el of $('a[href], img[src], link[href]').toArray()) {
    const raw = $(el).attr('href') ?? $(el).attr('src');
    if (!raw || /^(tel:|mailto:|data:)/.test(raw)) continue;
    const target = new URL(raw, page.url);
    if (target.origin !== domain) continue;
    const pathname = decodeURIComponent(target.pathname);
    const relative = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
    const file = path.resolve(dist, `.${relative}`);
    assert.ok(file.startsWith(`${dist}${path.sep}`), `Link escapes dist: ${raw}`);
    const contents = await readFile(file);
    if (target.hash && file.endsWith('.html')) {
      const $target = load(contents.toString());
      const id = decodeURIComponent(target.hash.slice(1));
      assert.ok($target('[id]').toArray().some((node) => $target(node).attr('id') === id), `Broken fragment ${raw} on ${page.name}`);
    }
  }
}
console.log('PASS all internal links, fragments and referenced assets resolve');
console.log(JSON.stringify({ pages: pageResults, htmlFiles: generatedHtmlFiles.sort(), sitemapUrls }, null, 2));
