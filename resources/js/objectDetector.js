// resources/js/objectDetector.js
console.log('objectDetector.js loaded');
import * as tf from '@tensorflow/tfjs';
import { loadGraphModel } from '@tensorflow/tfjs-converter';

let model = null;
const MODEL_URL = '/models/ssd_minecraft/model.json'; // Path relative to public directory

export async function loadModel() {
    if (model) {
        console.log('TensorFlow.js model already loaded.');
        return model;
    }
    console.log('Attempting to load TensorFlow.js model from:', MODEL_URL);
    try {
        // Ensure TFJS backend is ready
        await tf.ready();
        console.log('TensorFlow.js backend ready. Selected backend:', tf.getBackend());

        model = await loadGraphModel(MODEL_URL);
        console.log('TensorFlow.js model loaded successfully.');

        // Warmup the model (optional, but can help with first prediction speed)
        // This requires knowing the expected input shape for your model.
        // Example: if your model expects a 1x224x224x3 tensor:
        // const exampleInput = tf.zeros([1, 224, 224, 3]);
        // const warmupResult = model.predict(exampleInput);
        // tf.dispose(exampleInput);
        // tf.dispose(warmupResult);
        // console.log('Model warmed up.');

    } catch (error) {
        console.error('Error loading TensorFlow.js model:', error);
        model = null; // Ensure model is null if loading failed
    }
    return model;
}

/**
 * Detects objects in a given frame (canvas element) using the loaded TensorFlow.js model.
 * @param {HTMLCanvasElement} frameCanvas - The canvas element containing the frame.
 * @param {object} settings - Application settings, including confidence_threshold.
 * @returns {Promise<Array>} A promise that resolves to an array of detections.
 * Each detection could be an object like { classId: number, score: number, bbox: [x, y, width, height] }
 */
export async function detectObjectsInFrame(frameCanvas, settings) {
    if (!model) {
        console.warn('Model not loaded yet. Call loadModel() first.');
        // Optionally, try to load it now, but this might make the first detection slow.
        // await loadModel();
        // if (!model) return []; // Still failed
        return [];
    }

    console.log('Detecting objects in frame. Threshold:', settings.confidence_threshold);
    const detections = [];

    try {
        const tensor = tf.browser.fromPixels(frameCanvas).expandDims(0);
        // Preprocessing (resize, normalize, etc.) depends heavily on your model's requirements.
        // Example: common for SSD models might be resizing to 300x300 or similar.
        // const resizedTensor = tf.image.resizeBilinear(tensor, [300, 300]); // Example size
        // const normalizedTensor = resizedTensor.toFloat().div(tf.scalar(255)); // Example normalization

        // The actual `model.executeAsync` or `model.predict` call will depend on your model's signature.
        // For many object detection models (like from TF Object Detection API converted to GraphModel),
        // it might be `model.executeAsync`.
        const predictions = await model.executeAsync(tensor); // Or use your preprocessed tensor

        // Post-processing: Interpreting `predictions` is highly model-specific.
        // `predictions` could be an array of tensors.
        // You'll need to extract bounding boxes, scores, and class IDs.
        // Example structure (VERY GENERIC - CONSULT YOUR MODEL'S DOCUMENTATION):
        // const scores = predictions[0].dataSync(); // Or some specific output tensor for scores
        // const boxes = predictions[1].dataSync();   // For bounding boxes
        // const classes = predictions[2].dataSync(); // For class IDs
        // const numDetections = predictions[3].dataSync()[0]; // Number of actual detections

        // For SSD Mobilenet converted from TF Hub, the output might be a single tensor
        // or an object with named outputs like 'detection_boxes', 'detection_scores', 'detection_classes'.
        // Assuming `predictions` is an array of tensors [boxes, scores, classes, num_detections]
        // This is a common signature for models from TF1 Object Detection API.

        // If `model.executeAsync` returns a named map (more common with TF2 saved models converted):
        // const outputMap = await model.executeAsync(tensor);
        // const scores = outputMap['detection_scores'].dataSync();
        // const boxes = outputMap['detection_boxes'].dataSync();
        // const classes = outputMap['detection_classes'].dataSync();
        // const numDetections = outputMap['num_detections'] ? outputMap['num_detections'].dataSync()[0] : scores.length; // Or determine from scores array

        // For this placeholder, let's assume `predictions` is an array of output tensors
        // and we need to figure out which one is which, or the model has a simple structure.
        // This part is CRITICAL and needs to match your specific model's output signature.

        // SIMPLIFIED/PLACEHOLDER post-processing:
        // This assumes a very simple model or needs significant adjustment.
        if (Array.isArray(predictions)) {
            // Typical TFOD API output tensor order:
            // [0] num_detections (shape [1])
            // [1] detection_boxes (shape [1, N, 4]) - ymin, xmin, ymax, xmax
            // [2] detection_classes (shape [1, N]) - class indices (1-based usually)
            // [3] detection_scores (shape [1, N])
            // [4] (optional) detection_masks etc.
            // The exact order and content can vary. Check your model's signature.json or use Netron.

            // Let's try to infer based on common TF Hub SSD Mobilenet output names if it's a named map
            let detection_scores, detection_boxes, detection_classes, num_detections_val;

            if (predictions.hasOwnProperty('detection_scores')) { // Named output
                detection_scores = predictions['detection_scores'].dataSync();
                detection_boxes = predictions['detection_boxes'].dataSync();
                detection_classes = predictions['detection_classes'].dataSync();
                num_detections_val = predictions['num_detections'] ? predictions['num_detections'].dataSync()[0] : detection_scores.length;
            } else if (predictions.length >= 4) { // Ordered output tensors (common for converted TF1 models)
                // This order is a guess, TF Hub models might have a different order.
                // Usually: boxes, classes, scores, num_detections. Or scores, boxes, classes.
                // For ssd_mobilenet_v2_coco from TF Hub, after conversion, it's often:
                // 0: detection_boxes, 1: detection_classes, 2: detection_scores, 3: num_detections
                // Let's assume this common order for TF OD API models:
                const p_boxes = predictions[0].dataSync();    // Example: shape [1, 100, 4]
                const p_classes = predictions[1].dataSync();  // Example: shape [1, 100]
                const p_scores = predictions[2].dataSync();   // Example: shape [1, 100]
                const p_num_detections = predictions[3].dataSync()[0]; // Example: shape [1]

                num_detections_val = p_num_detections;
                detection_scores = p_scores;
                detection_boxes = p_boxes;
                detection_classes = p_classes;
            }


            if (detection_scores && detection_boxes && detection_classes) {
                for (let i = 0; i < num_detections_val; i++) {
                    const score = detection_scores[i];
                    if (score >= settings.confidence_threshold) {
                        const classId = detection_classes[i]; // Adjust if 0-indexed vs 1-indexed
                        // Bbox format [ymin, xmin, ymax, xmax] typically, relative to image size (0.0-1.0)
                        // Convert to [x, y, width, height] in pixels
                        const ymin = detection_boxes[i * 4] * frameCanvas.height;
                        const xmin = detection_boxes[i * 4 + 1] * frameCanvas.width;
                        const ymax = detection_boxes[i * 4 + 2] * frameCanvas.height;
                        const xmax = detection_boxes[i * 4 + 3] * frameCanvas.width;
                        const bbox = [xmin, ymin, xmax - xmin, ymax - ymin];

                        detections.push({ classId, score, bbox });
                    }
                }
            } else {
                console.warn('Could not interpret model predictions. Output structure might be different.');
            }


            // Dispose of all tensors in the predictions array/object
            if (Array.isArray(predictions)) {
                predictions.forEach(t => tf.dispose(t));
            } else if (typeof predictions === 'object' && predictions !== null) {
                for (const key in predictions) {
                    if (predictions[key] instanceof tf.Tensor) {
                        tf.dispose(predictions[key]);
                    }
                }
            }
        } else {
            console.warn('Model predictions format not recognized as an array or named map of tensors.');
        }

        tf.dispose(tensor);
        // tf.dispose(resizedTensor);
        // tf.dispose(normalizedTensor);

    } catch (error) {
        console.error('Error during object detection:', error);
    }

    console.log(`Detected ${detections.length} objects meeting threshold.`);
    return detections;
}

// Attempt to load the model when the script is loaded, or call explicitly from uiHandlers.
// loadModel(); // Optional: Pre-load model. Can also be triggered by UI.
