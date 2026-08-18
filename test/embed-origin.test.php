<?php

declare(strict_types=1);

/**
 * Origin parsing for DRAWIO_EMBED_URL.
 *
 * This is the value that ends up in the Content-Security-Policy and that the
 * browser compares every incoming postMessage origin against, so it gets a
 * regression guard even though the rest of the plugin's PHP is glue.
 *
 * A constant can only be defined once per process, so the case under test is
 * passed on the command line and the runner below invokes this script once per
 * case. Usage: php test/embed-origin.test.php '<url>' '<expected origin>'
 */
require __DIR__.'/stubs/KanboardPluginBase.php';

if ($argc === 3 && $argv[1] !== '') {
    define('DRAWIO_EMBED_URL', $argv[1]);
}

require __DIR__.'/../Plugin.php';

use Kanboard\Plugin\Drawio\Plugin;

$expected = $argc === 3 ? $argv[2] : '';
$actual = Plugin::getEmbedOrigin();

if ($actual !== $expected) {
    fwrite(STDERR, sprintf(
        "✖ %s\n    expected origin: %s\n    actual origin:   %s\n",
        $argv[1] === '' ? '(default)' : $argv[1],
        var_export($expected, true),
        var_export($actual, true)
    ));
    exit(1);
}

exit(0);
