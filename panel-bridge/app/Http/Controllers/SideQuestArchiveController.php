<?php

namespace Pterodactyl\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;
use Pterodactyl\Models\Backup;
use Pterodactyl\Models\Server;
use Pterodactyl\Services\Backups\DownloadLinkService;
use Pterodactyl\Services\Backups\InitiateBackupService;

class SideQuestArchiveController extends Controller
{
    public function create(Request $request, InitiateBackupService $service): JsonResponse
    {
        $data = $request->validate([
            'server_id' => ['required', 'integer'],
            'order_id' => ['required', 'string', 'max:128'],
        ]);
        $server = Server::query()->findOrFail($data['server_id']);
        $name = sprintf('SideQuest cancellation archive %s', $data['order_id']);
        $backup = Backup::query()->where('server_id', $server->id)->where('name', $name)->first();
        if (!$backup) {
            // The backup is retained only while it is copied to R2, so it must remain manageable.
            $backup = $service->handle($server, $name, true);
        }

        return new JsonResponse(['uuid' => $backup->uuid]);
    }

    public function status(Request $request, DownloadLinkService $links): JsonResponse
    {
        $data = $request->validate([
            'server_id' => ['required', 'integer'],
            'backup_uuid' => ['required', 'uuid'],
        ]);
        $server = Server::query()->findOrFail($data['server_id']);
        $backup = Backup::query()->where('server_id', $server->id)->where('uuid', $data['backup_uuid'])->firstOrFail();
        $complete = $backup->is_successful && $backup->completed_at;

        return new JsonResponse([
            'complete' => (bool) $complete,
            'failed' => !$backup->is_successful && $backup->completed_at !== null,
            'download_url' => $complete ? $links->handle($backup, $server->user) : null,
        ]);
    }

    public function email(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email:rfc,dns'],
            'game' => ['required', 'in:palworld,zomboid'],
            'download_url' => ['required', 'url', 'max:2048'],
            'expires_at' => ['required', 'integer'],
        ]);
        $expires = gmdate('Y-m-d H:i:s', $data['expires_at']) . ' UTC';
        $game = ucfirst($data['game']);
        Mail::raw(
            "Your {$game} server backup is ready. Download it before {$expires}: {$data['download_url']}",
            function ($message) use ($data) {
                $message->to($data['email'])->subject('Your SideQuest Servers backup is ready');
            }
        );

        return new JsonResponse(['ok' => true]);
    }
}
