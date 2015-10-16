var path = require('path'),
    PluginError = require('gulp-util').PluginError,
    eachInStream = require('ymb').plugins.util.eachInStream;

module.exports = toModulesPlugin;

var PLUGIN_NAME = 'json-to-modules';

/**
 * Converts GLSL files to `ym` modules.
 * @alias "shaders.toModules"
 * @returns {stream.Transform} Stream
 */
function toModulesPlugin () {
    return eachInStream(function (file, encoding, cb) {
        var content = file.contents.toString(),
            moduleName = path.relative(file.base,file.path).split('/').join('.');

        file.contents = new Buffer(
            'ym.modules.define(\'' + moduleName + '\',[],function (provide) {\n' +
                'provide(' + content + ');\n' +
            '});'
        );

        file.path = path.join(file.base, moduleName + '.js');
        cb(null, file);
    }, PLUGIN_NAME);
}
