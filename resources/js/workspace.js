// resources/js/workspace.js
// (Keep existing top-level code and other functions: WorkspaceAssets, addEventToWorkspace, addStickerToWorkspace, saveAssetToServer, renderWorkspace, loadInitialWorkspaceAssets)
console.log('workspace.js loaded');

export let WorkspaceAssets = [];

export function addEventToWorkspace(type, data, timestamp) {
    console.log('Adding event to workspace:', type, data, 'at', timestamp);
    const asset = {
        id: 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        type,
        timestamp,
        name: data.name,
        ...data
    };
    WorkspaceAssets.push(asset);
    renderWorkspace();
    saveAssetToServer(asset); // For ideas, description is part of data
}

export function addStickerToWorkspace(name, imageUrl, originalTimestamp) {
    console.log('Adding sticker to workspace:', name, imageUrl);
    const asset = {
        id: 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        type: 'sticker',
        name,
        image_path: imageUrl,
        timestamp: originalTimestamp
    };
    WorkspaceAssets.push(asset);
    renderWorkspace();
    saveAssetToServer(asset); // Saves type, name, image_path
}

// This function now primarily adds to local workspace. Blob upload is separate.
export function addClipToWorkspace(name, videoPathOrBlobUrl, startTime, endTime, originalTimestamp) {
    console.log('Adding clip to workspace:', name, videoPathOrBlobUrl);
    const asset = {
        id: 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        type: 'clip',
        name,
        video_path: videoPathOrBlobUrl, // Could be a blob URL initially
        start_time: startTime,
        end_time: endTime,
        timestamp: originalTimestamp,
        is_blob_url: typeof videoPathOrBlobUrl === 'string' && videoPathOrBlobUrl.startsWith('blob:')
    };
    WorkspaceAssets.push(asset);
    renderWorkspace();
    // If it's not a blob URL, or if we decide to save metadata immediately for placeholders:
    if (!asset.is_blob_url) {
        saveAssetToServer(asset);
    }
    // The actual blob upload will be handled by saveClipBlobToServer if needed
}

// Generic asset saver (metadata)
async function saveAssetToServer(asset) {
    console.log('Saving asset metadata to server:', asset);
    // Remove local-only properties or prepare payload
    const payload = { ...asset };
    delete payload.id; // Server will generate its own ID
    delete payload.is_blob_url;

    try {
        const response = await fetch('/save-asset', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': window.csrf_token,
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload),
        });
        const result = await response.json();
        if (result.success && result.entry) {
            console.log('Asset metadata saved successfully:', result.entry);
            const localAsset = WorkspaceAssets.find(a => a.id === asset.id);
            if (localAsset) {
                localAsset.server_id = result.entry.id; // Statamic entry ID
                localAsset.video_path = result.entry.data?.video_path || localAsset.video_path; // Update path if server returns a new one (e.g., after storing blob)
                localAsset.image_path = result.entry.data?.image_path || localAsset.image_path;
                renderWorkspace(); // Re-render to reflect any changes like download links
            }
        } else {
            console.error('Failed to save asset metadata:', result.message);
        }
    } catch (error) {
        console.error('Error saving asset metadata:', error);
    }
}

// Specific function to upload a clip Blob
export async function saveClipBlobToServer(name, clipBlob, startTime, endTime, originalTimestamp) {
    console.log('Uploading clip blob to server:', name);
    const formData = new FormData();
    formData.append('type', 'clip');
    formData.append('name', name);
    formData.append('video_file', clipBlob, `${name.replace(/[^a-z0-9]/gi, '_')}.mp4`); // Sanitize name for filename
    formData.append('start_time', startTime);
    formData.append('end_time', endTime);
    formData.append('timestamp', originalTimestamp); // Original event timestamp

    try {
        const response = await fetch('/save-asset', {
            method: 'POST',
            body: formData, // FormData sets Content-Type to multipart/form-data automatically
            headers: {
                'X-CSRF-Token': window.csrf_token,
                'Accept': 'application/json'
            },
        });
        const result = await response.json();
        if (result.success && result.entry) {
            console.log('Clip blob saved successfully:', result.entry);
            // Update the corresponding local asset if it was already added with a blob URL
            const localAsset = WorkspaceAssets.find(a => a.name === name && a.type === 'clip' && a.is_blob_url);
            if (localAsset) {
                localAsset.server_id = result.entry.id;
                localAsset.video_path = result.entry.data.video_path; // Server returns the actual stored path
                localAsset.is_blob_url = false;
                renderWorkspace();
            } else {
                // If it wasn't added locally first (e.g. direct upload), add it now
                const newAsset = {
                     id: 'local_' + Date.now(), // Or use result.entry.id if preferred
                     server_id: result.entry.id,
                     type: 'clip',
                     name: result.entry.data.name,
                     video_path: result.entry.data.video_path,
                     start_time: result.entry.data.start_time,
                     end_time: result.entry.data.end_time,
                     timestamp: result.entry.data.timestamp || originalTimestamp,
                     is_blob_url: false
                };
                WorkspaceAssets.push(newAsset);
                renderWorkspace();
            }
        } else {
            console.error('Failed to save clip blob:', result.message);
            // Optionally, remove local asset if save failed or mark as error
        }
    } catch (error) {
        console.error('Error saving clip blob:', error);
    }
}

export function renderWorkspace() {
    const container = document.getElementById('workspace-container');
    const emptyMessage = document.getElementById('workspace-empty-message');
    if (!container) return;

    if (WorkspaceAssets.length === 0) {
        if(emptyMessage) emptyMessage.style.display = 'block';
        container.innerHTML = '<p class="text-gray-500 dark:text-gray-400 col-span-full text-center">Workspace is empty. Upload and analyze a video!</p>';
    } else {
        if(emptyMessage) emptyMessage.style.display = 'none';
        container.innerHTML = WorkspaceAssets.map(asset => {
            let downloadLink = asset.video_path || asset.image_path;
            // If it's a blob URL and not yet saved to server, download might not work as expected long-term
            // but for immediate preview it's fine. Once saved, server_id will be set and video_path updated.
            const isSticker = asset.type === 'sticker';
            const isClip = asset.type === 'clip';
            const assetNameForDownload = `${asset.name}.${isSticker ? (asset.image_path?.split('.').pop() || 'png') : (asset.video_path?.split('.').pop() || 'mp4')}`;

            return `
                <div class="bg-white dark:bg-gray-800 shadow-lg rounded-lg p-4 flex flex-col justify-between">
                    <div>
                        <h2 class="text-xl font-semibold mb-2 text-gray-900 dark:text-white">${asset.type.charAt(0).toUpperCase() + asset.type.slice(1)}: ${asset.name}</h2>
                        ${asset.type === 'idea' ? `<p class="text-gray-700 dark:text-gray-300 text-sm">Time: ${asset.timestamp.toFixed(2)}s</p><p class="text-gray-600 dark:text-gray-400 text-sm mt-1">${asset.description || ''}</p>` : ''}
                        ${isSticker && asset.image_path ? `<img src="${asset.image_path}" alt="${asset.name}" class="max-w-full h-auto max-h-40 rounded mb-2 mx-auto object-contain">` : ''}
                        ${isClip && asset.video_path ? `
                            <video controls preload="metadata" class="w-full rounded mb-2 max-h-48 bg-black">
                                <source src="${asset.video_path}" type="video/mp4">
                                Your browser does not support the video tag.
                            </video>
                            <p class="text-xs text-gray-500 dark:text-gray-400">Event: ${asset.timestamp.toFixed(2)}s | Clip: ${asset.start_time.toFixed(2)}s - ${asset.end_time.toFixed(2)}s</p>
                        ` : ''}
                    </div>
                    ${(isSticker || isClip) && downloadLink && !asset.is_blob_url ? `
                    <a href="${downloadLink}" download="${assetNameForDownload}"
                       class="mt-3 text-center w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded text-sm transition duration-150 ease-in-out">
                       Download ${asset.type.charAt(0).toUpperCase() + asset.type.slice(1)}
                    </a>` :
                    (asset.is_blob_url ? '<p class="mt-3 text-xs text-center text-gray-400 dark:text-gray-500">Clip processing/saving...</p>' : '<div class="mt-3 h-9"></div>') /* Keep height consistent */
                    }
                </div>`;
        }).join('');
    }
}

export async function loadInitialWorkspaceAssets() {
    console.log('Loading initial workspace assets from server...');
    const container = document.getElementById('workspace-container');
    const emptyMessage = document.getElementById('workspace-empty-message');

    try {
        const response = await fetch('/list-assets', {
            headers: { 'Accept': 'application/json', 'X-CSRF-Token': window.csrf_token }
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const result = await response.json();
        if (result.success && result.assets) {
            WorkspaceAssets = result.assets.map(serverAsset => ({
                id: serverAsset.id || ('server_' + Date.now()), // Use server ID as primary local ID
                server_id: serverAsset.id,
                type: serverAsset.blueprint?.handle || serverAsset.type, // Fallback for older structure
                name: serverAsset.data.name || serverAsset.data.title,
                timestamp: parseFloat(serverAsset.data.timestamp) || 0,
                description: serverAsset.data.description,
                image_path: serverAsset.data.image_path,
                video_path: serverAsset.data.video_path,
                start_time: parseFloat(serverAsset.data.start_time) || 0,
                end_time: parseFloat(serverAsset.data.end_time) || 0,
                is_blob_url: false // Assets from server are not blob URLs
            }));
            console.log('Workspace assets loaded from server:', WorkspaceAssets);
        } else {
            console.error('Failed to load workspace assets:', result.message);
            WorkspaceAssets = []; // Ensure it's an empty array on failure
        }
    } catch (error) {
        console.error('Error fetching initial workspace assets:', error);
        WorkspaceAssets = []; // Ensure it's an empty array on error
    }
    renderWorkspace(); // Always render, even if it's to show empty state or error
}

// (Keep existing saveAssetToServer if it's still used for ideas/stickers directly)
