const { expect } = require('chai');
const { get } = require("http");
const { join } = require("path");

process.chdir(join(__dirname, "mocks"));

const server = require("../index");
server.close();

function ajax(url) {
  return new Promise((resolve, reject) => {
    const request = get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        request.end();
        resolve(data);
      });
    });
    request.on('error', reject);
  });
}

describe('serving', () => {
  before(() => server.listen(8080));
  after(() => server.close());

  it('should serve files outside node_modules', () =>
    ajax("http://localhost:8080/sample.html")
      .then((res) => expect(res).to.include('<title>Sample HTML</title>'))
  );
  it('should serve index.html when accessing root', () =>
    ajax("http://localhost:8080")
      .then((res) => expect(res).to.include('<title>Index HTML</title>'))
  );
  it('should serve .js file if it exists and no extension is provided', () =>
    ajax("http://localhost:8080/node_modules/a/file")
      .then((res) => expect(res).to.include('// file.js'))
  );
  it('should serve index.js file if requested path is a directory', () =>
    ajax("http://localhost:8080/node_modules/a/dir")
      .then((res) => expect(res).to.include('// index.js'))
  );
  it('should ignore query string', () =>
    ajax("http://localhost:8080/sample.html?query=string")
      .then((res) => expect(res).to.include('<title>Sample HTML</title>')));
});

describe('imports rewriting', () => {
  before(() => server.listen(8080));
  after(() => server.close());

  it('should resolve each BMS import to a full file path', () =>
    ajax("http://localhost:8080/imports.js")
      .then((res) => expect(res).to.include([
        'import "/node_modules/a/file.js";',
        'import "/node_modules/a/dir/index.js";'
      ].join("\n")))
  );

  it('should preserve imported items', () =>
    ajax("http://localhost:8080/imports2.js")
      .then((res) => expect(res).to.include([
        'import "/node_modules/a/file.js";',
        'import defaultExport from "/node_modules/a/file.js";',
        'import * as name from "/node_modules/a/file.js";',
        'import { export1 } from "/node_modules/a/file.js";',
        'import { export1 as alias1 } from "/node_modules/a/file.js";',
        'import { export1 , export2 } from "/node_modules/a/file.js";',
        'import { export1 , export2 as alias2 } from "/node_modules/a/file.js";',
        'import defaultExport, { export1 } from "/node_modules/a/file.js";',
        'import defaultExport, * as name from "/node_modules/a/file.js";'
      ].join("\n")))
  );
});
