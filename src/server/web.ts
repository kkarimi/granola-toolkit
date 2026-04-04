import { granolaWebAssetPaths } from "../web/assets.ts";

export function renderGranolaWebPage(options: { serverPasswordRequired?: boolean } = {}): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Granola Toolkit</title>
    <link rel="stylesheet" href="${granolaWebAssetPaths.stylesheet}" />
  </head>
  <body>
    <div id="granola-web-root"></div>
    <script>
window.__GRANOLA_SERVER__ = ${JSON.stringify({
    passwordRequired: options.serverPasswordRequired ?? false,
  })};
    </script>
    <script type="module" src="${granolaWebAssetPaths.script}"></script>
  </body>
</html>`;
}
