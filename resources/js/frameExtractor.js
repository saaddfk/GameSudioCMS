// resources/js/frameExtractor.js
// ... (keep existing console.log and function signature)
export function extractFrames(videoElement, intervalSeconds, settings, onProgress, onComplete, onError, videoSrcUrl) { // Added videoSrcUrl
    console.log('Frame extraction process started with interval:', intervalSeconds, 'seconds. Video src:', videoSrcUrl);
    // ... (rest of the existing function logic)

    const frames = [];
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const totalDuration = videoElement.duration;
    let currentTime = 0;
    let frameCount = 0;

    videoElement.pause(); // Ensure video is paused for frame seeking

    function seekAndCapture() {
        if (currentTime > totalDuration) {
            if (onProgress) onProgress(100);
            if (onComplete) onComplete(frames, videoSrcUrl); // Pass videoSrcUrl here
            console.log('Frame extraction process completed.');
            return;
        }
        // ... (rest of seekAndCapture logic)
        videoElement.currentTime = currentTime;
    }

    videoElement.onseeked = () => {
        if (currentTime > totalDuration && frames.length > 0) {
            if (onProgress) onProgress(100);
            if (onComplete) onComplete(frames, videoSrcUrl); // Pass videoSrcUrl here
            console.log('Frame extraction process completed (onseeked after duration).');
            return;
        }
        // ... (rest of onseeked logic)
        if (videoElement.currentTime < currentTime && currentTime !== 0) {
            // Seeking might not be perfectly accurate, or we jumped too far.
            // If seek lands before desired currentTime, and it's not the start,
            // it could mean we are stuck or the video has issues.
            // For simplicity, we'll proceed, but this could be a point of failure.
             console.warn(`Video seeked to ${videoElement.currentTime} instead of ${currentTime}. Proceeding.`);
        }


        // Set canvas dimensions to video's intrinsic dimensions
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;

        // Draw the current video frame to the canvas
        context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

        // Create a new canvas for each frame to store it independently
        const frameCanvas = document.createElement('canvas');
        frameCanvas.width = canvas.width;
        frameCanvas.height = canvas.height;
        const frameContext = frameCanvas.getContext('2d');
        frameContext.drawImage(canvas, 0, 0); // Draw from the main canvas
        frames.push(frameCanvas);
        frameCount++;

        const progress = Math.min(99, (currentTime / totalDuration) * 100); // Cap at 99 until truly complete
        if (onProgress) onProgress(progress);

        currentTime += intervalSeconds;
        // Small timeout to allow UI to update and prevent freezing on very short videos / fast CPUs
        setTimeout(seekAndCapture, 20);
    };

    videoElement.onerror = (e) => {
        if (onError) onError('Video element error during frame extraction: ' + e.message);
        console.error('Video error:', e);
    };

    // Start the process
    if (onProgress) onProgress(0);
    seekAndCapture();
}
