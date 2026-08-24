<?php

namespace Pterodactyl\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class SideQuestBillingController extends Controller
{
    private function request(Request $request, string $path): array
    {
        $secret = config('sidequest.billing_bridge_secret');
        $baseUrl = config('sidequest.billing_bridge_url');
        if (!$secret || !$baseUrl) return [];
        $url = rtrim($baseUrl, '/') . $path;
        $body = json_encode(['user_id' => $request->user()->id], JSON_THROW_ON_ERROR);
        $timestamp = (string) time();
        $response = Http::timeout(10)->withHeaders([
            'Content-Type' => 'application/json',
            'X-SideQuest-Timestamp' => $timestamp,
            'X-SideQuest-Signature' => hash_hmac('sha256', "$timestamp.$body", $secret),
        ])->withBody($body, 'application/json')->post($url);

        return $response->successful() ? $response->json() : [];
    }

    public function index(Request $request): JsonResponse
    {
        return response()->json($this->request($request, '/api/panel/billing'));
    }

    public function portal(Request $request): JsonResponse
    {
        $billing = $this->request($request, '/api/panel/billing-portal');
        return isset($billing['url']) ? response()->json($billing) : response()->json(['message' => 'Billing portal unavailable.'], 503);
    }
}
