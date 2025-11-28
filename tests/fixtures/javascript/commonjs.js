const fs = require('fs');
exports.read = function read(file) {
  return fs.readFileSync(file, 'utf-8');
};
module.exports = exports;
