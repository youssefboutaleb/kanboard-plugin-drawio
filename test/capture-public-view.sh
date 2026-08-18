#!/usr/bin/env bash
#
# Regenerate test/fixtures/public-task.html from a real Kanboard instance.
#
# The public (token) task view is the one surface where Kanboard serves the
# plugin's assets but *not* its own JavaScript: layout.php skips app.min.js and
# vendor.min.js when `not_editable` is set, while the template:layout:{css,js,head}
# hooks are rendered outside that guard. The fixture records what the browser
# actually receives there, so test/public-view.test.js can assert the plugin
# renders read-only diagrams without inventing the markup.
#
# Usage: bash test/capture-public-view.sh            (needs Docker)
#        KB_IMAGE=kanboard/kanboard:v1.2.54 bash test/capture-public-view.sh
set -euo pipefail

cd "$(dirname "$0")/.."

KB_IMAGE=${KB_IMAGE:-kanboard/kanboard:v1.2.53}
CONTAINER=${CONTAINER:-kb-drawio-fixture}
PORT=${PORT:-8099}
BASE="http://localhost:${PORT}"
FIXTURE="test/fixtures/public-task.html"

for tool in docker curl node; do
    command -v "${tool}" >/dev/null 2>&1 || { echo "✖ ${tool} is required" >&2; exit 1; }
done

cleanup() { docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true; }
trap cleanup EXIT

cleanup
echo "--> starting ${KB_IMAGE} on ${PORT} with the plugin mounted"
docker run -d --name "${CONTAINER}" -p "${PORT}:80" \
    -v "$(pwd)":/var/www/app/plugins/Drawio:ro "${KB_IMAGE}" >/dev/null

rpc() {
    curl -s -u admin:admin -H 'Content-Type: application/json' \
        --data-binary @- "${BASE}/jsonrpc.php"
}

# "/" answers 302 once a session cookie is expected, so readiness is measured on
# the API instead of on a status code.
for _ in $(seq 1 60); do
    echo '{"jsonrpc":"2.0","id":0,"method":"getVersion"}' | rpc | grep -q '"result"' && break
    sleep 1
done

# Two different diagrams: one in the description, one in a comment. Both carry
# an mxfile in the SVG's `content` attribute, exactly as draw.io's xmlsvg export
# does, so the payloads survive the plugin's validation like real ones.
echo "--> seeding a public project, a task and a comment"
node -e '
const svg = (label) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60" content="&lt;mxfile&gt;&lt;diagram&gt;${label}&lt;/diagram&gt;&lt;/mxfile&gt;">` +
    `<rect width="120" height="60" fill="#dae8fc" stroke="#6c8ebf"/><text x="12" y="34">${label}</text></svg>`;
const fence = (label) => "```diagram\n" + Buffer.from(svg(label)).toString("base64") + "\n```";
const call = (id, method, params) => JSON.stringify({jsonrpc: "2.0", id, method, params});

process.stdout.write([
    call(1, "createProject", {name: "Drawio fixture"}),
    call(2, "createTask", {
        title: "Diagram task",
        project_id: 1,
        description: "A read-only reader sees this diagram.\n\n" + fence("description")
    }),
    call(3, "createComment", {
        task_id: 1,
        user_id: 1,
        content: "And this one in a comment.\n\n" + fence("comment")
    }),
    call(4, "enableProjectPublicAccess", {project_id: 1})
].join("\n") + "\n");
' | while read -r payload; do echo "${payload}" | rpc >/dev/null; done

TOKEN=$(echo '{"jsonrpc":"2.0","id":5,"method":"getProjectById","params":{"project_id":1}}' \
    | rpc | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).result.token))')

[ -n "${TOKEN}" ] || { echo "✖ no public token; seeding failed" >&2; exit 1; }

echo "--> capturing the public task view"
curl -sf "${BASE}/?controller=TaskViewController&action=readonly&task_id=1&token=${TOKEN}" \
    -o "${FIXTURE}.raw"

# Kept verbatim apart from two substitutions, both noise for this test:
#   - AssetHelper::css()/js() append filemtime() to every URL, which would churn
#     the fixture on every checkout;
#   - colorCss() inlines ~9KB of task-colour rules that have nothing to do with
#     the plugin.
node -e '
const fs = require("fs");
const file = process.argv[1];
let html = fs.readFileSync(file + ".raw", "utf8");

html = html.replace(/<style>\.task-board\.color-[\s\S]*?<\/style>/, "<style>/* task colours removed: see test\/capture-public-view.sh */</style>");
html = html.replace(/(\.(?:css|js))\?\d+/g, "$1");
html = html.replace(/token=[0-9a-f]{40,}/g, "token=PUBLIC_TOKEN");

fs.writeFileSync(file, html.trimEnd() + "\n");
fs.unlinkSync(file + ".raw");
' "${FIXTURE}"

echo "✔ wrote ${FIXTURE} ($(wc -c < "${FIXTURE}") bytes) from ${KB_IMAGE}"
