<?php

namespace Kanboard\Plugin\Drawio;

use Kanboard\Core\Plugin\Base;

/**
 * Draw.io diagrams inside Kanboard Markdown.
 *
 * The plugin adds no controller, no route, no table and no permission of its
 * own. Kanboard's Markdown parser already renders a ```diagram fence as
 * `<pre><code class="language-diagram">`; the browser turns that into an image
 * and, where Kanboard itself offers an edit action for the surrounding text,
 * into an editable diagram. Saving goes through the ordinary Kanboard form that
 * owns the Markdown, so authorisation, CSRF and persistence are unchanged.
 */
class Plugin extends Base
{
    /**
     * Where the draw.io editor is loaded from.
     *
     * Override with `define('DRAWIO_EMBED_URL', 'https://drawio.example.com/');`
     * in config.php to point at a self-hosted instance. Only "embed mode" URLs
     * work: the editor speaks the postMessage protocol solely when started with
     * `embed=1`.
     */
    const DEFAULT_EMBED_URL = 'https://embed.diagrams.net/';

    /**
     * Largest base64 payload the plugin will write into a Markdown field.
     *
     * MySQL and MariaDB store descriptions and comments in a TEXT column, which
     * holds 65535 bytes; exceeding it truncates the whole field rather than just
     * the diagram. The default leaves room for the surrounding text. On SQLite
     * and PostgreSQL the column is unbounded, so admins can raise this with
     * `define('DRAWIO_MAX_PAYLOAD_SIZE', 0);` to disable the check.
     */
    const DEFAULT_MAX_PAYLOAD_SIZE = 55000;

    public function initialize()
    {
        $this->template->hook->attach('template:layout:head', 'Drawio:layout/config');
        $this->template->hook->attach('template:layout:css', 'plugins/Drawio/Asset/css/drawio.css');

        // Load order matters: drawio-ui.js uses both other modules.
        $this->template->hook->attach('template:layout:js', 'plugins/Drawio/Asset/js/drawio-markdown.js');
        $this->template->hook->attach('template:layout:js', 'plugins/Drawio/Asset/js/drawio-editor.js');
        $this->template->hook->attach('template:layout:js', 'plugins/Drawio/Asset/js/drawio-ui.js');

        $this->allowEmbedFrame();
    }

    /**
     * Permit the draw.io iframe, and nothing else.
     *
     * Kanboard's default policy has no `frame-src`, so frames fall back to
     * `default-src 'self'` and the editor would be blocked. Declaring
     * `frame-src` explicitly ends that fallback, so `'self'` has to be restated
     * or same-origin iframes from Kanboard and other plugins would break.
     *
     * The rules are read back from the container instead of being replaced
     * wholesale, so a plugin that has already contributed a directive keeps it.
     * Nothing else is relaxed: the rendered diagram is a data: URI and
     * Kanboard's default `img-src * data:` already covers it.
     */
    private function allowEmbedFrame()
    {
        $rules = $this->container['cspRules'];
        $current = isset($rules['frame-src']) ? $rules['frame-src'] : "'self'";
        $origin = self::getEmbedOrigin();

        if (strpos($current, $origin) === false) {
            $rules['frame-src'] = trim($current.' '.$origin);
        }

        $this->setContentSecurityPolicy($rules);
    }

    public static function getEmbedUrl()
    {
        return defined('DRAWIO_EMBED_URL') ? DRAWIO_EMBED_URL : self::DEFAULT_EMBED_URL;
    }

    /**
     * The scheme and host of the embed URL, which is what CSP accepts and what
     * the browser compares postMessage origins against.
     */
    public static function getEmbedOrigin()
    {
        $url = parse_url(self::getEmbedUrl());

        if (empty($url['scheme']) || empty($url['host'])) {
            return self::DEFAULT_EMBED_URL;
        }

        $origin = $url['scheme'].'://'.$url['host'];

        if (! empty($url['port'])) {
            $origin .= ':'.$url['port'];
        }

        return $origin;
    }

    public static function getMaxPayloadSize()
    {
        return defined('DRAWIO_MAX_PAYLOAD_SIZE') ? (int) DRAWIO_MAX_PAYLOAD_SIZE : self::DEFAULT_MAX_PAYLOAD_SIZE;
    }

    public function getPluginName()
    {
        return 'Drawio';
    }

    public function getPluginDescription()
    {
        return t('Render and edit draw.io diagrams inside Kanboard Markdown');
    }

    public function getPluginAuthor()
    {
        return 'Youssef BOUTALEB';
    }

    public function getPluginVersion()
    {
        return '0.1.0';
    }

    public function getPluginHomepage()
    {
        return 'https://github.com/youssefboutaleb/kanboard-plugin-drawio';
    }

    /**
     * Minimum Kanboard version.
     *
     * The floor is set by the front-end the plugin attaches to: the `KB`
     * component runtime, `template:layout:head`, and the `text-editor`
     * component whose toolbar receives the "Insert diagram" button. All of them
     * predate 1.2.20; the value is kept conservative because the plugin is
     * verified against the 1.2.4x series.
     */
    public function getCompatibleVersion()
    {
        return '>=1.2.20';
    }
}
