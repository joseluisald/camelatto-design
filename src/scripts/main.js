import app from "./components/app.js";
import projectPreview from './components/project-preview.js';
import cursor from './components/cursor.js';

export default function setupApp(Alpine) {
    Alpine.data('app', app);
    Alpine.data('projectPreview', projectPreview);
    Alpine.data('cursor', cursor);
}
