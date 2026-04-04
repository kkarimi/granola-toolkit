import { describe, expect, test } from "vite-plus/test";

import { generatedModule } from "../scripts/build-web-client.mjs";

describe("web bundle generation", () => {
  test("preserves template literals in browser assets", () => {
    const js = "const message = `Hello ${name}`;\nconsole.log(message);\n";
    const css = ".shell { display: grid; }\n";

    const generated = generatedModule({ css, js });

    expect(generated).not.toContain("String.raw");
    expect(generated).toContain(JSON.stringify(js));
    expect(generated).toContain(JSON.stringify(css));
  });
});
