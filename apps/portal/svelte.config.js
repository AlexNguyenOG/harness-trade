import adapter from "@sveltejs/adapter-vercel";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({
      runtime: "nodejs24.x",
    }),
    alias: {
      $agent: "agent",
    },
  },
};

export default config;
