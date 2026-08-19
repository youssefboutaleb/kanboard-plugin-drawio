<?php

use Kanboard\Plugin\Drawio\Plugin;

/**
 * Configuration and translated strings for the browser.
 *
 * Kanboard's CSP is `default-src 'self'` with no `script-src` exception, so an
 * inline `<script>` block would be refused. Meta tags carry the values instead.
 */
?>
<meta name="drawio-embed-url" content="<?= $this->text->e(Plugin::getEmbedUrl()) ?>">
<meta name="drawio-max-payload" content="<?= (int) Plugin::getMaxPayloadSize() ?>">
<meta name="drawio-label-insert" content="<?= $this->text->e(t('Insert diagram')) ?>">
<meta name="drawio-label-edit" content="<?= $this->text->e(t('Edit diagram')) ?>">
<meta name="drawio-label-alt" content="<?= $this->text->e(t('draw.io diagram')) ?>">
<meta name="drawio-label-invalidPayload" content="<?= $this->text->e(t('This diagram could not be decoded.')) ?>">
<meta name="drawio-label-invalidExport" content="<?= $this->text->e(t('draw.io returned a diagram that could not be read. Nothing was changed.')) ?>">
<meta name="drawio-label-notFound" content="<?= $this->text->e(t('This diagram is no longer where it was in the Markdown source. Refresh the page and try again.')) ?>">
<meta name="drawio-label-quoted" content="<?= $this->text->e(t('This diagram is inside a quoted block that is not consistently quoted, so editing it here could damage the quotation.')) ?>">
<meta name="drawio-label-quotedConfirm" content="<?= $this->text->e(t('This diagram is inside a quoted block. Editing it changes the quotation. Continue?')) ?>">
<meta name="drawio-label-tooLarge" content="<?= $this->text->e(t('This diagram is too large to be stored in this field. Simplify it and try again.')) ?>">
