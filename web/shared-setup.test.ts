import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Guards the wiring that lets web/ use ../shared (shared/README.md). Each of these breaks in a confusing
// way when it drifts: a build that works on a laptop and fails in CI, or two apps on different versions.
const web = path.dirname(fileURLToPath(import.meta.url));
const json = (file: string) => JSON.parse(readFileSync(path.join(web, file), "utf8"));

const sharedPackages: string[] = json("../shared/packages.json");
const mobile = { manifest: json("../package.json"), lock: json("../package-lock.json") };
const self = { manifest: json("package.json"), lock: json("npm-shrinkwrap.json") };

describe("packages that shared/ may import", () => {
  it.each(sharedPackages)("%s is a dependency of both apps, at the same version", (name) => {
    expect(self.manifest.dependencies[name], "missing from web/package.json").toBeDefined();
    expect(self.manifest.dependencies[name]).toBe(mobile.manifest.dependencies[name]);
    expect(self.lock.packages[`node_modules/${name}`].version).toBe(
      mobile.lock.packages[`node_modules/${name}`].version,
    );
  });

  it.each(sharedPackages)("%s resolves to web/node_modules when type-checking", (name) => {
    // tsconfig.json has comments, so match the line instead of parsing it.
    const tsconfig = readFileSync(path.join(web, "tsconfig.json"), "utf8");
    expect(tsconfig).toContain(`"${name}": ["./node_modules/${name}"]`);
  });
});

describe("lockfile name", () => {
  it("is npm-shrinkwrap.json, not package-lock.json", () => {
    // OpenNext takes the first folder with a package-lock.json as the project root. With one in web/,
    // it cannot follow imports into ../shared and the Worker build fails.
    expect(existsSync(path.join(web, "npm-shrinkwrap.json"))).toBe(true);
    expect(existsSync(path.join(web, "package-lock.json")), "delete it and run `npm install` again").toBe(false);
  });
});
