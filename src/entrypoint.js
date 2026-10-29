import collapse from '@alpinejs/collapse';
import mask from '@alpinejs/mask';
import setupApp from "./scripts/main.js";

export default (Alpine) => {
    Alpine.plugin(collapse);
    Alpine.plugin(mask);
    setupApp(Alpine);
};