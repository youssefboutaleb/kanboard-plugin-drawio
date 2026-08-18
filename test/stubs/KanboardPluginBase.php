<?php

namespace Kanboard\Core\Plugin;

/**
 * Minimal stand-in for Kanboard's plugin base class.
 *
 * Plugin.php extends it, so the file cannot be loaded outside a Kanboard
 * installation without something to extend. Only what Plugin.php touches at load
 * time is needed: the class itself. Nothing here is used at runtime.
 */
abstract class Base
{
    protected $container;

    public function __construct($container = null)
    {
        $this->container = $container;
    }

    abstract public function initialize();
}
