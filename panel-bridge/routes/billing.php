<?php

use Illuminate\Support\Facades\Route;
use Pterodactyl\Http\Controllers\SideQuestBillingController;

Route::get('/api/sidequest/billing', [SideQuestBillingController::class, 'index'])->name('sidequest.billing');
Route::post('/api/sidequest/billing/portal', [SideQuestBillingController::class, 'portal'])->name('sidequest.billing.portal');
