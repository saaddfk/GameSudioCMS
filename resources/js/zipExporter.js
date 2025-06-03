// resources/js/zipExporter.js
console.log('zipExporter.js loaded');
import JSZip from 'jszip';

/**
 * Placeholder for client-side video clipping.
 * In a real implementation, this would use something like ffmpeg.wasm.
 * @param {string} videoUrl - The URL of the video to cut.
 * @param {number} startTime - Start time of the clip in seconds.
 * @param {number} duration - Duration of the clip in seconds.
 * @param {function} callback - Optional callback with the blob URL.
 * @returns {string} A fake blob URL (placeholder).
 */
export function cutClip(videoUrl, startTime, duration, callback) {
    console.log(`Placeholder: Would attempt to cut clip from ${videoUrl} starting at ${startTime}s for ${duration}s.`);
    const fakeBlobUrl = "blob:http://localhost:3000/" + crypto.randomUUID(); // Fake Blob URL
    if (callback) {
        // Simulate async operation for realism if needed
        // setTimeout(() => callback(fakeBlobUrl), 100);
        callback(fakeBlobUrl);
    }
    return fakeBlobUrl;
}

/**
 * Gathers all assets from the workspace, fetches them, and packages them into a ZIP file for download.
 * @param {Array} workspaceAssets - Array of asset objects from the workspace.
 * @param {function} onProgress - Optional callback for progress updates (0-100).
 * @param {function} onStatus - Optional callback for status messages.
 */
export async function exportAllAssetsAsZip(workspaceAssets, onProgress, onStatus) {
    if (!workspaceAssets || workspaceAssets.length === 0) {
        if (onStatus) onStatus("No assets in workspace to export.", true);
        console.warn("No assets to export.");
        return;
    }

    if (onStatus) onStatus("Starting ZIP export...", false);
    if (onProgress) onProgress(0);

    const zip = new JSZip();
    const totalAssetsToFetch = workspaceAssets.filter(asset => (asset.type === 'sticker' && asset.image_path) || (asset.type === 'clip' && asset.video_path && !asset.video_path.startsWith('blob:'))).length;
    let fetchedCount = 0;

    // Create folders
    const stickersFolder = zip.folder("stickers");
    const clipsFolder = zip.folder("clips");
    let ideasContent = "Minecraft Montage Ideas:\n\n";

    for (const asset of workspaceAssets) {
        try {
            if (asset.type === 'idea') {
                ideasContent += `Idea: ${asset.name}\n`;
                ideasContent += `Timestamp: ${asset.timestamp.toFixed(2)}s\n`;
                if(asset.description) ideasContent += `Description: ${asset.description}\n`;
                ideasContent += `------------------------------------\n`;
            } else if (asset.type === 'sticker' && asset.image_path) {
                if (asset.image_path.startsWith('blob:')) {
                    console.warn(`Skipping sticker ${asset.name} as its path is a blob URL.`);
                    if (onStatus) onStatus(`Skipping sticker ${asset.name} (local blob not exportable this way).`, true);
                    // totalAssetsToFetch might be off if we have many blob urls, but progress will still complete.
                    continue;
                }
                if (onStatus) onStatus(`Fetching sticker: ${asset.name}...`, false);
                const response = await fetch(asset.image_path);
                if (!response.ok) throw new Error(`Failed to fetch sticker ${asset.name}: ${response.statusText}`);
                const blob = await response.blob();
                const fileName = asset.name.replace(/[^a-z0-9_.-]/gi, '_') + (asset.image_path.includes('.png') ? '.png' : asset.image_path.includes('.jpg') ? '.jpg' : '.png');
                stickersFolder.file(fileName, blob);
                fetchedCount++;
                if (onProgress) onProgress(Math.round((fetchedCount / totalAssetsToFetch) * 80)); // Fetching up to 80%
            } else if (asset.type === 'clip' && asset.video_path) {
                 if (asset.video_path.startsWith('blob:')) {
                    console.warn(`Skipping clip ${asset.name} as its path is a blob URL and likely not yet saved to server or expired.`);
                    if (onStatus) onStatus(`Skipping clip ${asset.name} (local blob not exportable this way). Save it first.`, true);
                    continue;
                }
                if (onStatus) onStatus(`Fetching clip: ${asset.name}...`, false);
                const response = await fetch(asset.video_path);
                if (!response.ok) throw new Error(`Failed to fetch clip ${asset.name}: ${response.statusText}`);
                const blob = await response.blob();
                const fileName = asset.name.replace(/[^a-z0-9_.-]/gi, '_') + (asset.video_path.includes('.mp4') ? '.mp4' : asset.video_path.includes('.webm') ? '.webm' : '.mp4');
                clipsFolder.file(fileName, blob);
                fetchedCount++;
                if (onProgress) onProgress(Math.round((fetchedCount / totalAssetsToFetch) * 80)); // Fetching up to 80%
            }
        } catch (error) {
            console.error("Error fetching asset for ZIP:", error);
            if (onStatus) onStatus(`Error fetching ${asset.name}: ${error.message}. Skipping.`, true);
        }
    }

    if (ideasContent.length > "Minecraft Montage Ideas:\n\n".length) {
        zip.file("ideas_manifest.txt", ideasContent);
    }


    if (onStatus) onStatus("Compressing assets...", false);
    if (onProgress) onProgress(90); // At 90% before generating blob

    zip.generateAsync({ type: "blob" })
        .then(function(content) {
            if (onStatus) onStatus("ZIP file generated. Starting download...", false);
            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            link.download = `Minecraft_Montage_Assets_${Date.now()}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href); // Clean up blob URL
            if (onProgress) onProgress(100);
            if (onStatus) onStatus("Download started!", false);
        })
        .catch(function(err) {
            console.error("Error generating ZIP:", err);
            if (onStatus) onStatus(`Error generating ZIP: ${err.message}`, true);
            if (onProgress) onProgress(0); // Reset progress on error
        });
}
