#!/usr/bin/env bash
set -euo pipefail

panel_root=/var/www/pterodactyl
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
install -D -m 0644 "$script_dir/app/Http/Controllers/SideQuestScheduleController.php" "$panel_root/app/Http/Controllers/SideQuestScheduleController.php"
install -D -m 0644 "$script_dir/app/Http/Controllers/SideQuestArchiveController.php" "$panel_root/app/Http/Controllers/SideQuestArchiveController.php"
install -D -m 0644 "$script_dir/app/Http/Controllers/SideQuestBillingController.php" "$panel_root/app/Http/Controllers/SideQuestBillingController.php"
install -D -m 0644 "$script_dir/config/sidequest.php" "$panel_root/config/sidequest.php"
install -D -m 0644 "$script_dir/resources/scripts/components/dashboard/SideQuestBillingContainer.tsx" "$panel_root/resources/scripts/components/dashboard/SideQuestBillingContainer.tsx"
install -D -m 0644 "$script_dir/resources/scripts/components/elements/Label.tsx" "$panel_root/resources/scripts/components/elements/Label.tsx"
install -D -m 0644 "$script_dir/routes/sidequest.php" "$panel_root/routes/sidequest.php"
install -D -m 0644 "$script_dir/routes/billing.php" "$panel_root/routes/billing.php"

if ! grep -Fq "SideQuestBillingContainer" "$panel_root/resources/scripts/routers/routes.ts"; then
  patch -d "$panel_root" -p0 < "$script_dir/resources/scripts/routers/routes.ts.patch"
fi

if ! grep -Fq "routes/sidequest.php" "$panel_root/app/Providers/RouteServiceProvider.php"; then
  sed -i "/Route::middleware('daemon')/i\\            Route::middleware(['api', 'application-api', 'throttle:api.application'])\n                ->prefix('/api/application')\n                ->group(base_path('routes/sidequest.php'));\n" "$panel_root/app/Providers/RouteServiceProvider.php"
fi

if ! grep -Fq "routes/billing.php" "$panel_root/app/Providers/RouteServiceProvider.php"; then
  sed -i "/->group(base_path('routes\/base.php'));/a\\                Route::middleware(['auth.session', RequireTwoFactorAuthentication::class])\n                    ->group(base_path('routes/billing.php'));\n" "$panel_root/app/Providers/RouteServiceProvider.php"
fi

cd "$panel_root"
php artisan optimize:clear
yarn build:production
