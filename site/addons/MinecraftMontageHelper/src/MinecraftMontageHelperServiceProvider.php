<?php

namespace Site\Addons\MinecraftMontageHelper;

use Statamic\Providers\AddonServiceProvider;

class MinecraftMontageHelperServiceProvider extends AddonServiceProvider
{
    public function boot()
    {
        parent::boot();

        // Optional: Load routes if you have them defined within the addon
        // $this->loadRoutesFrom(__DIR__.'/../routes/web.php');

        // Optional: Load views if you have them
        // $this->loadViewsFrom(__DIR__.'/../resources/views', 'minecraft-montage-helper');
    }

    public function register()
    {
        // Optional: Register bindings or singletons
    }
}
