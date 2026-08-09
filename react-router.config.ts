import type { Config } from "@react-router/dev/config";

export default {
  // SSR is NON-NEGOTIABLE for public pages — SEO is the primary demand channel.
  ssr: true,
} satisfies Config;
