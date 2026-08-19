<?php

use Illuminate\Support\Facades\Route;
use Pterodactyl\Http\Controllers\SideQuestScheduleController;

Route::post('/sidequest/schedules', SideQuestScheduleController::class);
