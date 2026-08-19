#!/usr/bin/env bash
set -euo pipefail

panel_root=/var/www/pterodactyl
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
install -D -m 0644 "$script_dir/app/Http/Controllers/SideQuestScheduleController.php" "$panel_root/app/Http/Controllers/SideQuestScheduleController.php"
install -D -m 0644 "$script_dir/routes/sidequest.php" "$panel_root/routes/sidequest.php"

if ! grep -Fq "routes/sidequest.php" "$panel_root/app/Providers/RouteServiceProvider.php"; then
  sed -i "/Route::middleware('daemon')/i\\            Route::middleware(['api', 'application-api', 'throttle:api.application'])\n                ->prefix('/api/application')\n                ->group(base_path('routes/sidequest.php'));\n" "$panel_root/app/Providers/RouteServiceProvider.php"
fi

cd "$panel_root"
php artisan optimize:clear
