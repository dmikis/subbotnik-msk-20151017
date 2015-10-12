var file = require('gulp-file');
function envPlugin () {
    return file('init#env', 'ym.env.debug = true;');
}
module.exports = envPlugin;
