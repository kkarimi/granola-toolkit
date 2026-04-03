import { granolaWebClientScript } from "../web/client-script.ts";
import { granolaWebMarkup } from "../web/markup.ts";
import { granolaWebStyles } from "../web/styles.ts";

export function renderGranolaWebPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Granola Toolkit</title>
    <style>
${granolaWebStyles}
    </style>
  </head>
  <body>
${granolaWebMarkup}
    <script type="module">
${granolaWebClientScript}
    </script>
  </body>
</html>`;
}
