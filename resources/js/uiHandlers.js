// resources/js/uiHandlers.js
// ... (imports and other functions)
// Ensure exportAllAssetsAsZip is imported from './zipExporter.js'
import { WorkspaceAssets, addEventToWorkspace, addStickerToWorkspace, addClipToWorkspace, loadInitialWorkspaceAssets, renderWorkspace, saveClipBlobToServer } from './workspace.js'; // Added saveClipBlobToServer
import { exportAllAssetsAsZip, cutClip } from './zipExporter.js'; // cutClip is now used
import { extractFrames } from './frameExtractor.js';
import { loadModel, detectObjectsInFrame } from './objectDetector.js';


console.log('uiHandlers.js loaded');

let appSettings = {
    extraction_interval: 1.0,
    confidence_threshold: 0.6,
    clip_padding_before: 2.0,
    clip_padding_after: 3.0,
    auto_create_clips: true, // New setting
    sticker_map: { // Example sticker map (classId: stickerImageUrl)
        1: '/stickers/creeper.png', // Replace with actual paths or make configurable
        2: '/stickers/diamond.png',
    }
};

async function fetchAppSettings() {
    try {
        const response = await fetch('/settings/get');
        if (!response.ok) throw new Error('Failed to fetch settings');
        const remoteSettings = await response.json();
        appSettings = { ...appSettings, ...remoteSettings }; // Merge, remote can override defaults
        console.log('App settings loaded:', appSettings);
        // Apply to form fields if on settings page
        if (document.getElementById('settings-form')) {
            document.getElementById('extraction-interval').value = appSettings.extraction_interval;
            document.getElementById('confidence-threshold').value = appSettings.confidence_threshold;
            document.getElementById('clip-padding-before').value = appSettings.clip_padding_before;
            document.getElementById('clip-padding-after').value = appSettings.clip_padding_after;
            // Add fields for auto_create_clips and sticker_map in settings.antlers.html later
        }
    } catch (error) {
        console.error('Error fetching app settings:', error);
    }
}

function updateProgressBar(percentage) {
    const bar = document.getElementById('progress-bar');
    const text = document.getElementById('progress-text');
    if (bar) bar.style.width = percentage + '%';
    if (text) text.textContent = percentage.toFixed(0) + '%';
    if (percentage === 100 && text) {
         setTimeout(() => text.textContent = "Complete!", 500);
    } else if (text) {
        text.textContent = percentage.toFixed(0) + '%';
    }
}

function addStatusMessage(message, isError = false) {
    const container = document.getElementById('status-messages');
    if (container) {
        const p = document.createElement('p');
        p.textContent = message;
        p.className = isError ? 'text-red-500 dark:text-red-400' : 'text-green-500 dark:text-green-400';
        //container.appendChild(p); // Append new messages
        container.innerHTML = ''; // Replace message
        container.appendChild(p);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    fetchAppSettings();

    const uploadForm = document.getElementById('upload-form');
    const startAnalysisBtn = document.getElementById('start-analysis-btn');
    const videoInput = document.getElementById('video-input');
    const intervalInput = document.getElementById('interval-input');
    const videoPreview = document.getElementById('video-preview');
    const videoPreviewContainer = document.getElementById('video-preview-container');

    if (startAnalysisBtn) {
        startAnalysisBtn.addEventListener('click', async () => {
            if (!videoInput.files || videoInput.files.length === 0) {
                addStatusMessage('Please select a video file.', true);
                return;
            }

            startAnalysisBtn.disabled = true;
            startAnalysisBtn.classList.add('opacity-50', 'cursor-not-allowed');
            document.getElementById('status-messages').innerHTML = ''; // Clear old messages
            addStatusMessage('Uploading video...');
            updateProgressBar(0);

            const formData = new FormData(uploadForm);

            try {
                const response = await fetch('/process-video', {
                    method: 'POST',
                    body: formData,
                    headers: { 'X-CSRF-Token': window.csrf_token, 'Accept': 'application/json' },
                });

                const result = await response.json();

                if (!result.success) {
                    throw new Error(result.message || 'Upload failed.');
                }

                addStatusMessage('Video uploaded: ' .concat(result.filename ? result.filename : '', ". Preparing for analysis."));
                updateProgressBar(10);

                if (videoPreview && videoPreviewContainer) {
                    videoPreview.src = result.videoUrl; // This is key for frame extraction
                    videoPreviewContainer.style.display = 'block';
                    videoPreview.load();

                    videoPreview.onloadedmetadata = async () => {
                        addStatusMessage('Video metadata loaded. Loading detection model...');
                        updateProgressBar(15);
                        const modelLoaded = await loadModel();
                        if (!modelLoaded) {
                            addStatusMessage('Failed to load detection model. Analysis cannot proceed.', true);
                            startAnalysisBtn.disabled = false;
                            startAnalysisBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                            return;
                        }
                        addStatusMessage('Model loaded. Starting frame extraction...');
                        updateProgressBar(20);

                        extractFrames(videoPreview, parseFloat(intervalInput.value), appSettings,
                            (progress) => { // onProgress for frame extraction
                                updateProgressBar(20 + (progress * 0.6)); // Scale progress from 20% to 80%
                            },
                            async (frames, videoSourceUrlForClips) => { // onComplete for frame extraction
                                addStatusMessage(`Frame extraction complete (${frames.length} frames). Detecting objects...`);
                                updateProgressBar(80);
                                let detectionCount = 0;
                                let significantDetections = 0;

                                for (let i = 0; i < frames.length; i++) {
                                    const frameCanvas = frames[i];
                                    // Timestamp needs to be relative to video start, not just interval index
                                    const timestamp = videoPreview.duration * (i / frames.length); // More accurate timestamp based on frame's position in total
                                    // Or, if interval is strict: const timestamp = i * parseFloat(intervalInput.value);

                                    const detections = await detectObjectsInFrame(frameCanvas, appSettings);
                                    detectionCount += detections.length;

                                    for (const det of detections) {
                                        if (det.score >= appSettings.confidence_threshold) {
                                            significantDetections++;
                                            const ideaName = `Object detected at ${timestamp.toFixed(2)}s`;
                                            const ideaText = `Detected class ${det.classId} (score: ${det.score.toFixed(2)}). Bbox: [${det.bbox.map(v => v.toFixed(0)).join(', ')}]`;
                                            addEventToWorkspace('idea', { name: ideaName, description: ideaText }, timestamp);

                                            // Check for sticker
                                            if (appSettings.sticker_map && appSettings.sticker_map[det.classId]) {
                                                const stickerName = `Sticker_Class${det.classId}_${timestamp.toFixed(0)}s`;
                                                addStickerToWorkspace(stickerName, appSettings.sticker_map[det.classId], timestamp);
                                            }

                                            // Check for clip creation
                                            if (appSettings.auto_create_clips) {
                                                const clipName = `Clip_Event_at_${timestamp.toFixed(2)}s`;
                                                const startTime = Math.max(0, timestamp - appSettings.clip_padding_before);
                                                const endTime = Math.min(videoPreview.duration, timestamp + appSettings.clip_padding_after);

                                                // cutClip is a placeholder. If it were real, it would return a blob or blobUrl.
                                                // For now, it's just a fake URL, so saveClipBlobToServer won't do much.
                                                // If ffmpeg.wasm is used, cutClip would be async and return a Blob.
                                                const clipDuration = endTime - startTime;
                                                if (clipDuration > 0) {
                                                    // The current `cutClip` is synchronous and returns a fake URL.
                                                    // If it were async and returned a Blob:
                                                    // const clipBlob = await cutClip(videoSourceUrlForClips, startTime, clipDuration);
                                                    // if (clipBlob) {
                                                    //    await saveClipBlobToServer(clipName, clipBlob, startTime, endTime, timestamp);
                                                    // }
                                                    // For now, with placeholder cutClip:
                                                    const fakeBlobUrl = cutClip(videoSourceUrlForClips, startTime, clipDuration); // videoSourceUrlForClips is result.videoUrl
                                                    addClipToWorkspace(clipName, fakeBlobUrl, startTime, endTime, timestamp);
                                                }
                                            }
                                        }
                                    }
                                    updateProgressBar(80 + ( ((i+1)/frames.length) * 20) ); // Progress from 80% to 100% for detection phase
                                    // Clean up canvas frame to free memory
                                    frameCanvas.width = 0;
                                    frameCanvas.height = 0;
                                }
                                frames.length = 0; // Clear array

                                addStatusMessage(`Analysis complete. ${significantDetections} significant objects found out of ${detectionCount} total detections. Check your Workspace.`);
                                updateProgressBar(100);
                                startAnalysisBtn.disabled = false;
                                startAnalysisBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                            },
                            (error) => { // onError for frame extraction
                                addStatusMessage(`Error during frame extraction: ${error}`, true);
                                startAnalysisBtn.disabled = false;
                                startAnalysisBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                            },
                            result.videoUrl // Pass video URL to frame extractor's onComplete for clip cutting
                        );
                    };
                    videoPreview.onerror = () => {
                        addStatusMessage('Error loading video preview. Ensure the video format is supported and the URL is correct. Cannot proceed with analysis.', true);
                        startAnalysisBtn.disabled = false;
                        startAnalysisBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                    };
                } else {
                     addStatusMessage('Video preview element not found. Analysis cannot proceed.', true);
                     startAnalysisBtn.disabled = false;
                     startAnalysisBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                }

            } catch (error) {
                addStatusMessage(`Error: ${error.message}`, true);
                updateProgressBar(0);
                startAnalysisBtn.disabled = false;
                startAnalysisBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        });
    }

    // (Keep existing exportZipBtn and settingsForm listeners)
    const exportZipBtn = document.getElementById('export-zip-btn');
    if (exportZipBtn) {
        exportZipBtn.addEventListener('click', async () => { // Make async if using await inside
            if (WorkspaceAssets.length === 0) {
                addStatusMessage("Workspace is empty. Nothing to export.", true);
                return;
            }

            // Option 1: Client-side zipping
            addStatusMessage("Preparing client-side ZIP export...", false);
            exportZipBtn.disabled = true;
            exportZipBtn.classList.add('opacity-50', 'cursor-not-allowed');
            updateProgressBar(0); // Reset progress bar for zip operation

            try {
                await exportAllAssetsAsZip(
                    WorkspaceAssets,
                    (progress) => { // onProgress callback
                        updateProgressBar(progress);
                    },
                    (message, isError) => { // onStatus callback
                        addStatusMessage(message, isError);
                    }
                );
                // Success message is handled by exportAllAssetsAsZip's onStatus or implied by download
            } catch (error) {
                // This catch might not be hit if exportAllAssetsAsZip handles its own errors internally
                addStatusMessage(`Client-side ZIP export failed: ${error.message}`, true);
                updateProgressBar(0);
            } finally {
                exportZipBtn.disabled = false;
                exportZipBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                // ProgressBar might show 100% or be reset by specific status messages
            }

            // Option 2: Server-side zipping (kept as a comment if preferred)
            // addStatusMessage("Requesting server-side ZIP download...", false);
            // window.location.href = '/download-zip';
        });
    }

    const settingsForm = document.getElementById('settings-form');
    if (settingsForm) {
        settingsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(settingsForm);
            const settingsData = {
                extraction_interval: parseFloat(formData.get('extraction_interval')),
                confidence_threshold: parseFloat(formData.get('confidence_threshold')),
                clip_padding_before: parseFloat(formData.get('clip_padding_before')),
                clip_padding_after: parseFloat(formData.get('clip_padding_after')),
                // auto_create_clips: formData.get('auto_create_clips') === 'on', // If using a checkbox
                // sticker_map: JSON.parse(formData.get('sticker_map_json')) // If using a textarea for JSON
            };
            const statusDiv = document.getElementById('settings-status');
            statusDiv.textContent = 'Saving...';
            statusDiv.className = 'mt-4 text-sm text-gray-600 dark:text-gray-400';


            try {
                const response = await fetch('/settings/save', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': window.csrf_token,
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify(settingsData),
                });
                const result = await response.json();
                if (result.success) {
                    statusDiv.textContent = 'Settings saved successfully!';
                    statusDiv.className = 'mt-4 text-sm text-green-500 dark:text-green-400';
                    appSettings = { ...appSettings, ...settingsData };
                } else {
                    statusDiv.textContent = `Error: ${result.message || 'Failed to save settings.'}`;
                    statusDiv.className = 'mt-4 text-sm text-red-500 dark:text-red-400';
                }
            } catch (error) {
                statusDiv.textContent = `Error: ${error.message}`;
                statusDiv.className = 'mt-4 text-sm text-red-500 dark:text-red-400';
            }
        });
    }

    if (document.getElementById('workspace-container')) {
        loadInitialWorkspaceAssets();
    }
    if (typeof WorkspaceAssets !== 'undefined' && WorkspaceAssets.length > 0 && document.getElementById('workspace-container')) {
        renderWorkspace();
    }
});
