#!/usr/bin/env node
const { createServer } = require('http');
const { extname, normalize, join, dirname, basename, relative, sep } = require("path");
const { statSync, readFileSync, existsSync, readdirSync } = require('fs');
const mimes = require("./mimes.json");

const cwd = process.cwd();

const flags = {
  defaultExtension: { flags: ["--default-extension", "-e"], default: ".js" },
  entriesOrder: { flags: ["--entries-order", "-o"], default: "es2015,module,main" },
  port: { flags: ["--port", "-p"], default: "8080" }
}

const { defaultExtension, entriesOrder, port } = Object.fromEntries(Object
  .entries(flags)
  .map(([name, { flags, default: def }]) => [
    name,
    process.argv.find((_, i, args) => flags.includes(args[ i - 1 ])) || def
  ])
);

function getRelativePath(absoluteUrl) {
  const ext = extname(absoluteUrl);
  const root = normalize(cwd);
  const requestedPath = join(root, absoluteUrl);
  const path =
    // if url has a file extension, send a requestedPath without a change
    ext ? requestedPath :
      // else if there is a file with additional default extension, send it
      existsSync(requestedPath + defaultExtension) ? requestedPath + defaultExtension :
        // else if requested path exists and is a directory, append /index.js and send it
        existsSync(requestedPath) && statSync(requestedPath).isDirectory() ? join(requestedPath, "index.js") :
          // else send the input
          null;
  return { path: path && relative(cwd, path).replace(/\\/g, "/"), ext: extname(path || "") };
}

function resolveNPMPath(bms) {
  return require.resolve(bms, { paths: [join(cwd, "node_modules"), ...require.resolve.paths(bms)] });
}

function findPath(bms) {
  const dir = dirname(normalize(relative(cwd, resolveNPMPath(bms)))).split(sep);

  while (dir.length > 0) {
    if (readdirSync(dir.join(sep)).includes("package.json")) {
      break;
    }
    dir.pop();
  }

  if (dir.length === 0) {
    throw new Error("path not found");
  }

  // @todo use case when no entry point is declared in package.json
  const packageJson = require(join(process.cwd(), ...dir, "package.json"));
  const entryPoint = entriesOrder.split(",").reduce((entry, field) => entry || packageJson[ field ], "");
  return getRelativePath([normalize([...dir, dirname(entryPoint)].join("/")).replace(/\\/g, "/"), bms === packageJson.name ? basename(entryPoint) : bms.split("/").splice(1).join("/")].join("/"));
}

module.exports = createServer((req, res) => {
  const absoluteUrl = req.url === "/" ? "index.html" : req.url;
  const { ext, path } = getRelativePath(absoluteUrl);
  try {
    const fileContent = readFileSync(path)
      .toString()
      .replace(/^import (.*? from )?(?<quote>['"])([^/.].*?)\k<quote>;?/gm, (
        found,
        imports,
        q,
        module
      ) => {
        let relativePath;
        try {
          relativePath = findPath(module).path || relative(cwd, resolveNPMPath(module)).split(/[/\\]/).join("/");
        } catch (e) {
          relativePath = `/node_modules/${module}`;
        }
        return `import ${imports || ""}${q}/${relativePath}${q};`;
      });
    res.writeHead(200, {
      'Content-Type': mimes[ ext || defaultExtension ],
      'Content-Length': fileContent.length
    });
    res.end(fileContent);
  } catch (e) {
    res.writeHead(e.code === "ENOENT" ? 404 : 500);
    res.end(e.message);
  }
}).listen(port);

console.log(`Serving content from ${cwd} on port ${port}`);
