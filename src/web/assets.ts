import { granolaWebClientCss, granolaWebClientJs } from "./generated.ts";

export const granolaWebAssetPaths = {
  script: "/assets/granola-web-client.js",
  stylesheet: "/assets/granola-web-client.css",
} as const;

export interface GranolaWebAsset {
  body: string;
  contentType: string;
}

export function granolaWebAssetForPath(path: string): GranolaWebAsset | undefined {
  switch (path) {
    case granolaWebAssetPaths.script:
      return {
        body: granolaWebClientJs,
        contentType: "text/javascript; charset=utf-8",
      };
    case granolaWebAssetPaths.stylesheet:
      return {
        body: granolaWebClientCss,
        contentType: "text/css; charset=utf-8",
      };
    default:
      return undefined;
  }
}
