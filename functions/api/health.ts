import { jsonResponse } from "../lib/helpers";

export const onRequestGet = async () => {
  return jsonResponse({
    status: "ok",
    environment: "Cloudflare Pages Functions",
    time: new Date().toISOString()
  });
};
