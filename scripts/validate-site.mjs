import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { load } from 'cheerio';
import { createHash } from 'node:crypto';

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
  { name: 'Bellreguard', fixture: 'bellreguard.html', output: 'bellreguard/index.html', url: 'https://www.cerrajeriadelpuertogandia.com/bellreguard/', validateFaq: true },
  { name: 'Piles', fixture: 'piles.html', output: 'piles/index.html', url: 'https://www.cerrajeriadelpuertogandia.com/piles/', validateFaq: true },
  { name: 'Actualizar cerradura', fixture: 'actualizar-cerradura-puerta.html', output: 'actualizar-cerradura-puerta/index.html', url: 'https://www.cerrajeriadelpuertogandia.com/actualizar-cerradura-puerta/', validateFaq: true },
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
console.log('PASS exactly twelve expected HTML pages');
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
console.log('PASS sitemap contains exactly twelve HTTPS www URLs with trailing slashes');
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
assert.equal(new Set(sitemapUrls).size, 12);
assert.ok(![sitemap, llms, robots].join('\n').includes('github.io'));
console.log('PASS Daimús SEO, coverage, contact, breadcrumb, home, sitemap, llms and robots');

const expectedReviews = JSON.parse(await readFile(path.join(root, 'tests/fixtures/daimus-reviews.json'), 'utf8'));
const actualReviews = $daimus('#opiniones .review').map((_, el) => ({ author: $daimus(el).find('footer strong').text(), text: $daimus(el).find('blockquote').text() })).get();
assert.deepStrictEqual(actualReviews, expectedReviews, 'Review authors and texts must match supplied screenshots exactly');
const contentNormalize = (text) => normalize(text.replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'"));
const texts = ($, selector) => $(selector).map((_, el) => contentNormalize($(el).text())).get();
// The user requires this exact shared wording on these landing pages.
// Only this paragraph is exempt, and only inside the arrival card.
const arrivalDisclaimer = 'El tráfico, el punto exacto y la disponibilidad en el momento de la llamada pueden hacer variar este tiempo.';
const localParagraphs = ($) => $('main p').toArray().filter((el) => !($(el).closest('.gandia-arrival').length && contentNormalize($(el).text()) === arrivalDisclaimer)).map((el) => contentNormalize($(el).text()));
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
  const duplicateParagraphs = localParagraphs($daimus).filter((text) => localParagraphs($other).includes(text));
  const duplicateHeadings = texts($daimus, 'main h2').filter((text) => texts($other, 'main h2').includes(text));
  const duplicateFaqs = texts($daimus, '#faq summary, #faq details p').filter((text) => texts($other, '#faq summary, #faq details p').includes(text));
  assert.deepStrictEqual(duplicateParagraphs, [], `Identical paragraphs in ${page.name}`);
  assert.deepStrictEqual(duplicateHeadings, [], `Identical H2 in ${page.name}`);
  assert.deepStrictEqual(duplicateFaqs, [], `Identical FAQs in ${page.name}`);
  uniqueContent.push({ page: page.name, identicalParagraphs: 0, identicalH2: 0, identicalFaqs: 0 });
}
console.log('PASS three exact reviews, no reused authors or texts');
console.log('PASS unique content', JSON.stringify(uniqueContent));

const bellreguardHtml = await readFile(path.join(dist, 'bellreguard/index.html'), 'utf8');
const bellreguard = extract(bellreguardHtml);
const $bellreguard = load(bellreguardHtml);
assert.equal(bellreguard.title, 'Cerrajero 24h en Bellreguard | Cerrajería del Puerto');
assert.deepStrictEqual(bellreguard.description, ['Cerrajero 24h en Bellreguard. Apertura de puertas, cambio de cerraduras y bombines. Llegada habitual de 5 minutos.']);
assert.deepStrictEqual(bellreguard.h1, ['Cerrajero 24h en Bellreguard']);
assert.deepStrictEqual(bellreguard.areaServed, [{ '@type': 'City', name: 'Bellreguard' }]);
assert.deepStrictEqual(bellreguard.breadcrumb[0]?.itemListElement, [
  { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${domain}/` },
  { '@type': 'ListItem', position: 2, name: 'Cerrajero en Bellreguard', item: `${domain}/bellreguard/` },
]);
for (const [property, content] of Object.entries({ 'og:title': bellreguard.title, 'og:description': bellreguard.description[0], 'og:url': `${domain}/bellreguard/` })) {
  assert.equal($bellreguard(`meta[property="${property}"]`).attr('content'), content);
}
assert.ok(bellreguard.phones.length && bellreguard.phones.every(({ attributes }) => attributes.href === 'tel:+34687929669'));
assert.ok(bellreguard.whatsapp.length && bellreguard.whatsapp.every(({ attributes }) => new URL(attributes.href).pathname === '/34687929669'));
assert.equal(bellreguard.faqs.length, 7);
assert.deepStrictEqual(texts($bellreguard, '#zona .areas span'), ['Bellreguard', 'Playa de Bellreguard']);
assert.ok(bellreguard.visibleText.includes('Llegada habitual: 5 minutos'));
assert.equal($bellreguard('#zona .gandia-arrival p').text(), arrivalDisclaimer);
assert.ok(!/menos de 5 minutos|5 minutos garantizados/i.test(bellreguard.visibleText));
assert.ok(!/"(?:Product|Offer|Review|AggregateRating|aggregateRating)"/.test(JSON.stringify(bellreguard.jsonLd)));
assert.equal($home('.areas a[href="/bellreguard/"]').length, 1);
assert.ok(llms.includes(`${domain}/bellreguard/`) && llms.includes('Bellreguard'));
const approvedBellreguardReviews = JSON.parse(await readFile(path.join(root, 'tests/fixtures/bellreguard-reviews.json'), 'utf8'));
const bellreguardReviews = $bellreguard('#opiniones .review').map((_, el) => ({ author: $bellreguard(el).find('footer strong').text(), text: $bellreguard(el).find('blockquote').text() })).get();
assert.equal(bellreguardReviews.length, 3);
assert.deepStrictEqual(bellreguardReviews, approvedBellreguardReviews, 'Bellreguard reviews must match the approved transcription exactly');
assert.deepStrictEqual(texts($bellreguard, '#opiniones .review-stars'), ['★★★★★', '★★★★★', '★★★★★']);

const bellreguardUniqueness = [];
const allReviews = [];
for (const page of pages) {
  const $other = load(await readFile(path.join(dist, page.output), 'utf8'));
  $other('#opiniones .review').each((_, el) => allReviews.push({ page: page.name, author: contentNormalize($other(el).find('footer strong').text()), text: contentNormalize($other(el).find('blockquote').text()).replace(/^"|"$/g, '') }));
  if (['Home', 'Bellreguard', 'Seguridad en puertas y cerraduras'].includes(page.name)) continue;
  const identicalParagraphs = localParagraphs($bellreguard).filter((text) => localParagraphs($other).includes(text));
  const identicalH2 = texts($bellreguard, 'main h2').filter((text) => texts($other, 'main h2').includes(text));
  const identicalFaqs = texts($bellreguard, '#faq summary, #faq details p').filter((text) => texts($other, '#faq summary, #faq details p').includes(text));
  assert.deepStrictEqual(identicalParagraphs, [], `Bellreguard: identical paragraphs with ${page.name}`);
  assert.deepStrictEqual(identicalH2, [], `Bellreguard: identical H2 with ${page.name}`);
  assert.deepStrictEqual(identicalFaqs, [], `Bellreguard: identical FAQs with ${page.name}`);
  const requiredSharedParagraphs = texts($other, '#zona .gandia-arrival p').filter((text) => text === arrivalDisclaimer).length;
  bellreguardUniqueness.push({ page: page.name, identicalParagraphs: 0, identicalH2: 0, identicalFaqs: 0, requiredSharedParagraphs });
}
assert.equal(allReviews.length, 31, 'Expected 31 visible reviews across the site');
assert.equal(new Set(allReviews.map(({ text }) => text)).size, allReviews.length, 'Repeated review text anywhere in the site');
assert.equal(new Set(allReviews.map(({ author }) => author)).size, allReviews.length, 'Repeated review author or label anywhere in the site');
console.log('PASS Bellreguard SEO, contact, breadcrumb, areaServed, home, sitemap, llms and robots');
console.log('PASS exactly 31 visible reviews = 31 unique texts and authors/labels; 3 approved Bellreguard reviews');
console.log('PASS Bellreguard unique content; only required arrival wording exempt', JSON.stringify(bellreguardUniqueness));

const pilesHtml = await readFile(path.join(dist, 'piles/index.html'), 'utf8');
const piles = extract(pilesHtml);
const $piles = load(pilesHtml);
assert.equal(piles.title, 'Cerrajero 24h en Piles | Cerrajería del Puerto');
assert.deepStrictEqual(piles.description, ['Cerrajero 24h en Piles. Apertura de puertas, cambio de cerraduras y bombines. Llegada habitual de 7 minutos.']);
assert.deepStrictEqual(piles.h1, ['Cerrajero 24h en Piles']);
assert.deepStrictEqual(piles.areaServed, [{ '@type': 'City', name: 'Piles' }, { '@type': 'Place', name: 'Playa de Piles' }]);
assert.deepStrictEqual(piles.breadcrumb[0]?.itemListElement, [
  { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${domain}/` },
  { '@type': 'ListItem', position: 2, name: 'Cerrajero en Piles', item: `${domain}/piles/` },
]);
for (const [property, content] of Object.entries({ 'og:title': piles.title, 'og:description': piles.description[0], 'og:url': `${domain}/piles/` })) {
  assert.equal($piles(`meta[property="${property}"]`).attr('content'), content);
}
assert.ok(piles.phones.length && piles.phones.every(({ attributes }) => attributes.href === 'tel:+34687929669'));
assert.ok(piles.whatsapp.length && piles.whatsapp.every(({ attributes }) => new URL(attributes.href).pathname === '/34687929669'));
assert.equal(piles.faqs.length, 7);
assert.deepStrictEqual(texts($piles, '#zona .areas span'), ['Piles', 'Playa de Piles']);
assert.ok(piles.visibleText.includes('Llegada habitual: 7 minutos'));
assert.equal($piles('#zona .gandia-arrival p').text(), arrivalDisclaimer);
assert.ok(!/menos de 7 minutos|7 minutos garantizados/i.test(piles.visibleText));
assert.ok(!/"(?:Product|Offer|Review|AggregateRating|aggregateRating)"/.test(JSON.stringify(piles.jsonLd)));
assert.equal($home('.areas a[href="/piles/"]').length, 1);
assert.ok(llms.includes(`${domain}/piles/`) && llms.includes('Piles'));
const approvedPilesReviews = JSON.parse(await readFile(path.join(root, 'tests/fixtures/piles-reviews.json'), 'utf8'));
const pilesReviews = $piles('#opiniones .review').map((_, el) => ({ author: $piles(el).find('footer strong').text(), text: $piles(el).find('blockquote').text() })).get();
assert.equal(pilesReviews.length, 3);
assert.deepStrictEqual(pilesReviews, approvedPilesReviews, 'Piles reviews must match the approved transcription exactly');
assert.deepStrictEqual(texts($piles, '#opiniones .review-stars'), ['★★★★★', '★★★★★', '★★★★★']);

const pilesUniqueness = [];
for (const page of pages.filter(({ name }) => !['Home', 'Piles', 'Seguridad en puertas y cerraduras'].includes(name))) {
  const $other = load(await readFile(path.join(dist, page.output), 'utf8'));
  const identicalParagraphs = localParagraphs($piles).filter((text) => localParagraphs($other).includes(text));
  const identicalH2 = texts($piles, 'main h2').filter((text) => texts($other, 'main h2').includes(text));
  const identicalFaqs = texts($piles, '#faq summary, #faq details p').filter((text) => texts($other, '#faq summary, #faq details p').includes(text));
  assert.deepStrictEqual(identicalParagraphs, [], 'Piles: identical paragraphs with ' + page.name);
  assert.deepStrictEqual(identicalH2, [], 'Piles: identical H2 with ' + page.name);
  assert.deepStrictEqual(identicalFaqs, [], 'Piles: identical FAQs with ' + page.name);
  const requiredSharedParagraphs = texts($other, '#zona .gandia-arrival p').filter((text) => text === arrivalDisclaimer).length;
  pilesUniqueness.push({ page: page.name, identicalParagraphs: 0, identicalH2: 0, identicalFaqs: 0, requiredSharedParagraphs });
}
console.log('PASS Piles SEO, FAQ, schema, contact, integration and three exact approved reviews');
console.log('PASS Piles unique content; only required arrival wording exempt', JSON.stringify(pilesUniqueness));

// Strategic upgrade page: explicit acceptance criteria independent of its baseline.
const upgradeHtml = await readFile(path.join(dist, 'actualizar-cerradura-puerta/index.html'), 'utf8');
const upgrade = extract(upgradeHtml);
const $upgrade = load(upgradeHtml);
assert.equal(upgrade.title, 'Actualizar cerradura antigua sin cambiar la puerta | Cerrajería del Puerto');
assert.deepStrictEqual(upgrade.description, ['¿Tienes una buena puerta pero una cerradura antigua? Descubre qué puedes actualizar sin cambiarla y pide presupuesto a Cerrajería del Puerto.']);
assert.deepStrictEqual(upgrade.h1, ['¿Tienes una buena puerta pero una cerradura antigua?']);
assert.equal(upgrade.faqs.length, 8);
const upgradeNodes = upgrade.jsonLd.flatMap(schema => schema['@graph'] ?? [schema]);
assert.deepStrictEqual(upgradeNodes.map(node => node['@type']).sort(), ['BreadcrumbList', 'FAQPage', 'WebPage']);
assert.ok(!/"(?:Product|Offer|Review|AggregateRating|aggregateRating|price|availability)"/.test(JSON.stringify(upgrade.jsonLd)));
assert.deepStrictEqual(upgrade.breadcrumb[0].itemListElement, [
  { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${domain}/` },
  { '@type': 'ListItem', position: 2, name: 'Actualizar cerradura sin cambiar la puerta', item: `${domain}/actualizar-cerradura-puerta/` },
]);
for (const [property, content] of Object.entries({ 'og:title': upgrade.title, 'og:description': upgrade.description[0], 'og:url': `${domain}/actualizar-cerradura-puerta/` })) {
  assert.equal($upgrade(`meta[property="${property}"]`).attr('content'), content);
}
for (const word of ['Bombín', 'Escudo de seguridad', 'Cerradura', 'Puntos de cierre', 'Conservar la puerta', 'Pide presupuesto', 'Actualizar la seguridad paso a paso', 'Más de 20 años', 'Gandía', 'La Safor']) assert.ok(upgrade.visibleText.includes(word), `Missing static content: ${word}`);
assert.ok(upgrade.phones.length && upgrade.phones.every(({ attributes }) => attributes.href === 'tel:+34687929669'));
assert.ok(upgrade.whatsapp.length >= 4);
for (const { attributes } of upgrade.whatsapp) {
  const url = new URL(attributes.href);
  assert.equal(url.pathname, '/34687929669');
  assert.equal(url.searchParams.get('text'), 'Hola, quiero pedir presupuesto para actualizar la cerradura de mi puerta. Os envío unas fotos para que podáis ver lo que tengo instalado.');
}
const $guide = load(await readFile(path.join(dist, 'seguridad-puertas-cerraduras/index.html'), 'utf8'));
for (const [$page, target] of [[$guide, '/actualizar-cerradura-puerta/'], [$upgrade, '/seguridad-puertas-cerraduras/']]) {
  const contextual = $page(`main a[href="${target}"]`);
  assert.ok(contextual.length && contextual.toArray().every(el => !$page(el).attr('rel')?.includes('nofollow')));
}
const guideContent = extract(await readFile(path.join(dist, 'seguridad-puertas-cerraduras/index.html'), 'utf8'));
assert.ok(upgrade.faqs.every(faq => !guideContent.faqs.some(other => faq.question === other.question || faq.answer === other.answer)), 'Guide FAQ must not be copied');
for (const page of pages.filter(page => page.name !== 'Actualizar cerradura')) {
  const $other = load(await readFile(path.join(dist, page.output), 'utf8'));
  const otherParagraphs = texts($other, 'main p');
  assert.ok(texts($upgrade, 'main p').every(text => !otherParagraphs.includes(text)), `Upgrade paragraph copied from ${page.name}`);
}
assert.ok(llms.includes(`${domain}/actualizar-cerradura-puerta/`));
assert.equal($home('main a[href="/actualizar-cerradura-puerta/"]').length, 0, 'Do not add a locality chip for the strategic page');
const expectedAlts = [
  'Esquema técnico de una puerta con bombín, escudo, cerradura y puntos de cierre',
  'Puerta de madera conservada con bombín y herrajes de cerradura actualizados',
  'Puerta de madera con cerradura multipunto y elementos de seguridad actualizados',
  'Ejemplo de fotos del exterior y del canto de una puerta para revisar su cerradura',
];
assert.deepStrictEqual(upgrade.images.map(image => image.alt), expectedAlts);
for (const [index, el] of $upgrade('img').toArray().entries()) {
  const img = $upgrade(el);
  assert.equal(img.attr('width'), '768');
  assert.equal(img.attr('height'), '512');
  assert.equal(img.attr('decoding'), 'async');
  assert.equal(img.attr('title'), undefined);
  if (index > 0) assert.equal(img.attr('loading'), 'lazy');
  assert.deepStrictEqual(img.attr('srcset').split(',').map(candidate => Number(candidate.trim().split(/\s+/)[1].slice(0, -1))), [320, 480, 768, 1024]);
  assert.ok(img.attr('sizes')?.includes('552px'));
  assert.ok(!img.attr('src').endsWith(`${img.attr('src').split('/').at(-2)}.webp`), 'Do not load the master');
}
const mobileSource = $upgrade('picture source[media="(max-width: 520px)"]');
assert.equal(mobileSource.length, 1);
assert.equal(mobileSource.attr('width'), '768');
assert.equal(mobileSource.attr('height'), '960');
assert.deepStrictEqual(mobileSource.attr('srcset').split(',').map(candidate => candidate.trim().split('/').at(-1)), ['plano-tecnico-puerta-cerradura-mobile-320.webp 320w', 'plano-tecnico-puerta-cerradura-mobile-480.webp 480w', 'plano-tecnico-puerta-cerradura-mobile-768.webp 768w']);
for (const el of $upgrade('[srcset]').toArray()) {
  for (const candidate of $upgrade(el).attr('srcset').split(',')) {
    const url = candidate.trim().split(/\s+/)[0];
    assert.ok(url.startsWith('/images/actualizar-cerradura/'));
    await readFile(path.join(dist, url));
  }
}
const approvedAssets = JSON.parse(await readFile(path.join(root, 'tests/fixtures/actualizar-cerradura-assets.json'), 'utf8'));
assert.equal(approvedAssets.length, 23);
for (const asset of approvedAssets) {
  const bytes = await readFile(path.join(dist, 'images/actualizar-cerradura', asset.file));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, `Approved asset modified: ${asset.file}`);
}
for (const page of pages) {
  const $ = load(await readFile(path.join(dist, page.output), 'utf8'));
  for (const target of ['/seguridad-puertas-cerraduras/', '/actualizar-cerradura-puerta/']) {
    const links = $(`body > footer a[href="${target}"]`);
    assert.equal(links.length, 1, `${page.name}: missing useful footer link`);
    assert.ok(!links.attr('rel')?.includes('nofollow'));
  }
  assert.equal($('body > footer a[href*="facebook.com"]').length, 1);
  assert.equal($('body > footer a[href*="instagram.com"]').length, 1);
}
console.log('PASS upgrade SEO, static content, FAQ, justified schema, distinct content, contact, contextual links, footer, responsive images and 23 original asset hashes');

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
