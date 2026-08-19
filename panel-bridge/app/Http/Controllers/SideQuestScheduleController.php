<?php

namespace Pterodactyl\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Pterodactyl\Helpers\Utilities;
use Pterodactyl\Models\Schedule;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Task;

class SideQuestScheduleController extends Controller
{
    private const SCHEDULES = [
        'palworld' => [
            'name' => 'Daily 3:57 AM Central Backup and Restart',
            'minute' => '57',
            'hour' => '3',
            'tasks' => [
                ['action' => 'command', 'payload' => 'Save', 'time_offset' => 0, 'continue_on_failure' => true],
                ['action' => 'power', 'payload' => 'stop', 'time_offset' => 60, 'continue_on_failure' => false],
                ['action' => 'backup', 'payload' => '', 'time_offset' => 60, 'continue_on_failure' => false],
                ['action' => 'power', 'payload' => 'start', 'time_offset' => 300, 'continue_on_failure' => false],
            ],
        ],
        'zomboid' => [
            'name' => 'Project Zomboid Nightly Backup',
            'minute' => '0',
            'hour' => '5',
            'tasks' => [
                ['action' => 'command', 'payload' => 'save', 'time_offset' => 0, 'continue_on_failure' => false],
                ['action' => 'power', 'payload' => 'stop', 'time_offset' => 60, 'continue_on_failure' => false],
                ['action' => 'backup', 'payload' => '', 'time_offset' => 120, 'continue_on_failure' => false],
                ['action' => 'power', 'payload' => 'start', 'time_offset' => 300, 'continue_on_failure' => false],
            ],
        ],
    ];

    public function __invoke(Request $request): JsonResponse
    {
        $data = $request->validate([
            'server_id' => ['required', 'integer'],
            'game' => ['required', 'in:palworld,zomboid'],
        ]);
        $server = Server::query()->findOrFail($data['server_id']);
        $definition = self::SCHEDULES[$data['game']];

        $schedule = DB::transaction(function () use ($server, $definition) {
            $schedule = Schedule::query()->firstOrNew([
                'server_id' => $server->id,
                'name' => $definition['name'],
            ]);
            $schedule->fill([
                'cron_day_of_week' => '*',
                'cron_month' => '*',
                'cron_day_of_month' => '*',
                'cron_hour' => $definition['hour'],
                'cron_minute' => $definition['minute'],
                'is_active' => true,
                'is_processing' => false,
                'only_when_online' => false,
                'next_run_at' => Utilities::getScheduleNextRunDate($definition['minute'], $definition['hour'], '*', '*', '*'),
            ]);
            $schedule->save();

            Task::query()->where('schedule_id', $schedule->id)->delete();
            foreach ($definition['tasks'] as $index => $task) {
                Task::query()->create([
                    'schedule_id' => $schedule->id,
                    'sequence_id' => $index + 1,
                    'action' => $task['action'],
                    'payload' => $task['payload'],
                    'time_offset' => $task['time_offset'],
                    'is_queued' => false,
                    'continue_on_failure' => $task['continue_on_failure'],
                ]);
            }

            return $schedule;
        });

        return new JsonResponse(['id' => $schedule->id]);
    }
}
