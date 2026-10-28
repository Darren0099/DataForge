import adapterVercel from '@sveltejs/adapter-vercel';
import adapterCloudflare from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
const adapter = process.env.DEPLOY_TARGET === 'cloudflare' ? adapterCloudflare() : adapterVercel();
export default { preprocess: vitePreprocess(), kit: { adapter, alias: { $components: 'src/lib/components' } } };
