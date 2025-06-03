<?php

namespace Site\Addons\MinecraftMontageHelper\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Auth; // For user ID
use Statamic\Facades\Entry;
use Statamic\Http\Controllers\Controller; // Statamic's base controller
use Illuminate\Support\Str; // For Str::slug
use ZipArchive; // For zipping files
use Illuminate\Http\File; // For managing files

class VideoController extends Controller
{
    // Helper to get user-specific asset path
    private function getUserAssetPath($subfolder = '')
    {
        $userId = Auth::id() ?? 'guest'; // Default to 'guest' if no user is logged in
        return 'minecraft_assets/' . $userId . ($subfolder ? '/' . trim($subfolder, '/') : '');
    }

    // Helper to get user-specific public storage path for generated assets
    private function getUserPublicAssetPath($subfolder = '')
    {
        $userId = Auth::id() ?? 'guest';
        return 'public/minecraft_assets/' . $userId . ($subfolder ? '/' . trim($subfolder, '/') : '');
    }

    // Helper to get user-specific full storage path for generated assets
    private function getUserFullAssetStoragePath($subfolder = '')
    {
         $userId = Auth::id() ?? 'guest';
         return storage_path('app/public/minecraft_assets/' . $userId . ($subfolder ? '/' . trim($subfolder, '/') : ''));
    }


    public function showUploadForm()
    {
        return view('pages.upload_video');
    }

    public function showWorkspace(Request $request)
    {
        $userId = Auth::id() ?? 'guest';
        $assets = Entry::query()
            ->where('collection', 'montage_assets')
            // TODO: Add a filter for user_id if we add that to blueprints
            // ->where('user_id', $userId) // Example, requires 'user_id' field in blueprints
            ->orderBy('created_at', 'desc')
            ->get();

        return view('pages.workspace', ['montage_assets' => $assets]);
    }

    public function showSettings()
    {
        // For now, just return the view. Settings loading will be added later.
        return view('pages.settings');
    }

    public function upload(Request $request)
    {
        $request->validate([
            'video' => 'required|file|mimetypes:video/mp4,video/webm|max:500000', // Max 500MB
            'interval' => 'required|numeric|min:0.1',
        ]);

        if ($request->hasFile('video')) {
            $file = $request->file('video');
            $originalName = $file->getClientOriginalName();
            $filename = pathinfo($originalName, PATHINFO_FILENAME) . '_' . time() . '.' . $file->getClientOriginalExtension();

            // Store in storage/app/public/videos for temporary processing by JS
            $path = $file->storeAs('public/videos', $filename);

            if ($path) {
                return response()->json([
                    'success' => true,
                    'videoUrl' => Storage::url($path), // URL accessible by the browser
                    'filename' => $filename,
                    'message' => 'Video uploaded successfully. Ready for analysis.'
                ]);
            }

            return response()->json(['success' => false, 'message' => 'Failed to store video.'], 500);
        }

        return response()->json(['success' => false, 'message' => 'No video file uploaded.'], 400);
    }

    public function extractFrames(Request $request)
    {
        // This method is largely a placeholder as per the issue description.
        // Actual frame extraction is client-side.
        // It might be used to log the start of processing or similar.
        $request->validate([
            'videoUrl' => 'required|string',
        ]);

        // Log::info('Frame extraction process initiated for: ' . $request->input('videoUrl'));
        return response()->json(['success' => true, 'message' => 'Frame extraction process acknowledged.']);
    }

    public function listAssets(Request $request)
    {
        $userId = Auth::id() ?? 'guest';
        $assets = Entry::query()
            ->where('collection', 'montage_assets')
            // ->where('user_id', $userId) // If user association is added
            ->orderBy('created_at', 'desc')
            ->get()
            ->map(function ($entry) {
                return [
                    'id' => $entry->id(),
                    'slug' => $entry->slug(),
                    'type' => $entry->blueprint()->handle(), // 'idea', 'sticker', or 'clip'
                    'data' => $entry->data()->all(),
                    'url' => $entry->url(),
                ];
            });

        return response()->json(['success' => true, 'assets' => $assets]);
    }

    public function saveAsset(Request $request)
    {
        $validated = $request->validate([
            'type' => 'required|string|in:idea,sticker,clip',
            'name' => 'required|string|max:255',
            'timestamp' => 'nullable|numeric', // For ideas
            'description' => 'nullable|string', // For ideas
            'image_path' => 'nullable|string', // For stickers
            'video_path' => 'nullable|string', // For clips (could be a temporary path or Blob URL info)
            'start_time' => 'nullable|numeric', // For clips
            'end_time' => 'nullable|numeric', // For clips
            'associated_stickers' => 'nullable|array',
            'associated_clips' => 'nullable|array',
            // If file is uploaded directly for clips (e.g. blob)
            'video_file' => 'nullable|file|mimetypes:video/mp4,video/webm|max:50000' // Max 50MB for clips
        ]);

        $userId = Auth::id() ?? 'guest';
        $collection = 'montage_assets';
        $blueprintHandle = $validated['type'];
        $slug = Str::slug($validated['name']) . '-' . time();

        $data = [
            'title' => $validated['name'], // Common field for title, specific 'name' can also be kept if needed
            'name' => $validated['name'],
            // 'user_id' => $userId, // If you add user_id field to blueprints
        ];

        if ($blueprintHandle === 'idea') {
            $data['description'] = $validated['description'] ?? '';
            $data['timestamp'] = $validated['timestamp'] ?? 0;
            // TODO: Handle associated_stickers and associated_clips (linking to existing entries)
        } elseif ($blueprintHandle === 'sticker') {
            // Sticker image path is expected to be a URL/path managed by client-side for now
            // or handled if a file is directly uploaded for stickers in future
            $data['image_path'] = $validated['image_path'] ?? '';
        } elseif ($blueprintHandle === 'clip') {
            // If a video_file (blob) is uploaded for a clip
            if ($request->hasFile('video_file')) {
                $clipFile = $request->file('video_file');
                $clipFileName = Str::slug($validated['name']) . '_' . time() . '.' . $clipFile->getClientOriginalExtension();

                // Store in user-specific public directory
                $userClipPath = $this->getUserAssetPath('clips'); // Relative to 'minecraft_assets' disk root
                $storedClipPath = $clipFile->storeAs($userClipPath, $clipFileName, 'minecraft_assets');

                if ($storedClipPath) {
                     // We need the public URL
                    $data['video_path'] = Storage::disk('minecraft_assets')->url($storedClipPath);
                } else {
                    return response()->json(['success' => false, 'message' => 'Failed to save clip file.'], 500);
                }
            } else {
                 // If video_path is provided directly (e.g. existing URL, less likely for new clips)
                $data['video_path'] = $validated['video_path'] ?? '';
            }
            $data['start_time'] = $validated['start_time'] ?? 0;
            $data['end_time'] = $validated['end_time'] ?? 0;
        }

        try {
            $entry = Entry::make()
                ->collection($collection)
                ->blueprint($blueprintHandle)
                ->slug($slug)
                ->data($data);

            // For Statamic 3.3+ you might need to set the site if multi-site is configured
            // $entry->locale(Site::current()->handle());

            $entry->save();

            return response()->json(['success' => true, 'message' => ucfirst($blueprintHandle) . ' saved successfully.', 'entry' => $entry->toArray()]);
        } catch (\Exception $e) {
            // Log::error('Failed to save asset: ' . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'Error saving asset: ' . $e->getMessage()], 500);
        }
    }

    public function getSettings(Request $request)
    {
        // Placeholder: In a real app, load from addon settings or a global
        $defaultSettings = [
            'extraction_interval' => 1.0,
            'confidence_threshold' => 0.6,
            'clip_padding_before' => 2.0,
            'clip_padding_after' => 3.0,
        ];
        // Example: $settings = Settings::load('minecraft_montage_helper');
        // return response()->json($settings ?? $defaultSettings);
        return response()->json($defaultSettings);
    }

    public function saveSettings(Request $request)
    {
        $validated = $request->validate([
            'extraction_interval' => 'required|numeric|min:0.1',
            'confidence_threshold' => 'required|numeric|min:0|max:1',
            'clip_padding_before' => 'required|numeric|min:0',
            'clip_padding_after' => 'required|numeric|min:0',
        ]);

        // Placeholder: In a real app, save to addon settings or a global
        // Example: Settings::save('minecraft_montage_helper', $validated);
        // For now, just return success
        // file_put_contents(storage_path('app/minecraft_montage_settings.json'), json_encode($validated));


        // A simple way to store settings without full addon config system initially:
        // Use Statamic's global variables or a specific JSON file.
        // For simplicity, let's assume we'll use a JSON file in storage.
        $settingsPath = storage_path('app/minecraft_montage_helper_settings.json');
        file_put_contents($settingsPath, json_encode($validated, JSON_PRETTY_PRINT));


        return response()->json(['success' => true, 'message' => 'Settings saved successfully.']);
    }


    public function downloadZip(Request $request)
    {
        $userId = Auth::id() ?? 'guest';
        $userAssetBasePath = $this->getUserFullAssetStoragePath(); // Full path for zipping
        $userStickersPath = $this->getUserFullAssetStoragePath('stickers');
        $userClipsPath = $this->getUserFullAssetStoragePath('clips');

        $zipFileName = 'Minecraft_Montage_Assets_' . $userId . '_' . time() . '.zip';
        $zipFilePath = storage_path('app/temp/' . $zipFileName);

        // Ensure temp directory exists
        if (!Storage::exists('temp')) {
            Storage::makeDirectory('temp');
        }

        $zip = new ZipArchive;
        if ($zip->open($zipFilePath, ZipArchive::CREATE | ZipArchive::OVERWRITE) === TRUE) {
            // Add stickers
            if (Storage::disk('local')->exists(str_replace(storage_path('app'), '', $userStickersPath))) {
                 $stickers = Storage::disk('local')->allFiles(str_replace(storage_path('app'), '', $userStickersPath));
                foreach ($stickers as $stickerFile) {
                    $filePath = storage_path('app/' . $stickerFile);
                    $relativePathInZip = 'stickers/' . basename($filePath);
                    $zip->addFile($filePath, $relativePathInZip);
                }
            }

            // Add clips
            if (Storage::disk('local')->exists(str_replace(storage_path('app'), '', $userClipsPath))) {
                $clips = Storage::disk('local')->allFiles(str_replace(storage_path('app'), '', $userClipsPath));
                foreach ($clips as $clipFile) {
                    $filePath = storage_path('app/' . $clipFile);
                    $relativePathInZip = 'clips/' . basename($filePath);
                    $zip->addFile($filePath, $relativePathInZip);
                }
            }

            // Optionally, add a manifest or idea list
            $ideas = Entry::query()
                ->where('collection', 'montage_assets')
                ->where('blueprint', 'idea')
                // ->where('user_id', $userId) // If user association is added
                ->get();

            $manifestContent = "Minecraft Montage Assets Export - User: {$userId}\n\n";
            foreach($ideas as $idea) {
                $manifestContent .= "Idea: " . $idea->get('title') . "\n";
                $manifestContent .= "Timestamp: " . $idea->get('timestamp') . "s\n";
                $manifestContent .= "Description: " . $idea->get('description') . "\n\n";
            }
            $zip->addFromString('manifest.txt', $manifestContent);


            $zip->close();

            return response()->download($zipFilePath)->deleteFileAfterSend(true);
        } else {
            return response()->json(['success' => false, 'message' => 'Could not create ZIP file.'], 500);
        }
    }
}
