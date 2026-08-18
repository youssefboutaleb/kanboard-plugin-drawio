<?php
/**
 * Regenerate test/fixtures/parsedown-expected.json from a real Kanboard checkout.
 *
 * The plugin locates a diagram in the Markdown source by its ordinal among the
 * ```diagram fences, which is only sound while the JavaScript tokenizer agrees
 * with the parser Kanboard actually runs. This script records what that parser
 * produces so the agreement can be asserted without PHP.
 *
 * Usage: php test/parsedown-parity.php /path/to/kanboard
 */
$kanboard = isset($argv[1]) ? rtrim($argv[1], '/') : '';
$parsedown = $kanboard.'/libs/erusev/parsedown/Parsedown.php';

if (! is_file($parsedown)) {
    fwrite(STDERR, "usage: php test/parsedown-parity.php /path/to/kanboard\n");
    exit(1);
}

require $parsedown;

$root = __DIR__.'/fixtures';
$cases = json_decode(file_get_contents($root.'/markdown-cases.json'), true);
$expected = array();

foreach ($cases as $markdown) {
    // The same settings Kanboard\Helper\TextHelper::markdown() applies.
    $parser = new Parsedown();
    $parser->setSafeMode(true);
    $parser->setMarkupEscaped(true);
    $parser->setBreaksEnabled(true);

    preg_match_all(
        '/<code class="language-diagram">(.*?)<\/code>/s',
        $parser->text($markdown),
        $matches
    );

    $expected[] = array_map(function ($payload) {
        return preg_replace('/\s+/', '', html_entity_decode($payload, ENT_QUOTES, 'UTF-8'));
    }, $matches[1]);
}

file_put_contents(
    $root.'/parsedown-expected.json',
    json_encode($expected, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)."\n"
);

echo "wrote ".count($expected)." cases from ".Parsedown::version."\n";
