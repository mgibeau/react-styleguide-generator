var fs = require('fs');
var path = require('path');
var browserify = require('browserify');
var babelify = require("babelify");
var mkdirp = require('mkdirp');
var Mustache = require('Mustache');
var ncp = require('ncp');

var TEMPLATE = path.resolve(__dirname, './fixtures/index.html.mustache');

var SRC = [
  path.resolve(__dirname, '../dist/sg.css'),
  path.resolve(__dirname, '../dist/sg.js')
];

/**
 * @param {object} opts
 * @returns {promise}
 */
function html(opts) {
  var data = {
    title: opts.title,
    cssFils: opts.files && opts.files.filter(function(file) { return path.extname(file) === '.css'; }),
    jsFils: opts.files && opts.files.filter(function(file) { return path.extname(file) === '.js'; }),
    basePath: opts.basePath,
    hashbang: opts.pushState ? 'false' : 'true'
  };

  var rendered = Mustache.render(fs.readFileSync(TEMPLATE, 'utf-8'), data);
  var output = opts.output + '/index.html';

  return new Promise(function(resolve, reject) {
    fs.writeFile(output, rendered, function(err) {
      if (err) { return reject(err); }
      resolve();
    });
  });
}

/**
 * @param {object} opts
 * @returns {promise}
 */
function contentsBundle(opts) {
  var output = opts.output + '/src/contents-bundle.js';

  return new Promise(function(resolve, reject) {
    var Contents = opts.input.map(function(file) {
      return 'require(\'' + file + '\')';
    });

    Contents = 'module.exports = [' + Contents.join(',') + ']';

    fs.writeFileSync(output, Contents);

    browserify(output, { standalone: 'Contents', debug: true })
      .transform(babelify.configure({ stage: 0 }))
      .bundle(function(err, buffer) {
        if (err) { return reject(err); }

        fs.writeFileSync(output, buffer);
        resolve();
      });
  });
}

/**
 * @param {Object} opts
 * @param {glob|string[]} opts.input
 * @param {string=} opts.output
 * @param {string=} opts.title
 * @param {boolean=} opts.pushState
 * @param {string[]=} opts.files
 */
function RSG (opts) {
  opts.input = typeof opts.input === 'string' ? require('glob').sync(opts.input, { realpath: true }) : opts.input;
  opts.output = path.resolve(process.cwd(), opts.output ? opts.output.replace(/\/+$/, '') : 'styleguide');
  opts.title = opts.title || 'Style Guide';
  opts.basePath = opts.basePath ? path.normalize('/' + (opts.basePath.replace(/\/+$/, ''))) : null;
  opts.pushState = !!opts.pushState;
  opts.files = opts.files || null;
  this.opts = opts;
}

/**
 * @param {string[]} input
 * @param {string=} output
 * @returns {promise}
 */
RSG.prototype.copy = function(input, output) {
  output = output ? path.normalize(this.opts.output + '/' + output) : this.opts.output;

  return Promise
    .all(input
      .filter(function(file) {
        return fs.existsSync(file);
      })
      .map(function(file) {
        return new Promise(function(resolve, reject) {
          ncp(file, output + '/' + path.basename(file), function(err) {
            if (err) { return reject(err); }
            resolve();
          });
        });
      })
    );
};

/**
 * @param {Function=} callback
 * @returns {promise}
 */
RSG.prototype.generate = function(callback) {
  callback = callback.bind(this) || function() {};

  mkdirp.sync(this.opts.output + '/src');

  return Promise
    .all([
      this.copy(SRC, 'src'),
      this.copy(this.opts.files),
      html(this.opts),
      contentsBundle(this.opts)
    ])
    .then(function() { callback(); })
    .catch(callback);
};

module.exports = function(opts) {
  return new RSG(opts);
};