import { API_URL, API_TIMEOUT_MS } from "astro:env/server";
import { createContentClient } from "../server/api";

const client = createContentClient(API_URL, API_TIMEOUT_MS);
export const getSettings = client.content;
export const getSeo = client.seo;
