// resources/js/site.js
import './frameExtractor.js';
import './objectDetector.js';
import './workspace.js';
import './zipExporter.js';
import './uiHandlers.js'; // This will orchestrate the others

console.log('site.js loaded and all modules initialized.');

// Basic error handling for Vite HMR
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    console.log('HMR update applied');
  });
}
