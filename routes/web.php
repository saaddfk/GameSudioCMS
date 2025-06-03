<?php

use Illuminate\Support\Facades\Route;
use Site\Addons\MinecraftMontageHelper\Controllers\VideoController;

// Minecraft Montage Helper Routes
Route::get('/upload', [VideoController::class, 'showUploadForm'])->name('montage.upload_form');
Route::post('/process-video', [VideoController::class, 'upload'])->name('montage.process_video');

Route::get('/workspace', [VideoController::class, 'showWorkspace'])->name('montage.workspace');
Route::post('/save-asset', [VideoController::class, 'saveAsset'])->name('montage.save_asset');
Route::get('/list-assets', [VideoController::class, 'listAssets'])->name('montage.list_assets'); // For JS to fetch assets

Route::get('/download-zip', [VideoController::class, 'downloadZip'])->name('montage.download_zip');

Route::get('/settings', [VideoController::class, 'showSettings'])->name('montage.settings_form');
Route::post('/settings/save', [VideoController::class, 'saveSettings'])->name('montage.settings_save');
Route::get('/settings/get', [VideoController::class, 'getSettings'])->name('montage.settings_get');

// Route::statamic('example', 'example-view', [
//    'title' => 'Example'
// ]);
