<?php

use Illuminate\Support\Facades\Route;
use Pterodactyl\Http\Controllers\SideQuestArchiveController;
use Pterodactyl\Http\Controllers\SideQuestScheduleController;

Route::post('/sidequest/schedules', SideQuestScheduleController::class);
Route::post('/sidequest/archives', [SideQuestArchiveController::class, 'create']);
Route::get('/sidequest/archives', [SideQuestArchiveController::class, 'status']);
Route::post('/sidequest/archives/email', [SideQuestArchiveController::class, 'email']);
