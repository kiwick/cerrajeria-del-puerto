import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://www.cerrajeriadelpuertogandia.com',
  output: 'static',
  trailingSlash: 'always',
  compressHTML: false,
});
