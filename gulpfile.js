var path = require('path'),
    ymb = require('ymb'),
    plg = ymb.plugins,
    // You can require your own `gulp` version.
    gulp = ymb.gulp;

var cfg = ymb.resolveBuildConfig();

gulp.task('ym-clean', function (cb) {
    ymb.del(path.resolve(cfg.dest), { force: true }, cb);
});

gulp.task('ym-rebuild', function () {
    var async = cfg.store == 'async',
        standalone = cfg.target == 'standalone',
        chain = [],
        js, json, shaders, modules;

    js = gulp.src(cfg.src.js);

    json = gulp.src(cfg.src.json).pipe(require('./tools/build/json')());

    shaders = gulp.src(cfg.src.glsl).pipe(require('./tools/build/shaders')());

    modules = ymb.es.merge(js, json, shaders);

    chain.push(plg.modules.setup(cfg));
    chain.push(plg.modules.ym(cfg));

    if (standalone) {
        chain.push(plg.modules.plus(cfg));
        chain.push(plg.modules.helpers(cfg));
        if (async) {
            chain.push(plg.modules.map(cfg));
            chain.push(plg.modules.async(cfg));
        }
        chain.push(plg.modules.namespace(cfg));
    } else {
        if (async) {
            chain.push(plg.modules.map(cfg));
            chain.push(plg.modules.async(cfg));
        }
    }

    chain.push(require('./tools/build/debug')());
    chain.push(plg.modules.init(cfg));
    chain.push(plg.modules.store(cfg));

    if (cfg.minify) {
        chain.push(plg.modules.minify(cfg));
    }

    return modules
        .pipe(plg.util.pipeChain(chain))
        .pipe(gulp.dest(path.resolve(cfg.dest)));
});

gulp.task('ym-build', ['ym-clean', 'ym-rebuild']);

gulp.task('ym-watch', ['ym-build'], function () {
    var watcher = gulp.watch([cfg.src.js, cfg.src.css, cfg.src.templates], ['ym-rebuild']);

    watcher.on('change', function (e) {
        if (e.type == 'deleted') {
            plg.remember.forget('ymb#default', e.path);
        }
    });

    return watcher;
});
