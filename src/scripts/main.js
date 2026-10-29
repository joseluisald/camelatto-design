import app from "./components/app.js";
import featuredProjects from './components/featured-projects.js';
import cursor from './components/cursor.js';

export default function setupApp(Alpine) {
    Alpine.data('app', app);
    Alpine.data('featuredProjects', featuredProjects);
    Alpine.data('cursor', cursor);
}
