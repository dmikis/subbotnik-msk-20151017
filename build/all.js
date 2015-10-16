(function (global){


var ym = {
	"project": {
		"preload": [],
		"namespace": "ym",
		"jsonpPrefix": "",
		"loadLimit": 500
	},
	"ns": {},
	"env": {},
	"envCallbacks": []
};

var _backup_modules = this['modules'];
/**
 * Modules
 *
 * Copyright (c) 2013 Filatov Dmitry (dfilatov@yandex-team.ru)
 * Dual licensed under the MIT and GPL licenses:
 * http://www.opensource.org/licenses/mit-license.php
 * http://www.gnu.org/licenses/gpl.html
 *
 * @version 0.1.0
 */

(function(global) {

var undef,

    DECL_STATES = {
        NOT_RESOLVED : 'NOT_RESOLVED',
        IN_RESOLVING : 'IN_RESOLVING',
        RESOLVED     : 'RESOLVED'
    },

    /**
     * Creates a new instance of modular system
     * @returns {Object}
     */
    create = function() {
        var curOptions = {
                trackCircularDependencies : true,
                allowMultipleDeclarations : true
            },

            modulesStorage = {},
            waitForNextTick = false,
            pendingRequires = [],

            /**
             * Defines module
             * @param {String} name
             * @param {String[]} [deps]
             * @param {Function} declFn
             */
            define = function(name, deps, declFn) {
                if(!declFn) {
                    declFn = deps;
                    deps = [];
                }

                var module = modulesStorage[name];
                if(!module) {
                    module = modulesStorage[name] = {
                        name : name,
                        decl : undef
                    };
                }

                module.decl = {
                    name       : name,
                    prev       : module.decl,
                    fn         : declFn,
                    state      : DECL_STATES.NOT_RESOLVED,
                    deps       : deps,
                    dependents : [],
                    exports    : undef
                };
            },

            /**
             * Requires modules
             * @param {String|String[]} modules
             * @param {Function} cb
             * @param {Function} [errorCb]
             */
            require = function(modules, cb, errorCb) {
                if(typeof modules === 'string') {
                    modules = [modules];
                }

                if(!waitForNextTick) {
                    waitForNextTick = true;
                    nextTick(onNextTick);
                }

                pendingRequires.push({
                    deps : modules,
                    cb   : function(exports, error) {
                        error?
                            (errorCb || onError)(error) :
                            cb.apply(global, exports);
                    }
                });
            },

            /**
             * Returns state of module
             * @param {String} name
             * @returns {String} state, possible values are NOT_DEFINED, NOT_RESOLVED, IN_RESOLVING, RESOLVED
             */
            getState = function(name) {
                var module = modulesStorage[name];
                return module?
                    DECL_STATES[module.decl.state] :
                    'NOT_DEFINED';
            },

            /**
             * Returns dependencies of module
             * @param {String} name
             * @returns {String[]|null}
             */
            getDependencies = function (name) {
                var module = modulesStorage[name];
                return module ? module.decl.deps : null;
            },

            /**
             * Returns whether the module is defined
             * @param {String} name
             * @returns {Boolean}
             */
            isDefined = function(name) {
                return !!modulesStorage[name];
            },

            /**
             * Sets options
             * @param {Object} options
             */
            setOptions = function(options) {
                for(var name in options) {
                    if(options.hasOwnProperty(name)) {
                        curOptions[name] = options[name];
                    }
                }
            },

            onNextTick = function() {
                waitForNextTick = false;
                applyRequires();
            },

            applyRequires = function() {
                var requiresToProcess = pendingRequires,
                    i = 0, require;

                pendingRequires = [];

                while(require = requiresToProcess[i++]) {
                    requireDeps(null, require.deps, [], require.cb);
                }
            },

            requireDeps = function(fromDecl, deps, path, cb) {
                var unresolvedDepsCnt = deps.length;
                if(!unresolvedDepsCnt) {
                    cb([]);
                }

                var decls = [],
                    onDeclResolved = function(_, error) {
                        if(error) {
                            cb(null, error);
                            return;
                        }

                        if(!--unresolvedDepsCnt) {
                            var exports = [],
                                i = 0, decl;
                            while(decl = decls[i++]) {
                                exports.push(decl.exports);
                            }
                            cb(exports);
                        }
                    },
                    i = 0, len = unresolvedDepsCnt,
                    dep, decl;

                while(i < len) {
                    dep = deps[i++];
                    if(typeof dep === 'string') {
                        if(!modulesStorage[dep]) {
                            cb(null, buildModuleNotFoundError(dep, fromDecl));
                            return;
                        }

                        decl = modulesStorage[dep].decl;
                    }
                    else {
                        decl = dep;
                    }

                    decls.push(decl);

                    startDeclResolving(decl, path, onDeclResolved);
                }
            },

            startDeclResolving = function(decl, path, cb) {
                if(decl.state === DECL_STATES.RESOLVED) {
                    cb(decl.exports);
                    return;
                }
                else if(decl.state === DECL_STATES.IN_RESOLVING) {
                    curOptions.trackCircularDependencies && isDependenceCircular(decl, path)?
                        cb(null, buildCircularDependenceError(decl, path)) :
                        decl.dependents.push(cb);
                    return;
                }

                decl.dependents.push(cb);

                if(decl.prev && !curOptions.allowMultipleDeclarations) {
                    provideError(decl, buildMultipleDeclarationError(decl));
                    return;
                }

                curOptions.trackCircularDependencies && (path = path.slice()).push(decl);

                var isProvided = false,
                    deps = decl.prev? decl.deps.concat([decl.prev]) : decl.deps;

                decl.state = DECL_STATES.IN_RESOLVING;
                requireDeps(
                    decl,
                    deps,
                    path,
                    function(depDeclsExports, error) {
                        if(error) {
                            provideError(decl, error);
                            return;
                        }

                        depDeclsExports.unshift(function(exports, error) {
                            if(isProvided) {
                                cb(null, buildDeclAreadyProvidedError(decl));
                                return;
                            }

                            isProvided = true;
                            error?
                                provideError(decl, error) :
                                provideDecl(decl, exports);
                        });

                        decl.fn.apply(
                            {
                                name   : decl.name,
                                deps   : decl.deps,
                                global : global
                            },
                            depDeclsExports);
                    });
            },

            provideDecl = function(decl, exports) {
                decl.exports = exports;
                decl.state = DECL_STATES.RESOLVED;

                var i = 0, dependent;
                while(dependent = decl.dependents[i++]) {
                    dependent(exports);
                }

                decl.dependents = undef;
            },

            provideError = function(decl, error) {
                decl.state = DECL_STATES.NOT_RESOLVED;

                var i = 0, dependent;
                while(dependent = decl.dependents[i++]) {
                    dependent(null, error);
                }

                decl.dependents = [];
            };

        return {
            create          : create,
            define          : define,
            require         : require,
            getState        : getState,
            getDependencies : getDependencies,
            isDefined       : isDefined,
            setOptions      : setOptions,
            flush           : onNextTick
        };
    },

    onError = function(e) {
        nextTick(function() {
            throw e;
        });
    },

    buildModuleNotFoundError = function(name, decl) {
        return Error(decl?
            'Module "' + decl.name + '": can\'t resolve dependence "' + name + '"' :
            'Required module "' + name + '" can\'t be resolved');
    },

    buildCircularDependenceError = function(decl, path) {
        var strPath = [],
            i = 0, pathDecl;
        while(pathDecl = path[i++]) {
            strPath.push(pathDecl.name);
        }
        strPath.push(decl.name);

        return Error('Circular dependence has been detected: "' + strPath.join(' -> ') + '"');
    },

    buildDeclAreadyProvidedError = function(decl) {
        return Error('Declaration of module "' + decl.name + '" has already been provided');
    },

    buildMultipleDeclarationError = function(decl) {
        return Error('Multiple declarations of module "' + decl.name + '" have been detected');
    },

    isDependenceCircular = function(decl, path) {
        var i = 0, pathDecl;
        while(pathDecl = path[i++]) {
            if(decl === pathDecl) {
                return true;
            }
        }
        return false;
    },

    nextTick = (function() {
        var fns = [],
            enqueueFn = function(fn) {
                return fns.push(fn) === 1;
            },
            callFns = function() {
                var fnsToCall = fns, i = 0, len = fns.length;
                fns = [];
                while(i < len) {
                    fnsToCall[i++]();
                }
            };

        if(typeof process === 'object' && process.nextTick) { // nodejs
            return function(fn) {
                enqueueFn(fn) && process.nextTick(callFns);
            };
        }

        if(global.setImmediate) { // ie10
            return function(fn) {
                enqueueFn(fn) && global.setImmediate(callFns);
            };
        }

        if(global.postMessage && !global.opera) { // modern browsers
            var isPostMessageAsync = true;
            if(global.attachEvent) {
                var checkAsync = function() {
                        isPostMessageAsync = false;
                    };
                global.attachEvent('onmessage', checkAsync);
                global.postMessage('__checkAsync', '*');
                global.detachEvent('onmessage', checkAsync);
            }

            if(isPostMessageAsync) {
                var msg = '__modules' + (+new Date()),
                    onMessage = function(e) {
                        if(e.data === msg) {
                            e.stopPropagation && e.stopPropagation();
                            callFns();
                        }
                    };

                global.addEventListener?
                    global.addEventListener('message', onMessage, true) :
                    global.attachEvent('onmessage', onMessage);

                return function(fn) {
                    enqueueFn(fn) && global.postMessage(msg, '*');
                };
            }
        }

        var doc = global.document;
        if('onreadystatechange' in doc.createElement('script')) { // ie6-ie8
            var head = doc.getElementsByTagName('head')[0],
                createScript = function() {
                    var script = doc.createElement('script');
                    script.onreadystatechange = function() {
                        script.parentNode.removeChild(script);
                        script = script.onreadystatechange = null;
                        callFns();
                    };
                    head.appendChild(script);
                };

            return function(fn) {
                enqueueFn(fn) && createScript();
            };
        }

        return function(fn) { // old browsers
            enqueueFn(fn) && setTimeout(callFns, 0);
        };
    })();

if(typeof exports === 'object') {
    module.exports = create();
}
else {
    global.modules = create();
}

})(this);

ym['modules'] = this['modules'];
this['modules'] = _backup_modules;
_backup_modules = undefined;ym.modules.setOptions({
   trackCircularDependencies: true,
   allowMultipleDeclarations: false
});
ym.ns.modules = ym.modules;

var _backup_vow = this['vow'];
/**
 * @module vow
 * @author Filatov Dmitry <dfilatov@yandex-team.ru>
 * @version 0.4.7
 * @license
 * Dual licensed under the MIT and GPL licenses:
 *   * http://www.opensource.org/licenses/mit-license.php
 *   * http://www.gnu.org/licenses/gpl.html
 */

(function(global) {

var undef,
    nextTick = (function() {
        var fns = [],
            enqueueFn = function(fn) {
                return fns.push(fn) === 1;
            },
            callFns = function() {
                var fnsToCall = fns, i = 0, len = fns.length;
                fns = [];
                while(i < len) {
                    fnsToCall[i++]();
                }
            };

        if(typeof setImmediate === 'function') { // ie10, nodejs >= 0.10
            return function(fn) {
                enqueueFn(fn) && setImmediate(callFns);
            };
        }

        if(typeof process === 'object' && process.nextTick) { // nodejs < 0.10
            return function(fn) {
                enqueueFn(fn) && process.nextTick(callFns);
            };
        }

        if(global.postMessage) { // modern browsers
            var isPostMessageAsync = true;
            if(global.attachEvent) {
                var checkAsync = function() {
                        isPostMessageAsync = false;
                    };
                global.attachEvent('onmessage', checkAsync);
                global.postMessage('__checkAsync', '*');
                global.detachEvent('onmessage', checkAsync);
            }

            if(isPostMessageAsync) {
                var msg = '__promise' + +new Date,
                    onMessage = function(e) {
                        if(e.data === msg) {
                            e.stopPropagation && e.stopPropagation();
                            callFns();
                        }
                    };

                global.addEventListener?
                    global.addEventListener('message', onMessage, true) :
                    global.attachEvent('onmessage', onMessage);

                return function(fn) {
                    enqueueFn(fn) && global.postMessage(msg, '*');
                };
            }
        }

        var doc = global.document;
        if('onreadystatechange' in doc.createElement('script')) { // ie6-ie8
            var createScript = function() {
                    var script = doc.createElement('script');
                    script.onreadystatechange = function() {
                        script.parentNode.removeChild(script);
                        script = script.onreadystatechange = null;
                        callFns();
                };
                (doc.documentElement || doc.body).appendChild(script);
            };

            return function(fn) {
                enqueueFn(fn) && createScript();
            };
        }

        return function(fn) { // old browsers
            enqueueFn(fn) && setTimeout(callFns, 0);
        };
    })(),
    safeExec = function(func, onError, ctx) {
        if (vow.debug) {
            ctx ? func.call(ctx) : func();
        } else {
            try {
                ctx ? func.call(ctx) : func();
            } catch (e) {
                ctx ? onError.call(ctx, e) : onError(e);
                return false;
            }
        }

        return true;
    },
    throwException = function(e) {
        nextTick(function() {
            throw e;
        });
    },
    isFunction = function(obj) {
        return typeof obj === 'function';
    },
    isObject = function(obj) {
        return obj !== null && typeof obj === 'object';
    },
    toStr = Object.prototype.toString,
    isArray = Array.isArray || function(obj) {
        return toStr.call(obj) === '[object Array]';
    },
    getArrayKeys = function(arr) {
        var res = [],
            i = 0, len = arr.length;
        while(i < len) {
            res.push(i++);
        }
        return res;
    },
    getObjectKeys = Object.keys || function(obj) {
        var res = [];
        for(var i in obj) {
            obj.hasOwnProperty(i) && res.push(i);
        }
        return res;
    },
    defineCustomErrorType = function(name) {
        var res = function(message) {
            this.name = name;
            this.message = message;
        };

        res.prototype = new Error();

        return res;
    },
    wrapOnFulfilled = function(onFulfilled, idx) {
        return function(val) {
            onFulfilled.call(this, val, idx);
        };
    };

/**
 * @class Deferred
 * @exports vow:Deferred
 * @description
 * The `Deferred` class is used to encapsulate newly-created promise object along with functions that resolve, reject or notify it.
 */

/**
 * @constructor
 * @description
 * You can use `vow.defer()` instead of using this constructor.
 *
 * `new vow.Deferred()` gives the same result as `vow.defer()`.
 */
var Deferred = function() {
    this._promise = new Promise();
};

Deferred.prototype = /** @lends Deferred.prototype */{
    /**
     * Returns corresponding promise.
     *
     * @returns {vow:Promise}
     */
    promise : function() {
        return this._promise;
    },

    /**
     * Resolves corresponding promise with given `value`.
     *
     * @param {*} value
     *
     * @example
     * ```js
     * var defer = vow.defer(),
     *     promise = defer.promise();
     *
     * promise.then(function(value) {
     *     // value is "'success'" here
     * });
     *
     * defer.resolve('success');
     * ```
     */
    resolve : function(value) {
        this._promise.isResolved() || this._promise._resolve(value);
    },

    /**
     * Rejects corresponding promise with given `reason`.
     *
     * @param {*} reason
     *
     * @example
     * ```js
     * var defer = vow.defer(),
     *     promise = defer.promise();
     *
     * promise.fail(function(reason) {
     *     // reason is "'something is wrong'" here
     * });
     *
     * defer.reject('something is wrong');
     * ```
     */
    reject : function(reason) {
        if(this._promise.isResolved()) {
            return;
        }

        if(vow.isPromise(reason)) {
            reason = reason.then(function(val) {
                var defer = vow.defer();
                defer.reject(val);
                return defer.promise();
            });
            this._promise._resolve(reason);
        }
        else {
            this._promise._reject(reason);
        }
    },

    /**
     * Notifies corresponding promise with given `value`.
     *
     * @param {*} value
     *
     * @example
     * ```js
     * var defer = vow.defer(),
     *     promise = defer.promise();
     *
     * promise.progress(function(value) {
     *     // value is "'20%'", "'40%'" here
     * });
     *
     * defer.notify('20%');
     * defer.notify('40%');
     * ```
     */
    notify : function(value) {
        this._promise.isResolved() || this._promise._notify(value);
    }
};

var PROMISE_STATUS = {
    PENDING   : 0,
    RESOLVED  : 1,
    FULFILLED : 2,
    REJECTED  : 3
};

/**
 * @class Promise
 * @exports vow:Promise
 * @description
 * The `Promise` class is used when you want to give to the caller something to subscribe to,
 * but not the ability to resolve or reject the deferred.
 */

/**
 * @constructor
 * @param {Function} resolver See https://github.com/domenic/promises-unwrapping/blob/master/README.md#the-promise-constructor for details.
 * @description
 * You should use this constructor directly only if you are going to use `vow` as DOM Promises implementation.
 * In other case you should use `vow.defer()` and `defer.promise()` methods.
 * @example
 * ```js
 * function fetchJSON(url) {
 *     return new vow.Promise(function(resolve, reject, notify) {
 *         var xhr = new XMLHttpRequest();
 *         xhr.open('GET', url);
 *         xhr.responseType = 'json';
 *         xhr.send();
 *         xhr.onload = function() {
 *             if(xhr.response) {
 *                 resolve(xhr.response);
 *             }
 *             else {
 *                 reject(new TypeError());
 *             }
 *         };
 *     });
 * }
 * ```
 */
var Promise = function(resolver) {
    this._value = undef;
    this._status = PROMISE_STATUS.PENDING;

    this._fulfilledCallbacks = [];
    this._rejectedCallbacks = [];
    this._progressCallbacks = [];

    if(resolver) { // NOTE: see https://github.com/domenic/promises-unwrapping/blob/master/README.md
        var _this = this,
            resolverFnLen = resolver.length;

        resolver(
            function(val) {
                _this.isResolved() || _this._resolve(val);
            },
            resolverFnLen > 1?
                function(reason) {
                    _this.isResolved() || _this._reject(reason);
                } :
                undef,
            resolverFnLen > 2?
                function(val) {
                    _this.isResolved() || _this._notify(val);
                } :
                undef);
    }
};

Promise.prototype = /** @lends Promise.prototype */ {
    /**
     * Returns value of fulfilled promise or reason in case of rejection.
     *
     * @returns {*}
     */
    valueOf : function() {
        return this._value;
    },

    /**
     * Returns `true` if promise is resolved.
     *
     * @returns {Boolean}
     */
    isResolved : function() {
        return this._status !== PROMISE_STATUS.PENDING;
    },

    /**
     * Returns `true` if promise is fulfilled.
     *
     * @returns {Boolean}
     */
    isFulfilled : function() {
        return this._status === PROMISE_STATUS.FULFILLED;
    },

    /**
     * Returns `true` if promise is rejected.
     *
     * @returns {Boolean}
     */
    isRejected : function() {
        return this._status === PROMISE_STATUS.REJECTED;
    },

    /**
     * Adds reactions to promise.
     *
     * @param {Function} [onFulfilled] Callback that will to be invoked with the value after promise has been fulfilled
     * @param {Function} [onRejected] Callback that will to be invoked with the reason after promise has been rejected
     * @param {Function} [onProgress] Callback that will to be invoked with the value after promise has been notified
     * @param {Object} [ctx] Context of callbacks execution
     * @returns {vow:Promise} A new promise, see https://github.com/promises-aplus/promises-spec for details
     */
    then : function(onFulfilled, onRejected, onProgress, ctx) {
        var defer = new Deferred();
        this._addCallbacks(defer, onFulfilled, onRejected, onProgress, ctx);
        return defer.promise();
    },

    /**
     * Adds rejection reaction only. It is shortcut for `promise.then(undefined, onRejected)`.
     *
     * @param {Function} onRejected Callback to be called with the value after promise has been rejected
     * @param {Object} [ctx] Context of callback execution
     * @returns {vow:Promise}
     */
    'catch' : function(onRejected, ctx) {
        return this.then(undef, onRejected, ctx);
    },

    /**
     * Adds rejection reaction only. It is shortcut for `promise.then(null, onRejected)`. It's alias for `catch`.
     *
     * @param {Function} onRejected Callback to be called with the value after promise has been rejected
     * @param {Object} [ctx] Context of callback execution
     * @returns {vow:Promise}
     */
    fail : function(onRejected, ctx) {
        return this.then(undef, onRejected, ctx);
    },

    /**
     * Adds resolving reaction (to fulfillment and rejection both).
     *
     * @param {Function} onResolved Callback that to be called with the value after promise has been rejected
     * @param {Object} [ctx] Context of callback execution
     * @returns {vow:Promise}
     */
    always : function(onResolved, ctx) {
        var _this = this,
            cb = function() {
                return onResolved.call(this, _this);
            };

        return this.then(cb, cb, ctx);
    },

    /**
     * Adds progress reaction.
     *
     * @param {Function} onProgress Callback to be called with the value when promise has been notified
     * @param {Object} [ctx] Context of callback execution
     * @returns {vow:Promise}
     */
    progress : function(onProgress, ctx) {
        return this.then(undef, undef, onProgress, ctx);
    },

    /**
     * Like `promise.then`, but "spreads" the array into a variadic value handler.
     * It is useful with `vow.all` and `vow.allResolved` methods.
     *
     * @param {Function} [onFulfilled] Callback that will to be invoked with the value after promise has been fulfilled
     * @param {Function} [onRejected] Callback that will to be invoked with the reason after promise has been rejected
     * @param {Object} [ctx] Context of callbacks execution
     * @returns {vow:Promise}
     *
     * @example
     * ```js
     * var defer1 = vow.defer(),
     *     defer2 = vow.defer();
     *
     * vow.all([defer1.promise(), defer2.promise()]).spread(function(arg1, arg2) {
     *     // arg1 is "1", arg2 is "'two'" here
     * });
     *
     * defer1.resolve(1);
     * defer2.resolve('two');
     * ```
     */
    spread : function(onFulfilled, onRejected, ctx) {
        return this.then(
            function(val) {
                return onFulfilled.apply(this, val);
            },
            onRejected,
            ctx);
    },

    /**
     * Like `then`, but terminates a chain of promises.
     * If the promise has been rejected, throws it as an exception in a future turn of the event loop.
     *
     * @param {Function} [onFulfilled] Callback that will to be invoked with the value after promise has been fulfilled
     * @param {Function} [onRejected] Callback that will to be invoked with the reason after promise has been rejected
     * @param {Function} [onProgress] Callback that will to be invoked with the value after promise has been notified
     * @param {Object} [ctx] Context of callbacks execution
     *
     * @example
     * ```js
     * var defer = vow.defer();
     * defer.reject(Error('Internal error'));
     * defer.promise().done(); // exception to be thrown
     * ```
     */
    done : function(onFulfilled, onRejected, onProgress, ctx) {
        this
            .then(onFulfilled, onRejected, onProgress, ctx)
            .fail(throwException);
    },

    /**
     * Returns a new promise that will be fulfilled in `delay` milliseconds if the promise is fulfilled,
     * or immediately rejected if promise is rejected.
     *
     * @param {Number} delay
     * @returns {vow:Promise}
     */
    delay : function(delay) {
        var timer,
            promise = this.then(function(val) {
                var defer = new Deferred();
                timer = setTimeout(
                    function() {
                        defer.resolve(val);
                    },
                    delay);

                return defer.promise();
            });

        promise.always(function() {
            clearTimeout(timer);
        });

        return promise;
    },

    /**
     * Returns a new promise that will be rejected in `timeout` milliseconds
     * if the promise is not resolved beforehand.
     *
     * @param {Number} timeout
     * @returns {vow:Promise}
     *
     * @example
     * ```js
     * var defer = vow.defer(),
     *     promiseWithTimeout1 = defer.promise().timeout(50),
     *     promiseWithTimeout2 = defer.promise().timeout(200);
     *
     * setTimeout(
     *     function() {
     *         defer.resolve('ok');
     *     },
     *     100);
     *
     * promiseWithTimeout1.fail(function(reason) {
     *     // promiseWithTimeout to be rejected in 50ms
     * });
     *
     * promiseWithTimeout2.then(function(value) {
     *     // promiseWithTimeout to be fulfilled with "'ok'" value
     * });
     * ```
     */
    timeout : function(timeout) {
        var defer = new Deferred(),
            timer = setTimeout(
                function() {
                    defer.reject(new vow.TimedOutError('timed out'));
                },
                timeout);

        this.then(
            function(val) {
                defer.resolve(val);
            },
            function(reason) {
                defer.reject(reason);
            });

        defer.promise().always(function() {
            clearTimeout(timer);
        });

        return defer.promise();
    },

    _vow : true,

    _resolve : function(val) {
        if(this._status > PROMISE_STATUS.RESOLVED) {
            return;
        }

        if(val === this) {
            this._reject(TypeError('Can\'t resolve promise with itself'));
            return;
        }

        this._status = PROMISE_STATUS.RESOLVED;

        if(val && !!val._vow) { // shortpath for vow.Promise
            val.isFulfilled()?
                this._fulfill(val.valueOf()) :
                val.isRejected()?
                    this._reject(val.valueOf()) :
                    val.then(
                        this._fulfill,
                        this._reject,
                        this._notify,
                        this);
            return;
        }

        if(isObject(val) || isFunction(val)) {
            var then,
                callSuccess = safeExec(function() {
                    then = val.then;
                }, function (e) {
                    this._reject(e);
                }, this);

            if (!callSuccess) {
                return;
            }

            if(isFunction(then)) {
                var _this = this,
                    isResolved = false;

                safeExec(function() {
                    then.call(
                        val,
                        function(val) {
                            if(isResolved) {
                                return;
                            }

                            isResolved = true;
                            _this._resolve(val);
                        },
                        function(err) {
                            if(isResolved) {
                                return;
                            }

                            isResolved = true;
                            _this._reject(err);
                        },
                        function(val) {
                            _this._notify(val);
                        });
                }, function(e) {
                    isResolved || this._reject(e);
                }, this);

                return;
            }
        }

        this._fulfill(val);
    },

    _fulfill : function(val) {
        if(this._status > PROMISE_STATUS.RESOLVED) {
            return;
        }

        this._status = PROMISE_STATUS.FULFILLED;
        this._value = val;

        this._callCallbacks(this._fulfilledCallbacks, val);
        this._fulfilledCallbacks = this._rejectedCallbacks = this._progressCallbacks = undef;
    },

    _reject : function(reason) {
        if(this._status > PROMISE_STATUS.RESOLVED) {
            return;
        }

        this._status = PROMISE_STATUS.REJECTED;
        this._value = reason;

        this._callCallbacks(this._rejectedCallbacks, reason);
        this._fulfilledCallbacks = this._rejectedCallbacks = this._progressCallbacks = undef;
    },

    _notify : function(val) {
        this._callCallbacks(this._progressCallbacks, val);
    },

    _addCallbacks : function(defer, onFulfilled, onRejected, onProgress, ctx) {
        if(onRejected && !isFunction(onRejected)) {
            ctx = onRejected;
            onRejected = undef;
        }
        else if(onProgress && !isFunction(onProgress)) {
            ctx = onProgress;
            onProgress = undef;
        }

        var cb;

        if(!this.isRejected()) {
            cb = { defer : defer, fn : isFunction(onFulfilled)? onFulfilled : undef, ctx : ctx };
            this.isFulfilled()?
                this._callCallbacks([cb], this._value) :
                this._fulfilledCallbacks.push(cb);
        }

        if(!this.isFulfilled()) {
            cb = { defer : defer, fn : onRejected, ctx : ctx };
            this.isRejected()?
                this._callCallbacks([cb], this._value) :
                this._rejectedCallbacks.push(cb);
        }

        if(this._status <= PROMISE_STATUS.RESOLVED) {
            this._progressCallbacks.push({ defer : defer, fn : onProgress, ctx : ctx });
        }
    },

    _callCallbacks : function(callbacks, arg) {
        var len = callbacks.length;
        if(!len) {
            return;
        }

        var isResolved = this.isResolved(),
            isFulfilled = this.isFulfilled();

        nextTick(function() {
            var i = 0, cb, defer, fn;
            while(i < len) {
                cb = callbacks[i++];
                defer = cb.defer;
                fn = cb.fn;

                if(fn) {
                    var ctx = cb.ctx,
                        res,
                        callSuccess = safeExec(function() {
                            res = ctx? fn.call(ctx, arg) : fn(arg);
                        }, function(e) {
                            defer.reject(e);
                        });

                    if (!callSuccess) {
                        continue;
                    }

                    isResolved?
                        defer.resolve(res) :
                        defer.notify(res);
                }
                else {
                    isResolved?
                        isFulfilled?
                            defer.resolve(arg) :
                            defer.reject(arg) :
                        defer.notify(arg);
                }
            }
        });
    }
};

/** @lends Promise */
var staticMethods = {
    /**
     * Coerces given `value` to a promise, or returns the `value` if it's already a promise.
     *
     * @param {*} value
     * @returns {vow:Promise}
     */
    cast : function(value) {
        return vow.cast(value);
    },

    /**
     * Returns a promise to be fulfilled only after all the items in `iterable` are fulfilled,
     * or to be rejected when any of the `iterable` is rejected.
     *
     * @param {Array|Object} iterable
     * @returns {vow:Promise}
     */
    all : function(iterable) {
        return vow.all(iterable);
    },

    /**
     * Returns a promise to be fulfilled only when any of the items in `iterable` are fulfilled,
     * or to be rejected when the first item is rejected.
     *
     * @param {Array} iterable
     * @returns {vow:Promise}
     */
    race : function(iterable) {
        return vow.anyResolved(iterable);
    },

    /**
     * Returns a promise that has already been resolved with the given `value`.
     * If `value` is a promise, returned promise will be adopted with the state of given promise.
     *
     * @param {*} value
     * @returns {vow:Promise}
     */
    resolve : function(value) {
        return vow.resolve(value);
    },

    /**
     * Returns a promise that has already been rejected with the given `reason`.
     *
     * @param {*} reason
     * @returns {vow:Promise}
     */
    reject : function(reason) {
        return vow.reject(reason);
    }
};

for(var prop in staticMethods) {
    staticMethods.hasOwnProperty(prop) &&
        (Promise[prop] = staticMethods[prop]);
}

var vow = /** @exports vow */ {
    /**
     * @property {boolean}
     * @default
     * Disables rejection of promises by throwing exceptions. Will cause all exceptions be thrown during runtime.
     */
    debug : false,

    Deferred : Deferred,

    Promise : Promise,

    /**
     * Creates a new deferred. This method is a factory method for `vow:Deferred` class.
     * It's equivalent to `new vow.Deferred()`.
     *
     * @returns {vow:Deferred}
     */
    defer : function() {
        return new Deferred();
    },

    /**
     * Static equivalent to `promise.then`.
     * If given `value` is not a promise, then `value` is equivalent to fulfilled promise.
     *
     * @param {*} value
     * @param {Function} [onFulfilled] Callback that will to be invoked with the value after promise has been fulfilled
     * @param {Function} [onRejected] Callback that will to be invoked with the reason after promise has been rejected
     * @param {Function} [onProgress] Callback that will to be invoked with the value after promise has been notified
     * @param {Object} [ctx] Context of callbacks execution
     * @returns {vow:Promise}
     */
    when : function(value, onFulfilled, onRejected, onProgress, ctx) {
        return vow.cast(value).then(onFulfilled, onRejected, onProgress, ctx);
    },

    /**
     * Static equivalent to `promise.fail`.
     * If given `value` is not a promise, then `value` is equivalent to fulfilled promise.
     *
     * @param {*} value
     * @param {Function} onRejected Callback that will to be invoked with the reason after promise has been rejected
     * @param {Object} [ctx] Context of callback execution
     * @returns {vow:Promise}
     */
    fail : function(value, onRejected, ctx) {
        return vow.when(value, undef, onRejected, ctx);
    },

    /**
     * Static equivalent to `promise.always`.
     * If given `value` is not a promise, then `value` is equivalent to fulfilled promise.
     *
     * @param {*} value
     * @param {Function} onResolved Callback that will to be invoked with the reason after promise has been resolved
     * @param {Object} [ctx] Context of callback execution
     * @returns {vow:Promise}
     */
    always : function(value, onResolved, ctx) {
        return vow.when(value).always(onResolved, ctx);
    },

    /**
     * Static equivalent to `promise.progress`.
     * If given `value` is not a promise, then `value` is equivalent to fulfilled promise.
     *
     * @param {*} value
     * @param {Function} onProgress Callback that will to be invoked with the reason after promise has been notified
     * @param {Object} [ctx] Context of callback execution
     * @returns {vow:Promise}
     */
    progress : function(value, onProgress, ctx) {
        return vow.when(value).progress(onProgress, ctx);
    },

    /**
     * Static equivalent to `promise.spread`.
     * If given `value` is not a promise, then `value` is equivalent to fulfilled promise.
     *
     * @param {*} value
     * @param {Function} [onFulfilled] Callback that will to be invoked with the value after promise has been fulfilled
     * @param {Function} [onRejected] Callback that will to be invoked with the reason after promise has been rejected
     * @param {Object} [ctx] Context of callbacks execution
     * @returns {vow:Promise}
     */
    spread : function(value, onFulfilled, onRejected, ctx) {
        return vow.when(value).spread(onFulfilled, onRejected, ctx);
    },

    /**
     * Static equivalent to `promise.done`.
     * If given `value` is not a promise, then `value` is equivalent to fulfilled promise.
     *
     * @param {*} value
     * @param {Function} [onFulfilled] Callback that will to be invoked with the value after promise has been fulfilled
     * @param {Function} [onRejected] Callback that will to be invoked with the reason after promise has been rejected
     * @param {Function} [onProgress] Callback that will to be invoked with the value after promise has been notified
     * @param {Object} [ctx] Context of callbacks execution
     */
    done : function(value, onFulfilled, onRejected, onProgress, ctx) {
        vow.when(value).done(onFulfilled, onRejected, onProgress, ctx);
    },

    /**
     * Checks whether the given `value` is a promise-like object
     *
     * @param {*} value
     * @returns {Boolean}
     *
     * @example
     * ```js
     * vow.isPromise('something'); // returns false
     * vow.isPromise(vow.defer().promise()); // returns true
     * vow.isPromise({ then : function() { }); // returns true
     * ```
     */
    isPromise : function(value) {
        return isObject(value) && isFunction(value.then);
    },

    /**
     * Coerces given `value` to a promise, or returns the `value` if it's already a promise.
     *
     * @param {*} value
     * @returns {vow:Promise}
     */
    cast : function(value) {
        return vow.isPromise(value)?
            value :
            vow.resolve(value);
    },

    /**
     * Static equivalent to `promise.valueOf`.
     * If given `value` is not an instance of `vow.Promise`, then `value` is equivalent to fulfilled promise.
     *
     * @param {*} value
     * @returns {*}
     */
    valueOf : function(value) {
        return value && isFunction(value.valueOf)? value.valueOf() : value;
    },

    /**
     * Static equivalent to `promise.isFulfilled`.
     * If given `value` is not an instance of `vow.Promise`, then `value` is equivalent to fulfilled promise.
     *
     * @param {*} value
     * @returns {Boolean}
     */
    isFulfilled : function(value) {
        return value && isFunction(value.isFulfilled)? value.isFulfilled() : true;
    },

    /**
     * Static equivalent to `promise.isRejected`.
     * If given `value` is not an instance of `vow.Promise`, then `value` is equivalent to fulfilled promise.
     *
     * @param {*} value
     * @returns {Boolean}
     */
    isRejected : function(value) {
        return value && isFunction(value.isRejected)? value.isRejected() : false;
    },

    /**
     * Static equivalent to `promise.isResolved`.
     * If given `value` is not a promise, then `value` is equivalent to fulfilled promise.
     *
     * @param {*} value
     * @returns {Boolean}
     */
    isResolved : function(value) {
        return value && isFunction(value.isResolved)? value.isResolved() : true;
    },

    /**
     * Returns a promise that has already been resolved with the given `value`.
     * If `value` is a promise, returned promise will be adopted with the state of given promise.
     *
     * @param {*} value
     * @returns {vow:Promise}
     */
    resolve : function(value) {
        var res = vow.defer();
        res.resolve(value);
        return res.promise();
    },

    /**
     * Returns a promise that has already been fulfilled with the given `value`.
     * If `value` is a promise, returned promise will be fulfilled with fulfill/rejection value of given promise.
     *
     * @param {*} value
     * @returns {vow:Promise}
     */
    fulfill : function(value) {
        var defer = vow.defer(),
            promise = defer.promise();

        defer.resolve(value);

        return promise.isFulfilled()?
            promise :
            promise.then(null, function(reason) {
                return reason;
            });
    },

    /**
     * Returns a promise that has already been rejected with the given `reason`.
     * If `reason` is a promise, returned promise will be rejected with fulfill/rejection value of given promise.
     *
     * @param {*} reason
     * @returns {vow:Promise}
     */
    reject : function(reason) {
        var defer = vow.defer();
        defer.reject(reason);
        return defer.promise();
    },

    /**
     * Invokes a given function `fn` with arguments `args`
     *
     * @param {Function} fn
     * @param {...*} [args]
     * @returns {vow:Promise}
     *
     * @example
     * ```js
     * var promise1 = vow.invoke(function(value) {
     *         return value;
     *     }, 'ok'),
     *     promise2 = vow.invoke(function() {
     *         throw Error();
     *     });
     *
     * promise1.isFulfilled(); // true
     * promise1.valueOf(); // 'ok'
     * promise2.isRejected(); // true
     * promise2.valueOf(); // instance of Error
     * ```
     */
    invoke : function(fn, args) {
        var len = Math.max(arguments.length - 1, 0),
            callArgs,
            res;
        if(len) { // optimization for V8
            callArgs = Array(len);
            var i = 0;
            while(i < len) {
                callArgs[i++] = arguments[i];
            }
        }

        safeExec(function () {
            res = vow.resolve(callArgs?
                fn.apply(global, callArgs) :
                fn.call(global));
        }, function(e) {
            res = vow.reject(e);
        });

        return res;
    },

    /**
     * Returns a promise to be fulfilled only after all the items in `iterable` are fulfilled,
     * or to be rejected when any of the `iterable` is rejected.
     *
     * @param {Array|Object} iterable
     * @returns {vow:Promise}
     *
     * @example
     * with array:
     * ```js
     * var defer1 = vow.defer(),
     *     defer2 = vow.defer();
     *
     * vow.all([defer1.promise(), defer2.promise(), 3])
     *     .then(function(value) {
     *          // value is "[1, 2, 3]" here
     *     });
     *
     * defer1.resolve(1);
     * defer2.resolve(2);
     * ```
     *
     * @example
     * with object:
     * ```js
     * var defer1 = vow.defer(),
     *     defer2 = vow.defer();
     *
     * vow.all({ p1 : defer1.promise(), p2 : defer2.promise(), p3 : 3 })
     *     .then(function(value) {
     *          // value is "{ p1 : 1, p2 : 2, p3 : 3 }" here
     *     });
     *
     * defer1.resolve(1);
     * defer2.resolve(2);
     * ```
     */
    all : function(iterable) {
        var defer = new Deferred(),
            isPromisesArray = isArray(iterable),
            keys = isPromisesArray?
                getArrayKeys(iterable) :
                getObjectKeys(iterable),
            len = keys.length,
            res = isPromisesArray? [] : {};

        if(!len) {
            defer.resolve(res);
            return defer.promise();
        }

        var i = len;
        vow._forEach(
            iterable,
            function(value, idx) {
                res[keys[idx]] = value;
                if(!--i) {
                    defer.resolve(res);
                }
            },
            defer.reject,
            defer.notify,
            defer,
            keys);

        return defer.promise();
    },

    /**
     * Returns a promise to be fulfilled only after all the items in `iterable` are resolved.
     *
     * @param {Array|Object} iterable
     * @returns {vow:Promise}
     *
     * @example
     * ```js
     * var defer1 = vow.defer(),
     *     defer2 = vow.defer();
     *
     * vow.allResolved([defer1.promise(), defer2.promise()]).spread(function(promise1, promise2) {
     *     promise1.isRejected(); // returns true
     *     promise1.valueOf(); // returns "'error'"
     *     promise2.isFulfilled(); // returns true
     *     promise2.valueOf(); // returns "'ok'"
     * });
     *
     * defer1.reject('error');
     * defer2.resolve('ok');
     * ```
     */
    allResolved : function(iterable) {
        var defer = new Deferred(),
            isPromisesArray = isArray(iterable),
            keys = isPromisesArray?
                getArrayKeys(iterable) :
                getObjectKeys(iterable),
            i = keys.length,
            res = isPromisesArray? [] : {};

        if(!i) {
            defer.resolve(res);
            return defer.promise();
        }

        var onResolved = function() {
                --i || defer.resolve(iterable);
            };

        vow._forEach(
            iterable,
            onResolved,
            onResolved,
            defer.notify,
            defer,
            keys);

        return defer.promise();
    },

    allPatiently : function(iterable) {
        return vow.allResolved(iterable).then(function() {
            var isPromisesArray = isArray(iterable),
                keys = isPromisesArray?
                    getArrayKeys(iterable) :
                    getObjectKeys(iterable),
                rejectedPromises, fulfilledPromises,
                len = keys.length, i = 0, key, promise;

            if(!len) {
                return isPromisesArray? [] : {};
            }

            while(i < len) {
                key = keys[i++];
                promise = iterable[key];
                if(vow.isRejected(promise)) {
                    rejectedPromises || (rejectedPromises = isPromisesArray? [] : {});
                    isPromisesArray?
                        rejectedPromises.push(promise.valueOf()) :
                        rejectedPromises[key] = promise.valueOf();
                }
                else if(!rejectedPromises) {
                    (fulfilledPromises || (fulfilledPromises = isPromisesArray? [] : {}))[key] = vow.valueOf(promise);
                }
            }

            if(rejectedPromises) {
                return vow.reject(rejectedPromises);
            }

            return fulfilledPromises;
        });
    },

    /**
     * Returns a promise to be fulfilled only when any of the items in `iterable` is fulfilled,
     * or to be rejected when all the items are rejected (with the reason of the first rejected item).
     *
     * @param {Array} iterable
     * @returns {vow:Promise}
     */
    any : function(iterable) {
        var defer = new Deferred(),
            len = iterable.length;

        if(!len) {
            defer.reject(Error());
            return defer.promise();
        }

        var i = 0, reason;
        vow._forEach(
            iterable,
            defer.resolve,
            function(e) {
                i || (reason = e);
                ++i === len && defer.reject(reason);
            },
            defer.notify,
            defer);

        return defer.promise();
    },

    /**
     * Returns a promise to be fulfilled only when any of the items in `iterable` is fulfilled,
     * or to be rejected when the first item is rejected.
     *
     * @param {Array} iterable
     * @returns {vow:Promise}
     */
    anyResolved : function(iterable) {
        var defer = new Deferred(),
            len = iterable.length;

        if(!len) {
            defer.reject(Error());
            return defer.promise();
        }

        vow._forEach(
            iterable,
            defer.resolve,
            defer.reject,
            defer.notify,
            defer);

        return defer.promise();
    },

    /**
     * Static equivalent to `promise.delay`.
     * If given `value` is not a promise, then `value` is equivalent to fulfilled promise.
     *
     * @param {*} value
     * @param {Number} delay
     * @returns {vow:Promise}
     */
    delay : function(value, delay) {
        return vow.resolve(value).delay(delay);
    },

    /**
     * Static equivalent to `promise.timeout`.
     * If given `value` is not a promise, then `value` is equivalent to fulfilled promise.
     *
     * @param {*} value
     * @param {Number} timeout
     * @returns {vow:Promise}
     */
    timeout : function(value, timeout) {
        return vow.resolve(value).timeout(timeout);
    },

    _forEach : function(promises, onFulfilled, onRejected, onProgress, ctx, keys) {
        var len = keys? keys.length : promises.length,
            i = 0;

        while(i < len) {
            vow.when(
                promises[keys? keys[i] : i],
                wrapOnFulfilled(onFulfilled, i),
                onRejected,
                onProgress,
                ctx);
            ++i;
        }
    },

    TimedOutError : defineCustomErrorType('TimedOut')
};

var defineAsGlobal = true;
if(typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = vow;
    defineAsGlobal = false;
}

if(typeof modules === 'object') {
    modules.define('vow', function(provide) {
        provide(vow);
    });
    defineAsGlobal = false;
}

if(typeof define === 'function') {
    define(function(require, exports, module) {
        module.exports = vow;
    });
    defineAsGlobal = false;
}

defineAsGlobal && (global.vow = vow);

})(this);

ym['vow'] = this['vow'];
this['vow'] = _backup_vow;
_backup_vow = undefined;
ym.modules.define('vow', [], function (provide) { provide(ym.vow); });
var _backup_modules = this['modules'];
/**
 * Специальная прослойка, которая добавляет промисы, фоллбеки, динамические зависимости и алиасы в модульную систему.
 */
(function(global, modulesSystem, undef) {
    var WATCH_DEPS_TIMEOUT = 10; // sec.

    var vow = ym.vow,

        slice = Array.prototype.slice,
    
        moduleByAliases = {},
        entries = {},
        
        keyNotFoundError = function (storage, key) { 
            return new Error("The key \"" + key + "\" isn't declared in \"" + storage + "\" storage."); 
        },
        dynamicDependNotFoundError = function (dynamicDepend) {
            return new Error("The dynamic depend \"" + dynamicDepend + "\" not found.");
        },

        api;

    api = {
        fallbacks: new FallbackManager(),

        define: function (moduleName, depends, callback, context) {
            var storage, key, dynamicDepends;
            if (typeof depends == 'function') {
                callback = depends;
                context = callback;
                depends = null;
            }
            else if (typeof moduleName == 'object') {
                var data = moduleName;
                moduleName = data.name;
                depends = data.depends;
                callback = data.declaration;
                context = data.context;
                dynamicDepends = data.dynamicDepends;

                storage = data.storage;
                key = data.key;
            }

            if (!entries.hasOwnProperty(moduleName)) {
                entries[moduleName] = {name: moduleName};
            }

            entries[moduleName].callback = callback;
            entries[moduleName].context = context;

            if (storage && key) {
                if (typeof key != 'string') {
                    for (var i = 0, l = key.length; i < l; i++) {
                        this._createKeyStorageRef(moduleName, key[i], storage);
                    }
                } else {
                    this._createKeyStorageRef(moduleName, key, storage);
                }

                entries[moduleName].key = key;
                entries[moduleName].storage = storage;
            }

            if (dynamicDepends) {
                entries[moduleName].dynamicDepends = dynamicDepends;
            }

            var onModuleLoad = api._createPathedCallback(moduleName);

            if (depends != null) {
                var deps = [];
                for (var i = 0, l = depends.length; i < l; i++) {
                    deps[i] = this._processModuleName(depends[i]);
                }
                modulesSystem.define(moduleName, deps, onModuleLoad);
                this.watchDeps(moduleName, deps);
            } else {
                modulesSystem.define(moduleName, onModuleLoad);
            }

            return this;
        },

        require: function (moduleNames, successCallback, errorCallback, context) {
            var deferred = vow.defer(),
                data = undef;

            if (arguments.length == 3 && typeof errorCallback != 'function') {
                context = errorCallback;
                errorCallback = null;
            } else if (!moduleNames.hasOwnProperty('length') && typeof moduleNames == 'object') {
                var obj = moduleNames;
                moduleNames = obj.modules;
                successCallback = obj.successCallback;
                errorCallback = obj.errorCallback;
                context = obj.context;
                if (obj.hasOwnProperty('data')) {
                    data = obj.data;
                }
            }

            moduleNames = (typeof moduleNames == 'string' || !moduleNames.hasOwnProperty('length')) ? [moduleNames] : moduleNames;
            var moduleNamesLength = moduleNames.length,
                result = this._processModuleList(moduleNames, data);
            moduleNames = result.list;
            if (result.error) {
                deferred.reject(result.error);
            } else {
                modulesSystem.require(moduleNames, function () {
                    // TODO потенцально опасный код.
                    // Для сокращения ожидания и кол-ва кода основной запрос и все динамические зависимости обрабатываются одним require.
                    // Чтобы модули из динамических зависимостей отрабатывали раньше, чем явно запрощенные модули, они добалявляются в начало массива.
                    // Если вдруг в модульной системе измениться порядок выполнения модулей, то что-то может сломаться.
                    var array = slice.call(arguments, arguments.length - moduleNamesLength);
                    deferred.resolve(array);
                    successCallback && successCallback.apply(context || global, array);
                }, function (err) {
                    // TODO потенциально опасный код.
                    // `retrieve` может разрешить промис, но `require` по разным причинам может продолжать не выполняться, что вызовет зацикливание.
//                    api.fallbacks.retrieve(moduleNames).then(function () {
                    vow.reject(err).then(function () {
                        deferred.resolve(api.require(moduleNames, successCallback, errorCallback, context));
                    }, function (err) {
                        deferred.reject(err);
                        errorCallback && errorCallback.call(context || global, err);
                    });
                });
            }

            return deferred.promise();
        },

        defineSync: function (moduleName, module) {
            // Этот метод пока не светится наружу.
            var storage, key;
            if (typeof moduleName == 'object') {
                var data = moduleName;
                module = data.module;
                storage = data.storage;
                key = data.key;
                moduleName = data.name;
            }

            if (api.isDefined(moduleName)) {
                var entry = entries[moduleName];
                entry.name = moduleName;
                entry.module = module;
                entry.callback = function (provide) {
                    provide(module);
                };
                entry.context = null;
            } else {
                entries[moduleName] = {
                    name: moduleName,
                    module: module
                };
                // Добавляем в модульную систему, чтобы можно было обращатьсяв зависимостях.
                api.define(moduleName, function (provide) {
                    provide(module);
                });
            }

            if (key && storage) {
                entries[moduleName].key = key;
                entries[moduleName].storage = storage;
                this._createKeyStorageRef(moduleName, key, storage);
            }
        },

        requireSync: function (name, data) {
            // Этот метод пока не светится наружу.
            var definition = this.getDefinition(name),
                result = null;
            if (definition) {
                result = definition.getModuleSync.apply(definition, slice.call(arguments, 1));
            }
            return result;
        },

        // This method is being called with context of a module.
        providePackage: function (provide) {
            var module = this,
                depsValues = Array.prototype.slice.call(arguments, 1);

            api.require(['system.mergeImports']).spread(function (mergeImports) {
                provide(mergeImports.joinImports(module.name, {}, module.deps, depsValues));
            });
        },

        getDefinition: function (name) {
            var result = null;
            name = this._processModuleName(name);

            if (entries.hasOwnProperty(name)) {
                result = new Definition(entries[name]);
            }

            return result;
        },

        getState: function (name) {
            return modulesSystem.getState(this._processModuleName(name));
        },

        isDefined: function (name) {
            return modulesSystem.isDefined(this._processModuleName(name));
        },

        setOptions: function (options) {
            return modulesSystem.setOptions(options);
        },

        flush: function () {
            return modulesSystem.flush();
        },

        nextTick: function (func) {
            return modulesSystem.nextTick(func);
        },

        watchDeps: function (moduleName, deps) {
            if (!(typeof console == 'object' && typeof console.warn == 'function')) {
                return;
            }

            var _this = this;

            setTimeout(function () {
                for (var i = 0, l = deps.length; i < l; i++) {
                    if (_this.getState(deps[i]) == 'IN_RESOLVING') {
                        console.warn('Timeout: Dependency `' + deps[i] +
                            '` from module `' + moduleName+ '` IS IN_RESOLVING within ' + WATCH_DEPS_TIMEOUT + ' sec.');
                    }
                }
            }, WATCH_DEPS_TIMEOUT * 1000);
        },

        _createPathedCallback: function (moduleName) {
            return function () {
                var entry = entries[moduleName],
                    array = slice.call(arguments, 0),
                    callback = entry.callback,
                    context = entry.context;
                array[0] = api._patchProvideFunction(array[0], moduleName);
                callback && callback.apply(context || this, array);
            };
        },

        _processModuleList: function (moduleList, data, ignoreCurrentNode) {
            var state = {
                list: []
            };

            for (var i = 0, l = moduleList.length; i < l; i++) {
                var moduleName = this._processModuleName(moduleList[i]);

                if (!moduleName) {
                    state.error = keyNotFoundError(moduleList[i].storage, moduleList[i].key);
                    break;
                }

                if (typeof data != 'undefined') {
                    var depends = modulesSystem.getDependencies(moduleName),
                        entry = entries[moduleName];
                    if (depends) {
                        var dependsResult = this._processModuleList(depends, data, true);
                        if (dependsResult.error) {
                            state.error = dependsResult.error;
                            break;
                        } else {
                            state.list = state.list.concat(dependsResult.list);
                        }
                    }

                    if (entry && entry.dynamicDepends) {
                        var dynamicDepends = [];
                        for (var key in entry.dynamicDepends) {
                            var depend = entry.dynamicDepends[key](data);
                            // TOOD обсудить в ревью
                            if (this._isDepend(depend)) {
                                dynamicDepends.push(depend);
                            }
                        }
                        var dependsResult = this._processModuleList(dynamicDepends, data);
                        if (dependsResult.error) {
                            state.error = dependsResult.error;
                            break;
                        } else {
                            state.list = state.list.concat(dependsResult.list);
                        }
                    }
                }

                if (!ignoreCurrentNode) {
                    state.list.push(moduleName);
                }
            }

            return state;
        },

        _createKeyStorageRef: function (moduleName, key, storage) {
            if (!moduleByAliases.hasOwnProperty(storage)) {
                moduleByAliases[storage] = {};
            }
            moduleByAliases[storage][key] = moduleName;
        },

        _processModuleName: function (moduleName) {
            if (typeof moduleName != 'string') {
                var storage = moduleName.storage;
                if (moduleByAliases.hasOwnProperty(storage)) {
                    moduleName = moduleByAliases[storage][moduleName.key] || null;
                } else {
                    moduleName = null;
                }
            }
            return moduleName;
        },

        _patchProvideFunction: function (provide, moduleName) {
            var patchedProvide = function (module, error) {
                var entry = entries[moduleName];
                entry.module = module;
                provide(module, error);
                if (!error) {
                    delete entry.callback;
                    delete entry.context;
                }
            };
            patchedProvide.provide = patchedProvide;
            patchedProvide.dynamicDepends = {
                getValue: function (key, data) {
                    var deferred = vow.defer(),
                        entry = entries[moduleName];
                    if (entry.dynamicDepends && entry.dynamicDepends.hasOwnProperty(key)) {
                        var depend = entry.dynamicDepends[key](data);
                        deferred.resolve(
                            api._isDepend(depend) ?
                                api.getDefinition(depend).getModule(data) :
                                [depend]
                        );
                    } else {
                        deferred.reject(dynamicDependNotFoundError(key));
                    }
                    return deferred.promise();
                },

                getValueSync: function (key, data) {
                    var result = undef,
                        entry = entries[moduleName];
                    if (entry.dynamicDepends && entry.dynamicDepends.hasOwnProperty(key)) {
                        var depend = entry.dynamicDepends[key](data);
                        result = api._isDepend(depend) ?
                            api.getDefinition(depend).getModuleSync(data) :
                            depend;
                    }
                    return result;
                }
            };
            return patchedProvide;
        },

        _isDepend: function (depend) {
            return (typeof depend == 'string') || (depend && depend.key && depend.storage);
        }
    };
    
    function Definition (entry) {
        this.entry = entry; 
    }
    
    Definition.prototype.getModuleKey = function () {
        return this.entry.key;
    };
    
    Definition.prototype.getModuleStorage = function () {
        return this.entry.storage;
    };
    
    Definition.prototype.getModuleName = function () {
        return this.entry.name;
    };
    
    Definition.prototype.getModuleSync = function (data) {
        if (arguments.length > 0) {
            var dynamicDepends = this.entry.dynamicDepends;
            for (var key in dynamicDepends) {
                var depend = dynamicDepends[key](data);
                if (api._isDepend(depend) && !api.getDefinition(depend).getModuleSync(data)) {
                    return undef;
                }
            }
        }
        return this.entry.module;
    };
    
    Definition.prototype.getModule = function (data) {
        var params = {
                modules: [
                    this.entry.name
                ]
            };
        if (data) {
            params.data = data;
        }
        return api.require(params);
    };

    function FallbackManager () {
        this._fallbacks = [];
    }

    FallbackManager.prototype.register = function (filter, fallback) {
        this._fallbacks[filter ? 'unshift' : 'push']({
            filter: filter,
            fallback: fallback
        });
    };

    FallbackManager.prototype.retrieve = function (moduleNames) {
        var definePromises = [];

        for (var i = 0, l = moduleNames.length; i < l; i++) {
            var deferred = vow.defer(),
                moduleName = moduleNames[i];

            definePromises[i] = deferred.promise();

            if (api.isDefined(moduleName)) {
                deferred.resolve(true);

                continue;
            }

            var fallback = this.find(moduleName);

            if (!fallback) {
                deferred.reject('Undefined module `' + moduleName + '` with no matching fallback.');

                break;
            }

            deferred.resolve(fallback.retrieve(moduleName));
        }

        return vow.all(definePromises);
    };

    FallbackManager.prototype.find = function (moduleName) {
        for (var i = 0, l = this._fallbacks.length; i < l; i++) {
            var filter = this._fallbacks[i].filter,
                fallback = this._fallbacks[i].fallback;

            if (filter === null) {
                return fallback;
            }

            if (typeof filter == 'function' && filter(moduleName)) {
                return fallback;
            }

            if (moduleName.match(filter)) {
                return fallback;
            }
        }

        return null;
    };

    global.modules = api;
})(this, ym.modules);
ym['modules'] = this['modules'];
this['modules'] = _backup_modules;
_backup_modules = undefined;
ym.ns.modules = ym.modules;

(function (global) {
    if (!ym.project.namespace) {
        return;
    }

    if (typeof setupAsync == 'function') {
        ym.envCallbacks.push(function (env) {
            if (env.namespace !== false) {
                registerNamespace(global, env.namespace || ym.project.namespace, ym.ns);
            }
        });
    } else {
        registerNamespace(global, ym.project.namespace, ym.ns);
    }

    function registerNamespace (parentNs, path, data) {
        if (path) {
            var subObj = parentNs;
            path = path.split('.');
            var i = 0, l = path.length - 1, name;
            for (; i < l; i++) {
                if (path[i]) {
                    subObj = subObj[name = path[i]] || (subObj[name] = {});
                }
            }
            subObj[path[l]] = data;
            return subObj[path[l]];
        } else {
            return data;
        }
    }
})(this);

ym.env.debug = true;

/**
 * @fileOverview
 * Wrapper around WebGL buffer objects.
 */
ym.modules.define('Buffer', [
    'util.defineClass'
], function (provide, defineClass) {
    /**
     * Constructs new buffer with given target and data usage.
     *
     * @ignore
     * @class
     * @name Buffer
     * @param {WebGLRenderingContext} gl WebGL context for which buffer
     *      will be created.
     * @param {GLenum} target Buffer target. Must be either ARRAY_BUFFER
     *      or ELEMENT_ARRAY_BUFFER.
     */
    function Buffer (gl, target) {
        this._gl = gl;
        this._target = target;
        this._glHandler = gl.createBuffer();

        this.bind();
    }

    provide(defineClass(
        Buffer,
        /** @lends Buffer.prototype */
        {
            /**
             * Binds buffer to it's target.
             */
            bind: function () {
                this._gl.bindBuffer(this._target, this._glHandler);
            },

            /**
             * Unbinds buffer.
             */
            unbind: function () {
                if (ym.env.debug) {
                    if (!this.isBound()) {
                        throw new Error('Other buffer bound to target');
                    }
                }
                this._gl.bindBuffer(this._target, null);
            },

            /**
             * @returns {Boolean} `true' if buffer is bound to its target and `false' otherwise.
             */
            isBound: function () {
                var gl = this._gl, param;

                switch (this._target) {
                    case gl.ARRAY_BUFFER:
                        param = gl.ARRAY_BUFFER_BINDING;
                        break;
                    case gl.ELEMENT_ARRAY_BUFFER:
                        param = gl.ELEMENT_ARRAY_BUFFER_BINDING;
                        break;
                }

                return gl.getParameter(param) == this._glHandler;
            },

            /**
             * Resizes buffer and sets it's data to zeroes.
             *
             * @param {Number} newSize New size of the buffer in bytes.
             * @param {GLenum} [usage = gl.STATIC_DRAW] Buffer usage. Must be either STREAM_DRAW,
             *      STATIC_DRAW or DYNAMIC_DRAW.
             */
            resize: function (newSize, usage) {
                if (ym.env.debug) {
                    if (!this.isBound()) {
                        throw new Error('Other buffer bound to target');
                    }
                }
                var gl = this._gl;
                gl.bufferData(this._target, newSize, usage || gl.STATIC_DRAW);
            },

            /**
             * Resets data of the buffer.
             *
             * @param {ArrayBufferView|ArrayBuffer} data New data of the buffer.
             * @param {GLenum} [usage = gl.STATIC_DRAW] Buffer usage. Must be either STREAM_DRAW,
             *      STATIC_DRAW or DYNAMIC_DRAW.
             */
            setData: function (data, usage) {
                if (ym.env.debug) {
                    if (!this.isBound()) {
                        throw new Error('Other buffer bound to target');
                    }
                }
                var gl = this._gl;
                gl.bufferData(this._target, data, usage || gl.STATIC_DRAW);
            },

            /**
             * Writes data to the buffer at given offset.
             *
             * @param {Number} offset Offset of the new data.
             * @param {ArrayBufferView|ArrayBuffer} data New data.
             */
            setSubData: function (offset, data) {
                if (ym.env.debug) {
                    if (!this.isBound()) {
                        throw new Error('Other buffer bound to target');
                    }
                }
                this._gl.bufferSubData(this._target, offset, data);
            },

            /**
             * @returns {Number} Size of the buffer in bytes.
             */
            getSize: function () {
                if (ym.env.debug) {
                    if (!this.isBound()) {
                        throw new Error('Other buffer bound to target');
                    }
                }
                var gl = this._gl;
                return gl.getBufferParameter(this._target, gl.BUFFER_SIZE);
            },

            /**
             * @returns {GLenum} Usage of the buffer.
             */
            getUsage: function () {
                if (ym.env.debug) {
                    if (!this.isBound()) {
                        throw new Error('Other buffer bound to target');
                    }
                }
                var gl = this._gl;
                return gl.getBufferParameter(this._target, gl.BUFFER_USAGE);
            },

            destroy: function () {
                this._gl.deleteBuffer(this._glHandler);
            }
        }
    ));
});

ym.modules.define('debounce', [], function (provide) {
    /**
     * Оборачивает переданную функцию в функцию-обертку, которая при каждом вызове
     * откладывает исполнение переданной на переданный интервал.
     *
     * @ignore
     * @function
     * @static
     * @name panorama.util.debounce
     * @param {Number} delay Интерал в миллисекундах.
     * @param {Function} fn Фукнция.
     * @param {Object} [thisArg] Объект, на который будет ссылаться
     *      <codeph>this</codeph> в вызванной функции.
     * @returns {Function} Функция-обертка.
     */
    provide(function debounce (delay, fn, thisArg) {
        var timeout, wrapperArgs = [], wrapperThisArg;

        function timeoutCallback () {
            fn.apply(thisArg || wrapperThisArg, wrapperArgs);
        }

        return function () {
            wrapperArgs.length = arguments.length;
            for (var i = 0; i < wrapperArgs.length; ++i) {
                wrapperArgs[i] = arguments[i];
            }
            wrapperThisArg = this;
            clearTimeout(timeout);
            timeout = setTimeout(timeoutCallback, delay);
        };
    });
});

ym.modules.define('EXT_disjoint_timer_query.logo.frag',[],function (provide) {
provide("#ifdef GL_FRAGMENT_PRECISION_HIGH\n    precision highp float;\n#else\n    precision mediump float;\n#endif\n\nvarying vec3 color;\n\nvoid main(void) {\n    gl_FragColor = vec4(color, 1);\n}\n");
});
ym.modules.define('EXT_disjoint_timer_query.logo.json',[],function (provide) {
provide({"vbuffer":[1.1800519072824156,0.011700870337477992,0.05001776198934281,0,0,1,0,0,0,1.1303419072824155,0.19314287033747796,0.05001776198934281,0,0,1,0,0,0,1.0458339072824154,0.19314287033747796,0.05001776198934281,0,0,1,0,0,0,1.2214769072824159,0.065553870337478,0.05001776198934281,0,0,1,0,0,0,1.3971189072824157,0.19314287033747796,0.05001776198934281,0,0,1,0,0,0,1.3126119072824158,0.19314287033747796,0.05001776198934281,0,0,1,0,0,0,1.2637299072824155,0.011700870337477992,0.05001776198934281,0,0,1,0,0,0,1.0276079072824156,-0.19376712966252202,0.05001776198934281,0,0,1,0,0,0,1.2214769072824159,-0.04132312966252202,0.05001776198934281,0,0,1,0,0,0,1.4153459072824157,-0.19376712966252202,0.05001776198934281,0,0,1,0,0,0,1.1121149072824155,-0.19376712966252202,0.05001776198934281,0,0,1,0,0,0,1.3308389072824158,-0.19376712966252202,0.05001776198934281,0,0,1,0,0,0,0.7827109072824157,0.20007987033747798,0.05001776198934281,0,0,1,0,0,0,0.8445119072824157,0.19969487033747796,0.05001776198934281,0,0,0.999969,0,0,0,0.8121979072824157,0.202255870337478,0.05001776198934281,0,0,1,0,0,0,0.7559549072824157,0.19382487033747797,0.05001776198934281,0,0,1,0,0,0,0.8728389072824156,0.19239487033747799,0.05001776198934281,0,0,1,0,0,0,0.7318979072824157,0.18389987033747796,0.05001776198934281,0,0,1,0,0,0,0.8974039072824156,0.18093487033747796,0.05001776198934281,0,0,1,0,0,0,0.7105069072824157,0.17071187033747798,0.05001776198934281,0,0,1,0,0,0,0.9184299072824156,0.165893870337478,0.05001776198934281,0,0,1,0,0,0,0.6917509072824157,0.15466987033747798,0.05001776198934281,0,0,0.999969,0,0,0,0.9361419072824155,0.14784987033747798,0.05001776198934281,0,0,1,0,0,0,0.6755979072824156,0.136182870337478,0.05001776198934281,0,0,1,0,0,0,0.8113689072824157,0.14260387033747796,0.05001776198934281,0,0,1,0,0,0,0.8225149072824158,0.14191487033747796,0.05001776198934281,0,0,1,0,0,0,0.9507649072824158,0.12738087033747797,0.05001776198934281,0,0,0.999969,0,0,0,0.7994759072824156,0.141898870337478,0.05001776198934281,0,0,1,0,0,0,0.8335009072824158,0.13985387033747798,0.05001776198934281,0,0,1,0,0,0,0.7878909072824156,0.13979587033747798,0.05001776198934281,0,0,1,0,0,0,0.8441979072824157,0.13642887033747797,0.05001776198934281,0,0,0.999969,0,0,0,0.7767139072824156,0.13631287033747796,0.05001776198934281,0,0,1,0,0,0,0.8544819072824157,0.131649870337478,0.05001776198934281,0,0,1,0,0,0,0.7660469072824156,0.131464870337478,0.05001776198934281,0,0,1,0,0,0,0.6620179072824157,0.11565987033747799,0.05001776198934281,0,0,1,0,0,0,0.8642239072824158,0.12552387033747797,0.05001776198934281,0,0,1,0,0,0,0.7559889072824157,0.125271870337478,0.05001776198934281,0,0,1,0,0,0,0.9625219072824156,0.105063870337478,0.05001776198934281,0,0,1,0,0,0,0.8732989072824155,0.118059870337478,0.05001776198934281,0,0,1,0,0,0,0.7466419072824158,0.117748870337478,0.05001776198934281,0,0,1,0,0,0,0.8815809072824154,0.109266870337478,0.05001776198934281,0,0,1,0,0,0,0.7381069072824156,0.10891487033747799,0.05001776198934281,0,0,1,0,0,0,0.6509769072824156,0.09350787033747798,0.05001776198934281,0,0,1,0,0,0,0.8889409072824157,0.09915387033747797,0.05001776198934281,0,0,1,0,0,0,0.7304829072824157,0.09878587033747799,0.05001776198934281,0,0,1,0,0,0,0.9716379072824157,0.08147887033747797,0.05001776198934281,0,0,0.999969,0,0,0,0.8952549072824159,0.087728870337478,0.05001776198934281,0,0,1,0,0,0,0.7238719072824156,0.08737887033747799,0.05001776198934281,0,0,1,0,0,0,0.6424459072824156,0.07013587033747798,0.05001776198934281,0,0,1,0,0,0,0.9003949072824158,0.07500087033747799,0.05001776198934281,0,0,1,0,0,0,0.7183739072824156,0.07471287033747798,0.05001776198934281,0,0,1,0,0,0,0.9783379072824157,0.05720387033747798,0.05001776198934281,0,0,1,0,0,0,0.9042339072824155,0.06097787033747798,0.05001776198934281,0,0,1,0,0,0,0.7140899072824156,0.06080387033747797,0.05001776198934281,0,0,1,0,0,0,0.6363909072824157,0.04595287033747797,0.05001776198934281,0,0,1,0,0,0,0.9066469072824157,0.04566987033747799,0.05001776198934281,0,0,0.999969,0,0,0,0.7111199072824157,0.04566987033747799,0.05001776198934281,0,0,1,0,0,0,0.9828459072824156,0.03281587033747799,0.05001776198934281,0,0,1,0,0,0,0.6327809072824158,0.021367870337477973,0.05001776198934281,0,0,1,0,0,0,0.9853859072824158,0.00889487033747799,0.05001776198934281,0,0,1,0,0,0,0.6315839072824156,-0.0032121296625220175,0.05001776198934281,0,0,1,0,0,0,0.9861829072824158,-0.01398212966252202,0.05001776198934281,0,0,1,0,0,0,0.6320279072824158,-0.017807129662522014,0.05001776198934281,0,0,1,0,0,0,0.7078059072824157,-0.01398212966252202,0.05001776198934281,0,0,1,0,0,0,0.7092809072824156,-0.033582129662522026,0.05001776198934281,0,0,1,0,0,0,0.6333369072824158,-0.03214812966252201,0.05001776198934281,0,0,1,0,0,0,0.6354809072824157,-0.046190129662522006,0.05001776198934281,0,0,1,0,0,0,0.7127659072824157,-0.05174812966252201,0.05001776198934281,0,0,1,0,0,0,0.6384269072824156,-0.05988712966252202,0.05001776198934281,0,0,1,0,0,0,0.7180979072824156,-0.06843012966252202,0.05001776198934281,0,0,1,0,0,0,0.6421439072824155,-0.07319312966252202,0.05001776198934281,0,0,1,0,0,0,0.7251129072824156,-0.08357612966252202,0.05001776198934281,0,0,1,0,0,0,0.6466009072824157,-0.08606212966252202,0.05001776198934281,0,0,1,0,0,0,0.7336469072824157,-0.09713512966252202,0.05001776198934281,0,0,1,0,0,0,0.6517649072824157,-0.09844712966252202,0.05001776198934281,0,0,1,0,0,0,0.7435349072824156,-0.10905312966252202,0.05001776198934281,0,0,1,0,0,0,0.6576049072824157,-0.11030312966252202,0.05001776198934281,0,0,1,0,0,0,0.9194659072824156,-0.10998612966252203,0.05001776198934281,0,0,1,0,0,0,0.9762399072824155,-0.14157112966252203,0.05001776198934281,0,0,0.999969,0,0,0,0.9298439072824158,-0.10097512966252202,0.05001776198934281,0,0,0.999969,0,0,0,0.7546149072824158,-0.11928012966252202,0.05001776198934281,0,0,1,0,0,0,0.9090929072824157,-0.11762612966252202,0.05001776198934281,0,0,1,0,0,0,0.6640899072824156,-0.12158412966252202,0.05001776198934281,0,0,1,0,0,0,0.8988009072824155,-0.12400512966252202,0.05001776198934281,0,0,1,0,0,0,0.7667219072824156,-0.127763129662522,0.05001776198934281,0,0,1,0,0,0,0.6711869072824157,-0.13224312966252202,0.05001776198934281,0,0,0.999969,0,0,0,0.8886649072824158,-0.12923612966252201,0.05001776198934281,0,0,1,0,0,0,0.7796919072824156,-0.134452129662522,0.05001776198934281,0,0,1,0,0,0,0.8787579072824157,-0.13343212966252202,0.05001776198934281,0,0,1,0,0,0,0.6788659072824157,-0.14223512966252203,0.05001776198934281,0,0,1,0,0,0,0.8691569072824157,-0.13670412966252202,0.05001776198934281,0,0,1,0,0,0,0.7933599072824156,-0.13929312966252202,0.05001776198934281,0,0,1,0,0,0,0.8599349072824158,-0.13916512966252204,0.05001776198934281,0,0,1,0,0,0,0.8511679072824156,-0.14092712966252202,0.05001776198934281,0,0,1,0,0,0,0.8075639072824154,-0.14223612966252203,0.05001776198934281,0,0,1,0,0,0,0.8429289072824155,-0.142102129662522,0.05001776198934281,0,0,0.999969,0,0,0,0.9682889072824157,-0.15008812966252202,0.05001776198934281,0,0,1,0,0,0,0.8352959072824158,-0.142803129662522,0.05001776198934281,0,0,0.999969,0,0,0,0.6870939072824156,-0.151513129662522,0.05001776198934281,0,0,1,0,0,0,0.8221389072824157,-0.14322812966252202,0.05001776198934281,0,0,1,0,0,0,0.8283409072824157,-0.14314112966252202,0.05001776198934281,0,0,1,0,0,0,0.9597159072824155,-0.15819512966252203,0.05001776198934281,0,0,1,0,0,0,0.6979799072824155,-0.161922129662522,0.05001776198934281,0,0,1,0,0,0,0.9504529072824157,-0.16583112966252203,0.05001776198934281,0,0,0.999969,0,0,0,0.7090759072824158,-0.17085312966252203,0.05001776198934281,0,0,1,0,0,0,0.9404309072824155,-0.17293212966252203,0.05001776198934281,0,0,1,0,0,0,0.7203499072824155,-0.17841412966252201,0.05001776198934281,0,0,1,0,0,0,0.9295799072824158,-0.179434129662522,0.05001776198934281,0,0,1,0,0,0,0.7317719072824156,-0.18471512966252202,0.05001776198934281,0,0,1,0,0,0,0.9178309072824158,-0.18527512966252202,0.05001776198934281,0,0,1,0,0,0,0.7433079072824156,-0.18986512966252203,0.05001776198934281,0,0,1,0,0,0,0.9051159072824158,-0.19039112966252203,0.05001776198934281,0,0,1,0,0,0,0.7549269072824156,-0.19397412966252203,0.05001776198934281,0,0,1,0,0,0,0.8913649072824157,-0.19471812966252203,0.05001776198934281,0,0,1,0,0,0,0.7665989072824158,-0.19715112966252202,0.05001776198934281,0,0,1,0,0,0,0.8765099072824158,-0.19819412966252203,0.05001776198934281,0,0,1,0,0,0,0.7782899072824156,-0.199505129662522,0.05001776198934281,0,0,1,0,0,0,0.8604809072824158,-0.20075612966252201,0.05001776198934281,0,0,1,0,0,0,0.7899699072824156,-0.20114612966252202,0.05001776198934281,0,0,1,0,0,0,0.8432089072824156,-0.20233912966252202,0.05001776198934281,0,0,1,0,0,0,0.8016069072824157,-0.20218212966252203,0.05001776198934281,0,0,1,0,0,0,0.8131689072824155,-0.202724129662522,0.05001776198934281,0,0,1,0,0,0,0.8246249072824154,-0.20288112966252203,0.05001776198934281,0,0,1,0,0,0,0.47831190728241557,0.15171787033747797,0.05001776198934281,0,0,1,0,0,0,0.5470769072824158,0.38618287033747795,0.05001776198934281,0,0,0.999969,0,0,0,0.47831190728241557,0.38618287033747795,0.05001776198934281,0,0,1,0,0,0,0.5470769072824158,-0.19376712966252202,0.05001776198934281,0,0,1,0,0,0,0.3560609072824157,0.202085870337478,0.05001776198934281,0,0,1,0,0,0,0.3744079072824156,0.20213187033747798,0.05001776198934281,0,0,1,0,0,0,0.3664639072824156,0.202255870337478,0.05001776198934281,0,0,1,0,0,0,0.38286190728241576,0.201676870337478,0.05001776198934281,0,0,1,0,0,0,0.3455829072824157,0.20151587033747798,0.05001776198934281,0,0,1,0,0,0,0.39174590728241565,0.200767870337478,0.05001776198934281,0,0,1,0,0,0,0.3350589072824157,0.200456870337478,0.05001776198934281,0,0,1,0,0,0,0.40098490728241565,0.19927987033747796,0.05001776198934281,0,0,0.999969,0,0,0,0.3245179072824156,0.19881887033747797,0.05001776198934281,0,0,1,0,0,0,0.4104999072824156,0.197089870337478,0.05001776198934281,0,0,1,0,0,0,0.31398790728241566,0.196514870337478,0.05001776198934281,0,0,1,0,0,0,0.42021290728241567,0.194074870337478,0.05001776198934281,0,0,1,0,0,0,0.30349790728241555,0.193452870337478,0.05001776198934281,0,0,1,0,0,0,0.43004690728241557,0.190109870337478,0.05001776198934281,0,0,0.999969,0,0,0,0.2930779072824157,0.189545870337478,0.05001776198934281,0,0,1,0,0,0,0.4399249072824156,0.185072870337478,0.05001776198934281,0,0,1,0,0,0,0.2827549072824156,0.18470387033747798,0.05001776198934281,0,0,1,0,0,0,0.44976690728241575,0.178837870337478,0.05001776198934281,0,0,1,0,0,0,0.2725589072824157,0.178837870337478,0.05001776198934281,0,0,1,0,0,0,0.26251790728241575,0.171858870337478,0.05001776198934281,0,0,1,0,0,0,0.4594979072824157,0.17128287033747797,0.05001776198934281,0,0,1,0,0,0,0.25266190728241567,0.16367687033747796,0.05001776198934281,0,0,1,0,0,0,0.4690389072824157,0.162283870337478,0.05001776198934281,0,0,1,0,0,0,0.24301790728241568,0.15420287033747798,0.05001776198934281,0,0,1,0,0,0,0.2370689072824157,0.147496870337478,0.05001776198934281,0,0,1,0,0,0,0.3846929072824157,0.14066087033747798,0.05001776198934281,0,0,1,0,0,0,0.3929879072824156,0.139761870337478,0.05001776198934281,0,0,1,0,0,0,0.4012999072824157,0.13818987033747798,0.05001776198934281,0,0,1,0,0,0,0.40963790728241567,0.135883870337478,0.05001776198934281,0,0,1,0,0,0,0.41801090728241563,0.13278387033747796,0.05001776198934281,0,0,1,0,0,0,0.4264269072824156,0.128829870337478,0.05001776198934281,0,0,0.999969,0,0,0,0.43489490728241575,0.12396087033747799,0.05001776198934281,0,0,1,0,0,0,0.4434229072824156,0.11811687033747797,0.05001776198934281,0,0,1,0,0,0,0.4520199072824156,0.111237870337478,0.05001776198934281,0,0,0.999969,0,0,0,0.4606949072824156,0.10326187033747797,0.05001776198934281,0,0,0.999969,0,0,0,0.4694559072824156,0.094129870337478,0.05001776198934281,0,0,0.999969,0,0,0,0.47831190728241557,0.083780870337478,0.05001776198934281,0,0,0.999969,0,0,0,0.23091190728241573,0.13976987033747795,0.05001776198934281,0,0,1,0,0,0,0.37640590728241574,0.140946870337478,0.05001776198934281,0,0,1,0,0,0,0.3692359072824156,0.14074587033747799,0.05001776198934281,0,0,1,0,0,0,0.3618459072824156,0.140095870337478,0.05001776198934281,0,0,1,0,0,0,0.35429590728241567,0.138927870337478,0.05001776198934281,0,0,1,0,0,0,0.22468690728241558,0.13096587033747797,0.05001776198934281,0,0,1,0,0,0,0.3466419072824156,0.137172870337478,0.05001776198934281,0,0,0.999969,0,0,0,0.3389419072824156,0.134761870337478,0.05001776198934281,0,0,1,0,0,0,0.33125290728241574,0.131626870337478,0.05001776198934281,0,0,1,0,0,0,0.3236339072824157,0.127696870337478,0.05001776198934281,0,0,1,0,0,0,0.21853090728241575,0.12103187033747798,0.05001776198934281,0,0,1,0,0,0,0.31614090728241573,0.12290387033747796,0.05001776198934281,0,0,1,0,0,0,0.3088319072824157,0.11717987033747795,0.05001776198934281,0,0,0.999969,0,0,0,0.21258190728241555,0.10991287033747799,0.05001776198934281,0,0,1,0,0,0,0.30176490728241556,0.110453870337478,0.05001776198934281,0,0,0.999969,0,0,0,0.2949969072824157,0.10265787033747797,0.05001776198934281,0,0,1,0,0,0,0.2069779072824156,0.09755387033747798,0.05001776198934281,0,0,1,0,0,0,0.2885849072824156,0.093722870337478,0.05001776198934281,0,0,1,0,0,0,0.20185690728241568,0.083900870337478,0.05001776198934281,0,0,1,0,0,0,0.28376190728241557,0.08548587033747795,0.05001776198934281,0,0,0.999969,0,0,0,0.27961390728241575,0.076983870337478,0.05001776198934281,0,0,1,0,0,0,0.19735790728241565,0.06889787033747796,0.05001776198934281,0,0,0.999969,0,0,0,0.47831190728241557,-0.07446312966252203,0.05001776198934281,0,0,0.999969,0,0,0,0.27609290728241564,0.06829787033747797,0.05001776198934281,0,0,1,0,0,0,0.19361790728241557,0.052491870337477986,0.05001776198934281,0,0,0.999969,0,0,0,0.27315090728241564,0.05950887033747798,0.05001776198934281,0,0,1,0,0,0,0.27073790728241565,0.050695870337477994,0.05001776198934281,0,0,1,0,0,0,0.19077590728241556,0.034626870337477994,0.05001776198934281,0,0,1,0,0,0,0.2688049072824157,0.04194087033747798,0.05001776198934281,0,0,1,0,0,0,0.2673039072824157,0.03332487033747797,0.05001776198934281,0,0,1,0,0,0,0.18896990728241558,0.015248870337477988,0.05001776198934281,0,0,1,0,0,0,0.2661849072824156,0.02492587033747798,0.05001776198934281,0,0,1,0,0,0,0.2653999072824156,0.016826870337477984,0.05001776198934281,0,0,1,0,0,0,0.26489990728241564,0.00910787033747798,0.05001776198934281,0,0,1,0,0,0,0.1883369072824157,-0.0056971296625220325,0.05001776198934281,0,0,0.999969,0,0,0,0.2646359072824156,0.0018488703374779925,0.05001776198934281,0,0,1,0,0,0,0.2645589072824157,-0.004869129662522009,0.05001776198934281,0,0,1,0,0,0,0.2646699072824157,-0.013059129662522012,0.05001776198934281,0,0,1,0,0,0,0.18858990728241576,-0.019187129662522007,0.05001776198934281,0,0,1,0,0,0,0.2650339072824157,-0.021443129662522015,0.05001776198934281,0,0,1,0,0,0,0.1893949072824157,-0.03270012966252203,0.05001776198934281,0,0,1,0,0,0,0.2656979072824157,-0.02997012966252202,0.05001776198934281,0,0,0.999969,0,0,0,0.26670690728241575,-0.03859212966252201,0.05001776198934281,0,0,0.999969,0,0,0,0.19082190728241555,-0.046190129662522006,0.05001776198934281,0,0,1,0,0,0,0.2681069072824156,-0.04726012966252202,0.05001776198934281,0,0,1,0,0,0,0.1929389072824157,-0.05961112966252202,0.05001776198934281,0,0,1,0,0,0,0.2699439072824157,-0.05592512966252203,0.05001776198934281,0,0,1,0,0,0,0.27226390728241556,-0.06453912966252201,0.05001776198934281,0,0,1,0,0,0,0.1958159072824157,-0.07291712966252202,0.05001776198934281,0,0,1,0,0,0,0.2751139072824156,-0.07305112966252202,0.05001776198934281,0,0,1,0,0,0,0.1995219072824157,-0.08606212966252202,0.05001776198934281,0,0,1,0,0,0,0.27853990728241573,-0.08141512966252203,0.05001776198934281,0,0,1,0,0,0,0.4739189072824157,-0.08047012966252202,0.05001776198934281,0,0,1,0,0,0,0.4694749072824156,-0.08606612966252201,0.05001776198934281,0,0,1,0,0,0,0.2825859072824157,-0.08957912966252202,0.05001776198934281,0,0,0.999969,0,0,0,0.2041239072824157,-0.09900012966252202,0.05001776198934281,0,0,1,0,0,0,0.46502990728241556,-0.09125312966252203,0.05001776198934281,0,0,1,0,0,0,0.2872999072824156,-0.09749612966252202,0.05001776198934281,0,0,0.999969,0,0,0,0.4606369072824157,-0.09603512966252202,0.05001776198934281,0,0,1,0,0,0,0.4563479072824157,-0.10041412966252201,0.05001776198934281,0,0,0.999969,0,0,0,0.2927279072824156,-0.10511712966252201,0.05001776198934281,0,0,1,0,0,0,0.20969390728241555,-0.11168412966252202,0.05001776198934281,0,0,1,0,0,0,0.4522139072824156,-0.10439312966252202,0.05001776198934281,0,0,1,0,0,0,0.4482869072824156,-0.10797512966252203,0.05001776198934281,0,0,0.999969,0,0,0,0.2974079072824156,-0.11070812966252203,0.05001776198934281,0,0,1,0,0,0,0.44461990728241574,-0.11116212966252202,0.05001776198934281,0,0,1,0,0,0,0.30234390728241567,-0.11587312966252201,0.05001776198934281,0,0,0.999969,0,0,0,0.44126190728241554,-0.11395912966252202,0.05001776198934281,0,0,1,0,0,0,0.21629890728241574,-0.12406912966252202,0.05001776198934281,0,0,1,0,0,0,0.4382679072824156,-0.11636712966252202,0.05001776198934281,0,0,0.999969,0,0,0,0.3075499072824157,-0.12060012966252202,0.05001776198934281,0,0,1,0,0,0,0.43568690728241566,-0.11839012966252202,0.05001776198934281,0,0,1,0,0,0,0.4335729072824157,-0.12003012966252202,0.05001776198934281,0,0,1,0,0,0,0.42823490728241564,-0.12376112966252202,0.05001776198934281,0,0,1,0,0,0,0.47831190728241557,-0.15234212966252203,0.05001776198934281,0,0,1,0,0,0,0.3130409072824156,-0.12487912966252201,0.05001776198934281,0,0,1,0,0,0,0.4229749072824156,-0.12709212966252204,0.05001776198934281,0,0,1,0,0,0,0.2240079072824157,-0.136110129662522,0.05001776198934281,0,0,1,0,0,0,0.3188319072824157,-0.128697129662522,0.05001776198934281,0,0,1,0,0,0,0.4177669072824157,-0.130037129662522,0.05001776198934281,0,0,1,0,0,0,0.3249359072824156,-0.13204412966252202,0.05001776198934281,0,0,1,0,0,0,0.41258390728241556,-0.13261112966252203,0.05001776198934281,0,0,1,0,0,0,0.3313679072824156,-0.13490712966252202,0.05001776198934281,0,0,0.999969,0,0,0,0.40740190728241554,-0.13482912966252203,0.05001776198934281,0,0,1,0,0,0,0.40219290728241575,-0.13670412966252202,0.05001776198934281,0,0,1,0,0,0,0.33814190728241567,-0.137276129662522,0.05001776198934281,0,0,0.999969,0,0,0,0.2328919072824156,-0.14775812966252203,0.05001776198934281,0,0,1,0,0,0,0.3969329072824157,-0.138251129662522,0.05001776198934281,0,0,1,0,0,0,0.34527290728241566,-0.13913812966252204,0.05001776198934281,0,0,1,0,0,0,0.39159490728241564,-0.13948512966252202,0.05001776198934281,0,0,1,0,0,0,0.35277490728241556,-0.14048212966252202,0.05001776198934281,0,0,0.999969,0,0,0,0.3861539072824156,-0.140419129662522,0.05001776198934281,0,0,1,0,0,0,0.3805829072824156,-0.14106912966252202,0.05001776198934281,0,0,1,0,0,0,0.36066190728241576,-0.141297129662522,0.05001776198934281,0,0,1,0,0,0,0.3748569072824157,-0.14144812966252202,0.05001776198934281,0,0,0.999969,0,0,0,0.3689499072824156,-0.14157112966252203,0.05001776198934281,0,0,0.999969,0,0,0,0.24301790728241568,-0.15897012966252203,0.05001776198934281,0,0,1,0,0,0,0.4687639072824157,-0.16273512966252202,0.05001776198934281,0,0,1,0,0,0,0.47831190728241557,-0.19376712966252202,0.05001776198934281,0,0,1,0,0,0,0.2515479072824156,-0.167144129662522,0.05001776198934281,0,0,0.999969,0,0,0,0.4588189072824156,-0.17162012966252202,0.05001776198934281,0,0,0.999969,0,0,0,0.26017090728241565,-0.174305129662522,0.05001776198934281,0,0,0.999969,0,0,0,0.44856290728241555,-0.17911312966252202,0.05001776198934281,0,0,1,0,0,0,0.26890790728241565,-0.18051112966252203,0.05001776198934281,0,0,0.999969,0,0,0,0.43808390728241564,-0.18532912966252202,0.05001776198934281,0,0,0.999969,0,0,0,0.27778390728241575,-0.185820129662522,0.05001776198934281,0,0,0.999969,0,0,0,0.4274649072824157,-0.19038212966252202,0.05001776198934281,0,0,1,0,0,0,0.2868209072824157,-0.190288129662522,0.05001776198934281,0,0,0.999969,0,0,0,0.29604190728241564,-0.19397412966252203,0.05001776198934281,0,0,1,0,0,0,0.41679590728241567,-0.19438812966252203,0.05001776198934281,0,0,0.999969,0,0,0,0.30546990728241563,-0.19693512966252202,0.05001776198934281,0,0,1,0,0,0,0.4061599072824156,-0.19746312966252202,0.05001776198934281,0,0,1,0,0,0,0.3151279072824156,-0.19922912966252201,0.05001776198934281,0,0,1,0,0,0,0.39564590728241567,-0.199720129662522,0.05001776198934281,0,0,1,0,0,0,0.3250389072824156,-0.200913129662522,0.05001776198934281,0,0,1,0,0,0,0.3853389072824156,-0.201275129662522,0.05001776198934281,0,0,1,0,0,0,0.33522690728241566,-0.20204412966252203,0.05001776198934281,0,0,1,0,0,0,0.37532490728241563,-0.20224412966252203,0.05001776198934281,0,0,1,0,0,0,0.3457139072824156,-0.20268112966252202,0.05001776198934281,0,0,1,0,0,0,0.36568990728241557,-0.20274112966252203,0.05001776198934281,0,0,0.999969,0,0,0,0.35652190728241573,-0.20288112966252203,0.05001776198934281,0,0,1,0,0,0,-0.029319092717584372,0.202182870337478,0.05001776198934281,0,0,1,0.15294117647058825,0.15294117647058825,0.15294117647058825,-0.01694309271758443,0.20218987033747798,0.05001776198934281,0,0,1,0,0,0,-0.02293109271758431,0.202255870337478,0.05001776198934281,0,0,0.999969,0.0196078431372549,0.0196078431372549,0.0196078431372549,-0.029319092717584372,0.202182870337478,0.05001776198934281,0,0,1,0,0,0,-0.010239092717584386,0.201933870337478,0.05001776198934281,0,0,1,0,0,0,-0.03565009271758446,0.20194587033747796,0.05001776198934281,0,0,0.999969,0,0,0,-0.04193509271758433,0.20151787033747798,0.05001776198934281,0,0,1,0,0,0,-0.002930092717584376,0.20140187033747797,0.05001776198934281,0,0,1,0,0,0,-0.04818509271758442,0.20087487033747797,0.05001776198934281,0,0,0.999969,0,0,0,0.004869907282415653,0.200506870337478,0.05001776198934281,0,0,1,0,0,0,-0.054412092717584404,0.19999087033747798,0.05001776198934281,0,0,1,0,0,0,0.01304990728241573,0.19916387033747796,0.05001776198934281,0,0,1,0,0,0,-0.0606280927175844,0.198838870337478,0.05001776198934281,0,0,1,0,0,0,0.0214969072824156,0.197284870337478,0.05001776198934281,0,0,0.999969,0,0,0,-0.06684309271758426,0.197392870337478,0.05001776198934281,0,0,1,0,0,0,-0.07307009271758425,0.19562787033747797,0.05001776198934281,0,0,1,0,0,0,0.03009990728241574,0.194784870337478,0.05001776198934281,0,0,1,0,0,0,-0.07932109271758425,0.19351787033747797,0.05001776198934281,0,0,1,0,0,0,0.03874590728241567,0.19157787033747797,0.05001776198934281,0,0,1,0,0,0,-0.08560509271758443,0.19103687033747796,0.05001776198934281,0,0,1,0,0,0,-0.21597209271758433,-0.19376712966252202,0.05001776198934281,0,0,1,0,0,0,-0.14720609271758445,0.19314287033747796,0.05001776198934281,0,0,1,0,0,0,-0.21597209271758433,0.19314287033747796,0.05001776198934281,0,0,1,0,0,0,-0.14720609271758445,0.14674687033747796,0.05001776198934281,0,0,1,0,0,0,0.04732290728241573,0.18757587033747797,0.05001776198934281,0,0,1,0,0,0,-0.0919360927175843,0.18815887033747797,0.05001776198934281,0,0,1,0,0,0,-0.09832409271758435,0.18485787033747797,0.05001776198934281,0,0,1,0,0,0,0.055718907282415575,0.18269387033747797,0.05001776198934281,0,0,1,0,0,0,-0.10442809271758424,0.18140187033747796,0.05001776198934281,0,0,0.999969,0,0,0,0.06382090728241563,0.176845870337478,0.05001776198934281,0,0,0.999969,0,0,0,-0.11028809271758444,0.177719870337478,0.05001776198934281,0,0,1,0,0,0,-0.11586509271758438,0.17389287033747797,0.05001776198934281,0,0,0.999969,0,0,0,0.0715179072824157,0.16994487033747796,0.05001776198934281,0,0,1,0,0,0,-0.12112409271758429,0.170005870337478,0.05001776198934281,0,0,1,0,0,0,-0.12602509271758433,0.16614187033747796,0.05001776198934281,0,0,1,0,0,0,0.07841890728241574,0.162204870337478,0.05001776198934281,0,0,1,0,0,0,-0.1305330927175843,0.162384870337478,0.05001776198934281,0,0,1,0,0,0,-0.13460909271758426,0.158816870337478,0.05001776198934281,0,0,0.999969,0,0,0,0.08426790728241573,0.15393787033747797,0.05001776198934281,0,0,0.999969,0,0,0,-0.13821509271758425,0.15552287033747797,0.05001776198934281,0,0,1,0,0,0,-0.14131609271758427,0.15258487033747797,0.05001776198934281,0,0,1,0,0,0,0.08914990728241556,0.145205870337478,0.05001776198934281,0,0,1,0,0,0,-0.14387309271758442,0.150087870337478,0.05001776198934281,0,0,1,0,0,0,-0.1458490927175844,0.14811387033747797,0.05001776198934281,0,0,1,0,0,0,-0.14720609271758445,0.06721087033747797,0.05001776198934281,0,0,1,0,0,0,-0.1442350927175844,0.071178870337478,0.05001776198934281,0,0,1,0,0,0,-0.14111509271758438,0.075203870337478,0.05001776198934281,0,0,1,0,0,0,-0.1378340927175843,0.07927587033747796,0.05001776198934281,0,0,1,0,0,0,-0.13438009271758444,0.08338187033747796,0.05001776198934281,0,0,1,0,0,0,-0.1307420927175844,0.08751087033747795,0.05001776198934281,0,0,1,0,0,0,-0.1269080927175843,0.09165087033747799,0.05001776198934281,0,0,1,0,0,0,-0.12286709271758434,0.09579187033747799,0.05001776198934281,0,0,1,0,0,0,-0.1186070927175844,0.09992087033747798,0.05001776198934281,0,0,1,0,0,0,-0.11411809271758444,0.10402687033747798,0.05001776198934281,0,0,1,0,0,0,-0.10938609271758426,0.108098870337478,0.05001776198934281,0,0,1,0,0,0,-0.10440209271758438,0.112123870337478,0.05001776198934281,0,0,1,0,0,0,-0.09915309271758432,0.11609187033747798,0.05001776198934281,0,0,0.999969,0,0,0,-0.09379709271758441,0.119887870337478,0.05001776198934281,0,0,1,0,0,0,-0.08847809271758433,0.12339887033747798,0.05001776198934281,0,0,1,0,0,0,-0.08316609271758435,0.12661687033747798,0.05001776198934281,0,0,1,0,0,0,-0.07782709271758437,0.12953187033747798,0.05001776198934281,0,0,1,0,0,0,-0.07243109271758441,0.132136870337478,0.05001776198934281,0,0,0.999969,0,0,0,-0.06694509271758431,0.13442287033747796,0.05001776198934281,0,0,1,0,0,0,-0.06133909271758431,0.136379870337478,0.05001776198934281,0,0,0.999969,0,0,0,-0.05558009271758424,0.138000870337478,0.05001776198934281,0,0,1,0,0,0,-0.04963709271758443,0.139276870337478,0.05001776198934281,0,0,1,0,0,0,-0.04347909271758432,0.14019887033747797,0.05001776198934281,0,0,1,0,0,0,-0.03707309271758441,0.14075887033747797,0.05001776198934281,0,0,1,0,0,0,-0.03038709271758444,0.140946870337478,0.05001776198934281,0,0,1,0,0,0,-0.02323709271758445,0.14067987033747797,0.05001776198934281,0,0,1,0,0,0,0.09315090728241571,0.13606787033747797,0.05001776198934281,0,0,1,0,0,0,-0.01668309271758428,0.13991487033747796,0.05001776198934281,0,0,1,0,0,0,-0.010698092717584373,0.138707870337478,0.05001776198934281,0,0,1,0,0,0,-0.005256092717584426,0.13711187033747796,0.05001776198934281,0,0,1,0,0,0,-0.0003330927175844156,0.13518187033747797,0.05001776198934281,0,0,1,0,0,0,0.09635890728241558,0.126584870337478,0.05001776198934281,0,0,1,0,0,0,0.004098907282415576,0.13297287033747796,0.05001776198934281,0,0,1,0,0,0,0.008063907282415572,0.130539870337478,0.05001776198934281,0,0,1,0,0,0,0.011589907282415712,0.12793687033747797,0.05001776198934281,0,0,1,0,0,0,0.014700907282415576,0.12521887033747797,0.05001776198934281,0,0,0.999969,0,0,0,0.09885890728241575,0.11681687033747801,0.05001776198934281,0,0,1,0,0,0,0.017423907282415607,0.122439870337478,0.05001776198934281,0,0,0.999969,0,0,0,0.019783907282415747,0.11965587033747799,0.05001776198934281,0,0,1,0,0,0,0.02180790728241555,0.116920870337478,0.05001776198934281,0,0,1,0,0,0,0.02398290728241559,0.11343487033747796,0.05001776198934281,0,0,1,0,0,0,0.10073690728241558,0.106824870337478,0.05001776198934281,0,0,1,0,0,0,0.025953907282415756,0.10960987033747799,0.05001776198934281,0,0,1,0,0,0,0.027723907282415583,0.10545087033747796,0.05001776198934281,0,0,1,0,0,0,0.10208090728241559,0.09666787033747798,0.05001776198934281,0,0,1,0,0,0,0.029294907282415572,0.100963870337478,0.05001776198934281,0,0,1,0,0,0,0.030670907282415616,0.096154870337478,0.05001776198934281,0,0,0.999969,0,0,0,0.10297490728241576,0.08640887033747796,0.05001776198934281,0,0,1,0,0,0,0.03185390728241555,0.091029870337478,0.05001776198934281,0,0,1,0,0,0,0.03284690728241557,0.085593870337478,0.05001776198934281,0,0,1,0,0,0,0.10350690728241574,0.07610487033747798,0.05001776198934281,0,0,1,0,0,0,0.033652907282415656,0.07985287033747795,0.05001776198934281,0,0,1,0,0,0,0.03427390728241564,0.07381287033747796,0.05001776198934281,0,0,1,0,0,0,0.10376290728241555,0.06581987033747799,0.05001776198934281,0,0,0.999969,0,0,0,0.03471490728241555,0.06747887033747796,0.05001776198934281,0,0,1,0,0,0,0.03497690728241576,0.06085787033747797,0.05001776198934281,0,0,1,0,0,0,-0.14720609271758445,-0.19376712966252202,0.05001776198934281,0,0,1,0,0,0,0.10382990728241559,0.05561187033747797,0.05001776198934281,0,0,1,0,0,0,0.03506390728241571,0.05395487033747798,0.05001776198934281,0,0,1,0,0,0,0.10382990728241559,-0.19376712966252202,0.05001776198934281,0,0,0.999969,0,0,0,0.03506390728241571,-0.19376712966252202,0.05001776198934281,0,0,1,0,0,0,-0.4935680927175844,0.202039870337478,0.05001776198934281,0,0,1,0,0,0,-0.4665000927175843,0.201917870337478,0.05001776198934281,0,0,1,0,0,0,-0.48109209271758435,0.202255870337478,0.05001776198934281,0,0,0.999969,0,0,0,-0.5061310927175844,0.20135487033747795,0.05001776198934281,0,0,1,0,0,0,-0.45294209271758434,0.20093287033747798,0.05001776198934281,0,0,1,0,0,0,-0.5187620927175843,0.200145870337478,0.05001776198934281,0,0,0.999969,0,0,0,-0.44037909271758435,0.199342870337478,0.05001776198934281,0,0,0.999969,0,0,0,-0.5314460927175844,0.19835887033747795,0.05001776198934281,0,0,1,0,0,0,-0.42877309271758435,0.19719287033747795,0.05001776198934281,0,0,1,0,0,0,-0.5441640927175844,0.19593887033747798,0.05001776198934281,0,0,1,0,0,0,-0.4180890927175843,0.194524870337478,0.05001776198934281,0,0,1,0,0,0,-0.5568990927175843,0.192831870337478,0.05001776198934281,0,0,1,0,0,0,-0.40828709271758434,0.191381870337478,0.05001776198934281,0,0,1,0,0,0,-0.5696350927175844,0.188981870337478,0.05001776198934281,0,0,1,0,0,0,-0.3993310927175844,0.18780787033747798,0.05001776198934281,0,0,1,0,0,0,-0.5823530927175844,0.184335870337478,0.05001776198934281,0,0,1,0,0,0,-0.39118409271758436,0.18384487033747798,0.05001776198934281,0,0,1,0,0,0,-0.5950360927175844,0.178837870337478,0.05001776198934281,0,0,1,0,0,0,-0.3838080927175843,0.179536870337478,0.05001776198934281,0,0,1,0,0,0,-0.37716509271758436,0.174926870337478,0.05001776198934281,0,0,1,0,0,0,-0.6076680927175844,0.17243387033747798,0.05001776198934281,0,0,1,0,0,0,-0.3712180927175843,0.170057870337478,0.05001776198934281,0,0,0.999969,0,0,0,-0.6202310927175844,0.16506887033747797,0.05001776198934281,0,0,1,0,0,0,-0.36593009271758437,0.16497387033747796,0.05001776198934281,0,0,1,0,0,0,-0.6327070927175843,0.15668887033747797,0.05001776198934281,0,0,1,0,0,0,-0.35906109271758435,0.15684287033747796,0.05001776198934281,0,0,1,0,0,0,-0.3533030927175843,0.148253870337478,0.05001776198934281,0,0,0.999969,0,0,0,-0.5987390927175843,0.10863587033747796,0.05001776198934281,0,0,1,0,0,0,-0.5942150927175843,0.11124387033747796,0.05001776198934281,0,0,0.999969,0,0,0,-0.5897520927175843,0.11369087033747799,0.05001776198934281,0,0,0.999969,0,0,0,-0.5853400927175844,0.11598887033747796,0.05001776198934281,0,0,1,0,0,0,-0.5809720927175843,0.11814787033747798,0.05001776198934281,0,0,0.999969,0,0,0,-0.5766380927175844,0.12018087033747799,0.05001776198934281,0,0,1,0,0,0,-0.5723300927175844,0.12209887033747796,0.05001776198934281,0,0,1,0,0,0,-0.5680400927175844,0.123912870337478,0.05001776198934281,0,0,1,0,0,0,-0.5637580927175844,0.125634870337478,0.05001776198934281,0,0,1,0,0,0,-0.5594760927175844,0.12727687033747798,0.05001776198934281,0,0,1,0,0,0,-0.5551850927175843,0.12884987033747797,0.05001776198934281,0,0,0.999969,0,0,0,-0.5508770927175843,0.13036487033747796,0.05001776198934281,0,0,0.999969,0,0,0,-0.5465430927175844,0.13183387033747795,0.05001776198934281,0,0,1,0,0,0,-0.5419500927175843,0.133263870337478,0.05001776198934281,0,0,1,0,0,0,-0.5372800927175844,0.13464487033747796,0.05001776198934281,0,0,1,0,0,0,-0.5325230927175844,0.135962870337478,0.05001776198934281,0,0,1,0,0,0,-0.5276720927175843,0.137203870337478,0.05001776198934281,0,0,1,0,0,0,-0.5227170927175844,0.13835187033747798,0.05001776198934281,0,0,1,0,0,0,-0.5176490927175843,0.13939387033747797,0.05001776198934281,0,0,1,0,0,0,-0.5124610927175843,0.14031487033747797,0.05001776198934281,0,0,1,0,0,0,-0.5071430927175844,0.14110087033747798,0.05001776198934281,0,0,0.999969,0,0,0,-0.5016880927175843,0.141736870337478,0.05001776198934281,0,0,1,0,0,0,-0.4960850927175844,0.14220887033747798,0.05001776198934281,0,0,1,0,0,0,-0.4903280927175844,0.142502870337478,0.05001776198934281,0,0,1,0,0,0,-0.4844060927175844,0.14260387033747796,0.05001776198934281,0,0,1,0,0,0,-0.4795140927175844,0.14253087033747797,0.05001776198934281,0,0,0.999969,0,0,0,-0.3485570927175844,0.13930287033747796,0.05001776198934281,0,0,1,0,0,0,-0.4744060927175844,0.142292870337478,0.05001776198934281,0,0,1,0,0,0,-0.46914309271758436,0.141865870337478,0.05001776198934281,0,0,1,0,0,0,-0.4637850927175844,0.141222870337478,0.05001776198934281,0,0,0.999969,0,0,0,-0.4583930927175843,0.140338870337478,0.05001776198934281,0,0,1,0,0,0,-0.4530260927175843,0.139186870337478,0.05001776198934281,0,0,1,0,0,0,-0.34472609271758436,0.13008487033747795,0.05001776198934281,0,0,1,0,0,0,-0.44774609271758437,0.137740870337478,0.05001776198934281,0,0,1,0,0,0,-0.4426120927175844,0.135975870337478,0.05001776198934281,0,0,1,0,0,0,-0.4376860927175843,0.133865870337478,0.05001776198934281,0,0,1,0,0,0,-0.4330270927175843,0.13138487033747798,0.05001776198934281,0,0,1,0,0,0,-0.42869609271758435,0.12850687033747799,0.05001776198934281,0,0,1,0,0,0,-0.3417130927175843,0.12069387033747797,0.05001776198934281,0,0,1,0,0,0,-0.42475409271758435,0.125205870337478,0.05001776198934281,0,0,1,0,0,0,-0.42055009271758437,0.12079887033747799,0.05001776198934281,0,0,0.999969,0,0,0,-0.41701309271758435,0.11590787033747796,0.05001776198934281,0,0,1,0,0,0,-0.3394180927175844,0.11122487033747797,0.05001776198934281,0,0,1,0,0,0,-0.41408709271758437,0.11060287033747795,0.05001776198934281,0,0,1,0,0,0,-0.33774509271758435,0.101772870337478,0.05001776198934281,0,0,1,0,0,0,-0.41171209271758435,0.10495287033747797,0.05001776198934281,0,0,1,0,0,0,-0.4098330927175844,0.09902687033747798,0.05001776198934281,0,0,1,0,0,0,-0.33659509271758437,0.09243387033747796,0.05001776198934281,0,0,0.999969,0,0,0,-0.40839109271758434,0.09289387033747798,0.05001776198934281,0,0,1,0,0,0,-0.4073280927175843,0.08662287033747795,0.05001776198934281,0,0,1,0,0,0,-0.3358710927175843,0.08330187033747799,0.05001776198934281,0,0,0.999969,0,0,0,-0.40658809271758434,0.080282870337478,0.05001776198934281,0,0,1,0,0,0,-0.33547509271758436,0.07447187033747799,0.05001776198934281,0,0,1,0,0,0,-0.4061120927175843,0.07394187033747796,0.05001776198934281,0,0,1,0,0,0,-0.33530909271758436,0.06603787033747799,0.05001776198934281,0,0,1,0,0,0,-0.40584409271758437,0.06767087033747798,0.05001776198934281,0,0,1,0,0,0,-0.4057250927175844,0.061537870337477985,0.05001776198934281,0,0,1,0,0,0,-0.3352760927175843,0.05809687033747796,0.05001776198934281,0,0,1,0,0,0,-0.4056980927175844,0.05561187033747797,0.05001776198934281,0,0,1,0,0,0,-0.3352760927175843,-0.07612012966252202,0.05001776198934281,0,0,0.999969,0,0,0,-0.4056980927175844,0.05146887033747799,0.05001776198934281,0,0,1,0,0,0,-0.4140060927175844,0.05141687033747799,0.05001776198934281,0,0,0.999969,0,0,0,-0.4227250927175843,0.05126187033747798,0.05001776198934281,0,0,1,0,0,0,-0.4317830927175843,0.05100287033747797,0.05001776198934281,0,0,0.999969,0,0,0,-0.44110909271758436,0.05064087033747797,0.05001776198934281,0,0,1,0,0,0,-0.45063009271758436,0.05017487033747797,0.05001776198934281,0,0,1,0,0,0,-0.4602760927175843,0.049604870337477985,0.05001776198934281,0,0,1,0,0,0,-0.40404109271758437,-0.0056971296625220325,0.05001776198934281,0,0,1,0,0,0,-0.46997309271758436,0.04893187033747798,0.05001776198934281,0,0,0.999969,0,0,0,-0.4796500927175843,0.04815487033747798,0.05001776198934281,0,0,1,0,0,0,-0.48923409271758433,0.04727487033747799,0.05001776198934281,0,0,0.999969,0,0,0,-0.49865509271758435,0.046290870337477974,0.05001776198934281,0,0,0.999969,0,0,0,-0.5078400927175843,0.04520387033747797,0.05001776198934281,0,0,1,0,0,0,-0.5167170927175844,0.04401287033747797,0.05001776198934281,0,0,0.999969,0,0,0,-0.5241690927175844,0.04284687033747797,0.05001776198934281,0,0,1,0,0,0,-0.5323550927175843,0.041380870337477976,0.05001776198934281,0,0,0.999969,0,0,0,-0.5411450927175844,0.039558870337477986,0.05001776198934281,0,0,1,0,0,0,-0.5504100927175843,0.03732287033747797,0.05001776198934281,0,0,1,0,0,0,-0.5600190927175843,0.03461487033747798,0.05001776198934281,0,0,1,0,0,0,-0.5698450927175843,0.03137787033747799,0.05001776198934281,0,0,1,0,0,0,-0.5797570927175844,0.02755387033747797,0.05001776198934281,0,0,0.999969,0,0,0,-0.5896250927175843,0.02308487033747797,0.05001776198934281,0,0,1,0,0,0,-0.5993210927175844,0.01791487033747799,0.05001776198934281,0,0,0.999969,0,0,0,-0.6087150927175844,0.01198487033747797,0.05001776198934281,0,0,1,0,0,0,-0.6176780927175843,0.005237870337477968,0.05001776198934281,0,0,0.999969,0,0,0,-0.6260790927175843,-0.002383129662522021,0.05001776198934281,0,0,1,0,0,0,-0.6302280927175844,-0.006734129662522015,0.05001776198934281,0,0,1,0,0,0,-0.40678909271758434,-0.00575012966252203,0.05001776198934281,0,0,1,0,0,0,-0.40404109271758437,-0.08191912966252202,0.05001776198934281,0,0,1,0,0,0,-0.4115240927175844,-0.005912129662522025,0.05001776198934281,0,0,1,0,0,0,-0.4179570927175843,-0.006189129662522025,0.05001776198934281,0,0,1,0,0,0,-0.42579709271758437,-0.006587129662522007,0.05001776198934281,0,0,1,0,0,0,-0.43475309271758433,-0.007112129662522032,0.05001776198934281,0,0,1,0,0,0,-0.6343490927175843,-0.011508129662522015,0.05001776198934281,0,0,1,0,0,0,-0.4445340927175844,-0.007769129662522023,0.05001776198934281,0,0,1,0,0,0,-0.4548510927175844,-0.008564129662522013,0.05001776198934281,0,0,1,0,0,0,-0.4654120927175843,-0.009502129662522008,0.05001776198934281,0,0,1,0,0,0,-0.47592609271758435,-0.010591129662522014,0.05001776198934281,0,0,1,0,0,0,-0.4861050927175844,-0.011834129662522008,0.05001776198934281,0,0,1,0,0,0,-0.6383770927175844,-0.01671412966252203,0.05001776198934281,0,0,1,0,0,0,-0.4956560927175844,-0.013239129662522026,0.05001776198934281,0,0,0.999969,0,0,0,-0.5042900927175843,-0.014811129662522016,0.05001776198934281,0,0,1,0,0,0,-0.5097520927175844,-0.015950129662522017,0.05001776198934281,0,0,1,0,0,0,-0.5153320927175844,-0.017293129662522028,0.05001776198934281,0,0,1,0,0,0,-0.6422500927175844,-0.022359129662522015,0.05001776198934281,0,0,1,0,0,0,-0.5209760927175844,-0.018837129662522017,0.05001776198934281,0,0,0.999969,0,0,0,-0.5266280927175844,-0.020580129662522012,0.05001776198934281,0,0,1,0,0,0,-0.5322350927175844,-0.022518129662522007,0.05001776198934281,0,0,0.999969,0,0,0,-0.6459050927175843,-0.028454129662522032,0.05001776198934281,0,0,1,0,0,0,-0.5377400927175844,-0.02464912966252203,0.05001776198934281,0,0,1,0,0,0,-0.5430910927175844,-0.02697012966252202,0.05001776198934281,0,0,0.999969,0,0,0,-0.5482310927175843,-0.02947812966252203,0.05001776198934281,0,0,1,0,0,0,-0.6492770927175844,-0.035006129662522006,0.05001776198934281,0,0,1,0,0,0,-0.5531060927175844,-0.03217112966252203,0.05001776198934281,0,0,1,0,0,0,-0.5576630927175843,-0.03504412966252202,0.05001776198934281,0,0,1,0,0,0,-0.6523040927175844,-0.04202312966252203,0.05001776198934281,0,0,1,0,0,0,-0.5618450927175843,-0.038096129662522016,0.05001776198934281,0,0,0.999969,0,0,0,-0.5655990927175844,-0.04132312966252202,0.05001776198934281,0,0,1,0,0,0,-0.5678880927175843,-0.04353212966252201,0.05001776198934281,0,0,1,0,0,0,-0.6549230927175843,-0.04951612966252203,0.05001776198934281,0,0,1,0,0,0,-0.5701750927175844,-0.046014129662522024,0.05001776198934281,0,0,1,0,0,0,-0.5724210927175843,-0.04876612966252203,0.05001776198934281,0,0,1,0,0,0,-0.5745900927175843,-0.051787129662522025,0.05001776198934281,0,0,1,0,0,0,-0.6570700927175843,-0.05749212966252201,0.05001776198934281,0,0,1,0,0,0,-0.5766430927175843,-0.055071129662522006,0.05001776198934281,0,0,1,0,0,0,-0.5785440927175843,-0.05861812966252203,0.05001776198934281,0,0,1,0,0,0,-0.6586820927175844,-0.06595912966252201,0.05001776198934281,0,0,0.999969,0,0,0,-0.5802550927175844,-0.06242312966252203,0.05001776198934281,0,0,1,0,0,0,-0.5817390927175844,-0.06648512966252201,0.05001776198934281,0,0,1,0,0,0,-0.6596960927175843,-0.07492812966252202,0.05001776198934281,0,0,1,0,0,0,-0.5829580927175844,-0.07079912966252203,0.05001776198934281,0,0,1,0,0,0,-0.5838760927175843,-0.07536412966252203,0.05001776198934281,0,0,1,0,0,0,-0.6600480927175844,-0.08440512966252202,0.05001776198934281,0,0,1,0,0,0,-0.5844530927175844,-0.08017712966252202,0.05001776198934281,0,0,1,0,0,0,-0.3353020927175844,-0.08102612966252203,0.05001776198934281,0,0,1,0,0,0,-0.5846540927175844,-0.08523312966252201,0.05001776198934281,0,0,1,0,0,0,-0.33535209271758437,-0.08616512966252202,0.05001776198934281,0,0,1,0,0,0,-0.4083660927175844,-0.08672712966252202,0.05001776198934281,0,0,1,0,0,0,-0.6596950927175843,-0.09429612966252202,0.05001776198934281,0,0,1,0,0,0,-0.5844550927175843,-0.09043112966252202,0.05001776198934281,0,0,1,0,0,0,-0.33537909271758437,-0.09146012966252202,0.05001776198934281,0,0,1,0,0,0,-0.41302809271758434,-0.09158912966252201,0.05001776198934281,0,0,0.999969,0,0,0,-0.5838870927175843,-0.09526012966252202,0.05001776198934281,0,0,1,0,0,0,-0.3353370927175844,-0.09683212966252203,0.05001776198934281,0,0,1,0,0,0,-0.4179830927175844,-0.09645712966252203,0.05001776198934281,0,0,1,0,0,0,-0.6586780927175844,-0.10367112966252202,0.05001776198934281,0,0,1,0,0,0,-0.5829970927175844,-0.09973212966252203,0.05001776198934281,0,0,1,0,0,0,-0.4231890927175843,-0.10128212966252202,0.05001776198934281,0,0,1,0,0,0,-0.3351800927175843,-0.10220512966252202,0.05001776198934281,0,0,1,0,0,0,-0.5818310927175844,-0.10385912966252202,0.05001776198934281,0,0,1,0,0,0,-0.4286010927175844,-0.10601512966252202,0.05001776198934281,0,0,1,0,0,0,-0.33486109271758435,-0.10749912966252202,0.05001776198934281,0,0,1,0,0,0,-0.6570570927175844,-0.11253512966252202,0.05001776198934281,0,0,1,0,0,0,-0.5804350927175843,-0.10765312966252202,0.05001776198934281,0,0,1,0,0,0,-0.43417809271758434,-0.11060612966252202,0.05001776198934281,0,0,1,0,0,0,-0.33433609271758435,-0.11263912966252201,0.05001776198934281,0,0,1,0,0,0,-0.5788550927175844,-0.11112412966252203,0.05001776198934281,0,0,1,0,0,0,-0.4398750927175843,-0.11500812966252202,0.05001776198934281,0,0,0.999969,0,0,0,-0.5771360927175844,-0.11428512966252202,0.05001776198934281,0,0,1,0,0,0,-0.6548930927175843,-0.12089012966252202,0.05001776198934281,0,0,1,0,0,0,-0.3335570927175844,-0.11754512966252202,0.05001776198934281,0,0,1,0,0,0,-0.5753260927175844,-0.11714612966252202,0.05001776198934281,0,0,1,0,0,0,-0.4456500927175844,-0.11917112966252202,0.05001776198934281,0,0,1,0,0,0,-0.5734690927175844,-0.11972012966252202,0.05001776198934281,0,0,1,0,0,0,-0.33247909271758436,-0.12214112966252202,0.05001776198934281,0,0,0.999969,0,0,0,-0.45146009271758436,-0.12304712966252201,0.05001776198934281,0,0,1,0,0,0,-0.5716130927175843,-0.12201712966252203,0.05001776198934281,0,0,1,0,0,0,-0.6522450927175844,-0.12873812966252202,0.05001776198934281,0,0,1,0,0,0,-0.5698030927175843,-0.12405012966252202,0.05001776198934281,0,0,1,0,0,0,-0.3310560927175843,-0.126348129662522,0.05001776198934281,0,0,1,0,0,0,-0.4572610927175843,-0.12658612966252203,0.05001776198934281,0,0,1,0,0,0,-0.5680840927175843,-0.12583012966252202,0.05001776198934281,0,0,1,0,0,0,-0.5642580927175843,-0.12911512966252203,0.05001776198934281,0,0,1,0,0,0,-0.3292420927175843,-0.130089129662522,0.05001776198934281,0,0,1,0,0,0,-0.4630100927175843,-0.12973912966252202,0.05001776198934281,0,0,0.999969,0,0,0,-0.6491740927175843,-0.136083129662522,0.05001776198934281,0,0,1,0,0,0,-0.5602560927175844,-0.131948129662522,0.05001776198934281,0,0,0.999969,0,0,0,-0.46866409271758436,-0.13245812966252202,0.05001776198934281,0,0,1,0,0,0,-0.3269910927175843,-0.133286129662522,0.05001776198934281,0,0,0.999969,0,0,0,-0.5561100927175844,-0.134361129662522,0.05001776198934281,0,0,1,0,0,0,-0.47299609271758436,-0.134220129662522,0.05001776198934281,0,0,1,0,0,0,-0.32540609271758436,-0.135063129662522,0.05001776198934281,0,0,1,0,0,0,-0.4772910927175843,-0.135783129662522,0.05001776198934281,0,0,1,0,0,0,-0.5518520927175844,-0.136386129662522,0.05001776198934281,0,0,1,0,0,0,-0.3235650927175844,-0.136662129662522,0.05001776198934281,0,0,0.999969,0,0,0,-0.4815450927175844,-0.13715712966252203,0.05001776198934281,0,0,1,0,0,0,-0.6457400927175844,-0.14292712966252202,0.05001776198934281,0,0,1,0,0,0,-0.5475130927175843,-0.138054129662522,0.05001776198934281,0,0,1,0,0,0,-0.3214890927175843,-0.13807612966252203,0.05001776198934281,0,0,1,0,0,0,-0.48575609271758435,-0.13835012966252203,0.05001776198934281,0,0,0.999969,0,0,0,-0.5431260927175844,-0.13939712966252202,0.05001776198934281,0,0,1,0,0,0,-0.31919709271758434,-0.139301129662522,0.05001776198934281,0,0,0.999969,0,0,0,-0.48992109271758433,-0.13936912966252202,0.05001776198934281,0,0,1,0,0,0,-0.3167090927175843,-0.140330129662522,0.05001776198934281,0,0,1,0,0,0,-0.49403709271758434,-0.140225129662522,0.05001776198934281,0,0,1,0,0,0,-0.5387210927175844,-0.140446129662522,0.05001776198934281,0,0,0.999969,0,0,0,-0.4981010927175843,-0.14092612966252202,0.05001776198934281,0,0,1,0,0,0,-0.3140450927175843,-0.14115712966252203,0.05001776198934281,0,0,1,0,0,0,-0.5343300927175844,-0.14123412966252202,0.05001776198934281,0,0,1,0,0,0,-0.5021110927175844,-0.14147912966252202,0.05001776198934281,0,0,1,0,0,0,-0.3112270927175843,-0.141778129662522,0.05001776198934281,0,0,1,0,0,0,-0.5299860927175843,-0.14179212966252203,0.05001776198934281,0,0,0.999969,0,0,0,-0.5060630927175843,-0.14189512966252202,0.05001776198934281,0,0,1,0,0,0,-0.29880109271758437,-0.14207312966252203,0.05001776198934281,0,0,1,0,0,0,-0.3054500927175844,-0.20039512966252201,0.05001776198934281,0,0,1,0,0,0,-0.2955080927175844,-0.14157112966252203,0.05001776198934281,0,0,1,0,0,0,-0.3082730927175843,-0.142185129662522,0.05001776198934281,0,0,1,0,0,0,-0.5257190927175843,-0.14215112966252202,0.05001776198934281,0,0,1,0,0,0,-0.5099550927175843,-0.14218112966252203,0.05001776198934281,0,0,1,0,0,0,-0.30204009271758436,-0.14233912966252202,0.05001776198934281,0,0,0.999969,0,0,0,-0.5215620927175844,-0.14234312966252202,0.05001776198934281,0,0,1,0,0,0,-0.5137830927175844,-0.14234712966252203,0.05001776198934281,0,0,1,0,0,0,-0.3052040927175843,-0.14237412966252203,0.05001776198934281,0,0,1,0,0,0,-0.5175460927175843,-0.14240012966252202,0.05001776198934281,0,0,1,0,0,0,-0.3982420927175844,-0.146542129662522,0.05001776198934281,0,0,1,0,0,0,-0.6420050927175843,-0.149273129662522,0.05001776198934281,0,0,1,0,0,0,-0.4014820927175844,-0.14991912966252202,0.05001776198934281,0,0,1,0,0,0,-0.3970880927175844,-0.150681129662522,0.05001776198934281,0,0,0.999969,0,0,0,-0.6380280927175843,-0.155125129662522,0.05001776198934281,0,0,1,0,0,0,-0.4049730927175843,-0.153397129662522,0.05001776198934281,0,0,1,0,0,0,-0.3957060927175844,-0.154793129662522,0.05001776198934281,0,0,1,0,0,0,-0.40868809271758433,-0.15693812966252202,0.05001776198934281,0,0,1,0,0,0,-0.3941120927175843,-0.15885312966252202,0.05001776198934281,0,0,1,0,0,0,-0.6338690927175844,-0.160485129662522,0.05001776198934281,0,0,0.999969,0,0,0,-0.4126020927175843,-0.16050412966252203,0.05001776198934281,0,0,1,0,0,0,-0.39231909271758436,-0.16283612966252203,0.05001776198934281,0,0,1,0,0,0,-0.6295900927175844,-0.16535612966252203,0.05001776198934281,0,0,1,0,0,0,-0.41668909271758436,-0.164059129662522,0.05001776198934281,0,0,1,0,0,0,-0.3903430927175844,-0.16671612966252203,0.05001776198934281,0,0,1,0,0,0,-0.4209220927175843,-0.16756612966252202,0.05001776198934281,0,0,1,0,0,0,-0.6252510927175844,-0.16974012966252203,0.05001776198934281,0,0,1,0,0,0,-0.3881960927175844,-0.17046512966252203,0.05001776198934281,0,0,0.999969,0,0,0,-0.4252760927175844,-0.17098612966252202,0.05001776198934281,0,0,1,0,0,0,-0.6178700927175843,-0.17631012966252202,0.05001776198934281,0,0,1,0,0,0,-0.38589409271758435,-0.17406012966252202,0.05001776198934281,0,0,1,0,0,0,-0.4297250927175843,-0.17428212966252202,0.05001776198934281,0,0,1,0,0,0,-0.3834510927175844,-0.17747312966252202,0.05001776198934281,0,0,1,0,0,0,-0.4342430927175843,-0.17741712966252202,0.05001776198934281,0,0,1,0,0,0,-0.6102530927175843,-0.18197612966252202,0.05001776198934281,0,0,1,0,0,0,-0.43880409271758436,-0.180354129662522,0.05001776198934281,0,0,0.999969,0,0,0,-0.38088209271758433,-0.18067912966252203,0.05001776198934281,0,0,1,0,0,0,-0.44338209271758433,-0.18305512966252202,0.05001776198934281,0,0,1,0,0,0,-0.37820009271758437,-0.183652129662522,0.05001776198934281,0,0,0.999969,0,0,0,-0.6024410927175844,-0.18680212966252202,0.05001776198934281,0,0,1,0,0,0,-0.4479520927175843,-0.18548212966252203,0.05001776198934281,0,0,1,0,0,0,-0.3754210927175844,-0.18636712966252203,0.05001776198934281,0,0,0.999969,0,0,0,-0.45287209271758433,-0.18791312966252202,0.05001776198934281,0,0,1,0,0,0,-0.37255809271758433,-0.18879612966252202,0.05001776198934281,0,0,1,0,0,0,-0.5944730927175843,-0.19085212966252202,0.05001776198934281,0,0,1,0,0,0,-0.45811209271758435,-0.19022312966252203,0.05001776198934281,0,0,1,0,0,0,-0.3686110927175843,-0.19158712966252203,0.05001776198934281,0,0,1,0,0,0,-0.46368009271758437,-0.192395129662522,0.05001776198934281,0,0,1,0,0,0,-0.5863910927175844,-0.19418812966252202,0.05001776198934281,0,0,1,0,0,0,-0.36425009271758435,-0.194143129662522,0.05001776198934281,0,0,1,0,0,0,-0.4695850927175843,-0.19441112966252203,0.05001776198934281,0,0,1,0,0,0,-0.35950909271758436,-0.19643412966252202,0.05001776198934281,0,0,1,0,0,0,-0.5782330927175844,-0.19687412966252202,0.05001776198934281,0,0,1,0,0,0,-0.4758350927175844,-0.196255129662522,0.05001776198934281,0,0,1,0,0,0,-0.4824380927175843,-0.19791012966252203,0.05001776198934281,0,0,1,0,0,0,-0.3544230927175843,-0.19843112966252202,0.05001776198934281,0,0,1,0,0,0,-0.5700410927175843,-0.198973129662522,0.05001776198934281,0,0,1,0,0,0,-0.48940409271758434,-0.19935712966252203,0.05001776198934281,0,0,1,0,0,0,-0.34902609271758434,-0.20010612966252203,0.05001776198934281,0,0,1,0,0,0,-0.5618550927175844,-0.20054812966252203,0.05001776198934281,0,0,0.999969,0,0,0,-0.4967410927175844,-0.20057912966252203,0.05001776198934281,0,0,0.999969,0,0,0,-0.3433530927175843,-0.20143112966252202,0.05001776198934281,0,0,1,0,0,0,-0.31205509271758436,-0.201781129662522,0.05001776198934281,0,0,1,0,0,0,-0.5537150927175843,-0.201664129662522,0.05001776198934281,0,0,0.999969,0,0,0,-0.5044580927175843,-0.20156012966252201,0.05001776198934281,0,0,1,0,0,0,-0.3374390927175843,-0.20237512966252202,0.05001776198934281,0,0,1,0,0,0,-0.5125630927175844,-0.20228212966252201,0.05001776198934281,0,0,1,0,0,0,-0.5456610927175843,-0.20238212966252203,0.05001776198934281,0,0,1,0,0,0,-0.3185900927175843,-0.20264312966252201,0.05001776198934281,0,0,1,0,0,0,-0.5210650927175844,-0.20272812966252202,0.05001776198934281,0,0,1,0,0,0,-0.33131709271758436,-0.202911129662522,0.05001776198934281,0,0,1,0,0,0,-0.5377340927175843,-0.20276612966252203,0.05001776198934281,0,0,0.999969,0,0,0,-0.32502309271758434,-0.20301012966252202,0.05001776198934281,0,0,1,0,0,0,-0.5299730927175843,-0.20288112966252203,0.05001776198934281,0,0,1,0,0,0,-0.9806770927175843,0.028270870337477993,0.05001776198934281,0,0,1,1,0,0.00784313725490196,-1.0941820927175843,0.38618287033747795,0.05001776198934281,0,0,1,1,0,0.00784313725490196,-1.1836600927175844,0.38618287033747795,0.05001776198934281,0,0,1,1,0,0.00784313725490196,-0.9409090927175843,0.106978870337478,0.05001776198934281,0,0,1,1,0,0.00784313725490196,-0.6981590927175844,0.38618287033747795,0.05001776198934281,0,0,0.999969,1,0,0.00784313725490196,-0.7876370927175844,0.38618287033747795,0.05001776198934281,0,0,1,1,0,0.00784313725490196,-0.9011410927175844,0.028270870337477993,0.05001776198934281,0,0,0.999969,1,0,0.00784313725490196,-0.9806770927175843,-0.19376712966252202,0.05001776198934281,0,0,1,1,0,0.00784313725490196,-0.9011410927175844,-0.19376712966252202,0.05001776198934281,0,0,1,1,0,0.00784313725490196,1.1303419072824155,0.19314287033747796,-0.049982238010657196,0,0,-1,0,0,0,1.1800519072824156,0.011700870337477992,-0.049982238010657196,0,0,-1,0,0,0,1.0458339072824154,0.19314287033747796,-0.049982238010657196,0,0,-1,0,0,0,1.2214769072824159,0.065553870337478,-0.049982238010657196,0,0,-1,0,0,0,1.3971189072824157,0.19314287033747796,-0.049982238010657196,0,0,-1,0,0,0,1.3126119072824158,0.19314287033747796,-0.049982238010657196,0,0,-1,0,0,0,1.2637299072824155,0.011700870337477992,-0.049982238010657196,0,0,-1,0,0,0,1.0276079072824156,-0.19376712966252202,-0.049982238010657196,0,0,-1,0,0,0,1.2214769072824159,-0.04132312966252202,-0.049982238010657196,0,0,-1,0,0,0,1.4153459072824157,-0.19376712966252202,-0.049982238010657196,0,0,-1,0,0,0,1.1121149072824155,-0.19376712966252202,-0.049982238010657196,0,0,-1,0,0,0,1.3308389072824158,-0.19376712966252202,-0.049982238010657196,0,0,-1,0,0,0,0.8445119072824157,0.19969487033747796,-0.049982238010657196,0,0,-0.999969,0,0,0,0.7827109072824157,0.20007987033747798,-0.049982238010657196,0,0,-1,0,0,0,0.8121979072824157,0.202255870337478,-0.049982238010657196,0,0,-1,0,0,0,0.7559549072824157,0.19382487033747797,-0.049982238010657196,0,0,-1,0,0,0,0.8728389072824156,0.19239487033747799,-0.049982238010657196,0,0,-1,0,0,0,0.7318979072824157,0.18389987033747796,-0.049982238010657196,0,0,-1,0,0,0,0.8974039072824156,0.18093487033747796,-0.049982238010657196,0,0,-1,0,0,0,0.7105069072824157,0.17071187033747798,-0.049982238010657196,0,0,-1,0,0,0,0.9184299072824156,0.165893870337478,-0.049982238010657196,0,0,-1,0,0,0,0.6917509072824157,0.15466987033747798,-0.049982238010657196,0,0,-0.999969,0,0,0,0.9361419072824155,0.14784987033747798,-0.049982238010657196,0,0,-1,0,0,0,0.8113689072824157,0.14260387033747796,-0.049982238010657196,0,0,-1,0,0,0,0.6755979072824156,0.136182870337478,-0.049982238010657196,0,0,-1,0,0,0,0.8225149072824158,0.14191487033747796,-0.049982238010657196,0,0,-1,0,0,0,0.9507649072824158,0.12738087033747797,-0.049982238010657196,0,0,-0.999969,0,0,0,0.7994759072824156,0.141898870337478,-0.049982238010657196,0,0,-1,0,0,0,0.8335009072824158,0.13985387033747798,-0.049982238010657196,0,0,-1,0,0,0,0.7878909072824156,0.13979587033747798,-0.049982238010657196,0,0,-1,0,0,0,0.8441979072824157,0.13642887033747797,-0.049982238010657196,0,0,-0.999969,0,0,0,0.7767139072824156,0.13631287033747796,-0.049982238010657196,0,0,-1,0,0,0,0.8544819072824157,0.131649870337478,-0.049982238010657196,0,0,-1,0,0,0,0.7660469072824156,0.131464870337478,-0.049982238010657196,0,0,-1,0,0,0,0.6620179072824157,0.11565987033747799,-0.049982238010657196,0,0,-1,0,0,0,0.8642239072824158,0.12552387033747797,-0.049982238010657196,0,0,-1,0,0,0,0.7559889072824157,0.125271870337478,-0.049982238010657196,0,0,-1,0,0,0,0.9625219072824156,0.105063870337478,-0.049982238010657196,0,0,-1,0,0,0,0.8732989072824155,0.118059870337478,-0.049982238010657196,0,0,-1,0,0,0,0.7466419072824158,0.117748870337478,-0.049982238010657196,0,0,-1,0,0,0,0.8815809072824154,0.109266870337478,-0.049982238010657196,0,0,-1,0,0,0,0.7381069072824156,0.10891487033747799,-0.049982238010657196,0,0,-1,0,0,0,0.6509769072824156,0.09350787033747798,-0.049982238010657196,0,0,-1,0,0,0,0.8889409072824157,0.09915387033747797,-0.049982238010657196,0,0,-1,0,0,0,0.7304829072824157,0.09878587033747799,-0.049982238010657196,0,0,-1,0,0,0,0.9716379072824157,0.08147887033747797,-0.049982238010657196,0,0,-1,0,0,0,0.8952549072824159,0.087728870337478,-0.049982238010657196,0,0,-1,0,0,0,0.7238719072824156,0.08737887033747799,-0.049982238010657196,0,0,-1,0,0,0,0.6424459072824156,0.07013587033747798,-0.049982238010657196,0,0,-1,0,0,0,0.9003949072824158,0.07500087033747799,-0.049982238010657196,0,0,-1,0,0,0,0.7183739072824156,0.07471287033747798,-0.049982238010657196,0,0,-1,0,0,0,0.9783379072824157,0.05720387033747798,-0.049982238010657196,0,0,-1,0,0,0,0.9042339072824155,0.06097787033747798,-0.049982238010657196,0,0,-1,0,0,0,0.7140899072824156,0.06080387033747797,-0.049982238010657196,0,0,-1,0,0,0,0.6363909072824157,0.04595287033747797,-0.049982238010657196,0,0,-1,0,0,0,0.9066469072824157,0.04566987033747799,-0.049982238010657196,0,0,-1,0,0,0,0.7111199072824157,0.04566987033747799,-0.049982238010657196,0,0,-1,0,0,0,0.9828459072824156,0.03281587033747799,-0.049982238010657196,0,0,-1,0,0,0,0.6327809072824158,0.021367870337477973,-0.049982238010657196,0,0,-1,0,0,0,0.9853859072824158,0.00889487033747799,-0.049982238010657196,0,0,-1,0,0,0,0.6315839072824156,-0.0032121296625220175,-0.049982238010657196,0,0,-1,0,0,0,0.9861829072824158,-0.01398212966252202,-0.049982238010657196,0,0,-1,0,0,0,0.7078059072824157,-0.01398212966252202,-0.049982238010657196,0,0,-1,0,0,0,0.6320279072824158,-0.017807129662522014,-0.049982238010657196,0,0,-1,0,0,0,0.7092809072824156,-0.033582129662522026,-0.049982238010657196,0,0,-1,0,0,0,0.6333369072824158,-0.03214812966252201,-0.049982238010657196,0,0,-1,0,0,0,0.6354809072824157,-0.046190129662522006,-0.049982238010657196,0,0,-1,0,0,0,0.7127659072824157,-0.05174812966252201,-0.049982238010657196,0,0,-1,0,0,0,0.6384269072824156,-0.05988712966252202,-0.049982238010657196,0,0,-1,0,0,0,0.7180979072824156,-0.06843012966252202,-0.049982238010657196,0,0,-1,0,0,0,0.6421439072824155,-0.07319312966252202,-0.049982238010657196,0,0,-1,0,0,0,0.7251129072824156,-0.08357612966252202,-0.049982238010657196,0,0,-1,0,0,0,0.6466009072824157,-0.08606212966252202,-0.049982238010657196,0,0,-1,0,0,0,0.7336469072824157,-0.09713512966252202,-0.049982238010657196,0,0,-1,0,0,0,0.6517649072824157,-0.09844712966252202,-0.049982238010657196,0,0,-1,0,0,0,0.7435349072824156,-0.10905312966252202,-0.049982238010657196,0,0,-1,0,0,0,0.6576049072824157,-0.11030312966252202,-0.049982238010657196,0,0,-1,0,0,0,0.9762399072824155,-0.14157112966252203,-0.049982238010657196,0,0,-0.999969,0,0,0,0.9194659072824156,-0.10998612966252203,-0.049982238010657196,0,0,-1,0,0,0,0.9298439072824158,-0.10097512966252202,-0.049982238010657196,0,0,-0.999969,0,0,0,0.7546149072824158,-0.11928012966252202,-0.049982238010657196,0,0,-1,0,0,0,0.9090929072824157,-0.11762612966252202,-0.049982238010657196,0,0,-1,0,0,0,0.6640899072824156,-0.12158412966252202,-0.049982238010657196,0,0,-1,0,0,0,0.8988009072824155,-0.12400512966252202,-0.049982238010657196,0,0,-1,0,0,0,0.7667219072824156,-0.127763129662522,-0.049982238010657196,0,0,-1,0,0,0,0.6711869072824157,-0.13224312966252202,-0.049982238010657196,0,0,-0.999969,0,0,0,0.8886649072824158,-0.12923612966252201,-0.049982238010657196,0,0,-1,0,0,0,0.7796919072824156,-0.134452129662522,-0.049982238010657196,0,0,-1,0,0,0,0.8787579072824157,-0.13343212966252202,-0.049982238010657196,0,0,-1,0,0,0,0.6788659072824157,-0.14223512966252203,-0.049982238010657196,0,0,-1,0,0,0,0.8691569072824157,-0.13670412966252202,-0.049982238010657196,0,0,-1,0,0,0,0.7933599072824156,-0.13929312966252202,-0.049982238010657196,0,0,-1,0,0,0,0.8599349072824158,-0.13916512966252204,-0.049982238010657196,0,0,-1,0,0,0,0.8511679072824156,-0.14092712966252202,-0.049982238010657196,0,0,-1,0,0,0,0.8075639072824154,-0.14223612966252203,-0.049982238010657196,0,0,-1,0,0,0,0.8429289072824155,-0.142102129662522,-0.049982238010657196,0,0,-0.999969,0,0,0,0.9682889072824157,-0.15008812966252202,-0.049982238010657196,0,0,-1,0,0,0,0.8352959072824158,-0.142803129662522,-0.049982238010657196,0,0,-0.999969,0,0,0,0.6870939072824156,-0.151513129662522,-0.049982238010657196,0,0,-1,0,0,0,0.8221389072824157,-0.14322812966252202,-0.049982238010657196,0,0,-1,0,0,0,0.8283409072824157,-0.14314112966252202,-0.049982238010657196,0,0,-1,0,0,0,0.9597159072824155,-0.15819512966252203,-0.049982238010657196,0,0,-1,0,0,0,0.6979799072824155,-0.161922129662522,-0.049982238010657196,0,0,-1,0,0,0,0.9504529072824157,-0.16583112966252203,-0.049982238010657196,0,0,-0.999969,0,0,0,0.7090759072824158,-0.17085312966252203,-0.049982238010657196,0,0,-1,0,0,0,0.9404309072824155,-0.17293212966252203,-0.049982238010657196,0,0,-1,0,0,0,0.7203499072824155,-0.17841412966252201,-0.049982238010657196,0,0,-1,0,0,0,0.9295799072824158,-0.179434129662522,-0.049982238010657196,0,0,-1,0,0,0,0.7317719072824156,-0.18471512966252202,-0.049982238010657196,0,0,-1,0,0,0,0.9178309072824158,-0.18527512966252202,-0.049982238010657196,0,0,-1,0,0,0,0.7433079072824156,-0.18986512966252203,-0.049982238010657196,0,0,-1,0,0,0,0.9051159072824158,-0.19039112966252203,-0.049982238010657196,0,0,-1,0,0,0,0.7549269072824156,-0.19397412966252203,-0.049982238010657196,0,0,-1,0,0,0,0.8913649072824157,-0.19471812966252203,-0.049982238010657196,0,0,-1,0,0,0,0.7665989072824158,-0.19715112966252202,-0.049982238010657196,0,0,-1,0,0,0,0.8765099072824158,-0.19819412966252203,-0.049982238010657196,0,0,-1,0,0,0,0.7782899072824156,-0.199505129662522,-0.049982238010657196,0,0,-1,0,0,0,0.8604809072824158,-0.20075612966252201,-0.049982238010657196,0,0,-1,0,0,0,0.7899699072824156,-0.20114612966252202,-0.049982238010657196,0,0,-1,0,0,0,0.8432089072824156,-0.20233912966252202,-0.049982238010657196,0,0,-1,0,0,0,0.8016069072824157,-0.20218212966252203,-0.049982238010657196,0,0,-1,0,0,0,0.8131689072824155,-0.202724129662522,-0.049982238010657196,0,0,-1,0,0,0,0.8246249072824154,-0.20288112966252203,-0.049982238010657196,0,0,-1,0,0,0,0.5470769072824158,0.38618287033747795,-0.049982238010657196,0,0,-0.999969,0,0,0,0.47831190728241557,0.15171787033747797,-0.049982238010657196,0,0,-1,0,0,0,0.47831190728241557,0.38618287033747795,-0.049982238010657196,0,0,-1,0,0,0,0.5470769072824158,-0.19376712966252202,-0.049982238010657196,0,0,-1,0,0,0,0.3744079072824156,0.20213187033747798,-0.049982238010657196,0,0,-1,0,0,0,0.3560609072824157,0.202085870337478,-0.049982238010657196,0,0,-1,0,0,0,0.3664639072824156,0.202255870337478,-0.049982238010657196,0,0,-1,0,0,0,0.38286190728241576,0.201676870337478,-0.049982238010657196,0,0,-0.999969,0,0,0,0.3455829072824157,0.20151587033747798,-0.049982238010657196,0,0,-1,0,0,0,0.39174590728241565,0.200767870337478,-0.049982238010657196,0,0,-1,0,0,0,0.3350589072824157,0.200456870337478,-0.049982238010657196,0,0,-1,0,0,0,0.40098490728241565,0.19927987033747796,-0.049982238010657196,0,0,-1,0,0,0,0.3245179072824156,0.19881887033747797,-0.049982238010657196,0,0,-1,0,0,0,0.4104999072824156,0.197089870337478,-0.049982238010657196,0,0,-1,0,0,0,0.31398790728241566,0.196514870337478,-0.049982238010657196,0,0,-1,0,0,0,0.42021290728241567,0.194074870337478,-0.049982238010657196,0,0,-1,0,0,0,0.30349790728241555,0.193452870337478,-0.049982238010657196,0,0,-1,0,0,0,0.43004690728241557,0.190109870337478,-0.049982238010657196,0,0,-1,0,0,0,0.2930779072824157,0.189545870337478,-0.049982238010657196,0,0,-1,0,0,0,0.4399249072824156,0.185072870337478,-0.049982238010657196,0,0,-1,0,0,0,0.2827549072824156,0.18470387033747798,-0.049982238010657196,0,0,-1,0,0,0,0.44976690728241575,0.178837870337478,-0.049982238010657196,0,0,-1,0,0,0,0.2725589072824157,0.178837870337478,-0.049982238010657196,0,0,-1,0,0,0,0.26251790728241575,0.171858870337478,-0.049982238010657196,0,0,-1,0,0,0,0.4594979072824157,0.17128287033747797,-0.049982238010657196,0,0,-1,0,0,0,0.25266190728241567,0.16367687033747796,-0.049982238010657196,0,0,-1,0,0,0,0.4690389072824157,0.162283870337478,-0.049982238010657196,0,0,-1,0,0,0,0.24301790728241568,0.15420287033747798,-0.049982238010657196,0,0,-1,0,0,0,0.2370689072824157,0.147496870337478,-0.049982238010657196,0,0,-1,0,0,0,0.3846929072824157,0.14066087033747798,-0.049982238010657196,0,0,-1,0,0,0,0.3929879072824156,0.139761870337478,-0.049982238010657196,0,0,-1,0,0,0,0.4012999072824157,0.13818987033747798,-0.049982238010657196,0,0,-1,0,0,0,0.40963790728241567,0.135883870337478,-0.049982238010657196,0,0,-1,0,0,0,0.41801090728241563,0.13278387033747796,-0.049982238010657196,0,0,-1,0,0,0,0.4264269072824156,0.128829870337478,-0.049982238010657196,0,0,-0.999969,0,0,0,0.43489490728241575,0.12396087033747799,-0.049982238010657196,0,0,-1,0,0,0,0.4434229072824156,0.11811687033747797,-0.049982238010657196,0,0,-1,0,0,0,0.4520199072824156,0.111237870337478,-0.049982238010657196,0,0,-0.999969,0,0,0,0.4606949072824156,0.10326187033747797,-0.049982238010657196,0,0,-0.999969,0,0,0,0.4694559072824156,0.094129870337478,-0.049982238010657196,0,0,-0.999969,0,0,0,0.47831190728241557,0.083780870337478,-0.049982238010657196,0,0,-0.999969,0,0,0,0.37640590728241574,0.140946870337478,-0.049982238010657196,0,0,-1,0,0,0,0.23091190728241573,0.13976987033747795,-0.049982238010657196,0,0,-1,0,0,0,0.3692359072824156,0.14074587033747799,-0.049982238010657196,0,0,-1,0,0,0,0.3618459072824156,0.140095870337478,-0.049982238010657196,0,0,-1,0,0,0,0.35429590728241567,0.138927870337478,-0.049982238010657196,0,0,-1,0,0,0,0.22468690728241558,0.13096587033747797,-0.049982238010657196,0,0,-1,0,0,0,0.3466419072824156,0.137172870337478,-0.049982238010657196,0,0,-0.999969,0,0,0,0.3389419072824156,0.134761870337478,-0.049982238010657196,0,0,-1,0,0,0,0.33125290728241574,0.131626870337478,-0.049982238010657196,0,0,-1,0,0,0,0.3236339072824157,0.127696870337478,-0.049982238010657196,0,0,-1,0,0,0,0.21853090728241575,0.12103187033747798,-0.049982238010657196,0,0,-1,0,0,0,0.31614090728241573,0.12290387033747796,-0.049982238010657196,0,0,-1,0,0,0,0.3088319072824157,0.11717987033747795,-0.049982238010657196,0,0,-0.999969,0,0,0,0.21258190728241555,0.10991287033747799,-0.049982238010657196,0,0,-1,0,0,0,0.30176490728241556,0.110453870337478,-0.049982238010657196,0,0,-0.999969,0,0,0,0.2949969072824157,0.10265787033747797,-0.049982238010657196,0,0,-1,0,0,0,0.2069779072824156,0.09755387033747798,-0.049982238010657196,0,0,-1,0,0,0,0.2885849072824156,0.093722870337478,-0.049982238010657196,0,0,-1,0,0,0,0.20185690728241568,0.083900870337478,-0.049982238010657196,0,0,-1,0,0,0,0.28376190728241557,0.08548587033747795,-0.049982238010657196,0,0,-0.999969,0,0,0,0.27961390728241575,0.076983870337478,-0.049982238010657196,0,0,-1,0,0,0,0.19735790728241565,0.06889787033747796,-0.049982238010657196,0,0,-0.999969,0,0,0,0.47831190728241557,-0.07446312966252203,-0.049982238010657196,0,0,-1,0,0,0,0.27609290728241564,0.06829787033747797,-0.049982238010657196,0,0,-1,0,0,0,0.19361790728241557,0.052491870337477986,-0.049982238010657196,0,0,-0.999969,0,0,0,0.27315090728241564,0.05950887033747798,-0.049982238010657196,0,0,-1,0,0,0,0.27073790728241565,0.050695870337477994,-0.049982238010657196,0,0,-1,0,0,0,0.19077590728241556,0.034626870337477994,-0.049982238010657196,0,0,-1,0,0,0,0.2688049072824157,0.04194087033747798,-0.049982238010657196,0,0,-1,0,0,0,0.2673039072824157,0.03332487033747797,-0.049982238010657196,0,0,-0.999969,0,0,0,0.18896990728241558,0.015248870337477988,-0.049982238010657196,0,0,-1,0,0,0,0.2661849072824156,0.02492587033747798,-0.049982238010657196,0,0,-1,0,0,0,0.2653999072824156,0.016826870337477984,-0.049982238010657196,0,0,-1,0,0,0,0.26489990728241564,0.00910787033747798,-0.049982238010657196,0,0,-1,0,0,0,0.1883369072824157,-0.0056971296625220325,-0.049982238010657196,0,0,-1,0,0,0,0.2646359072824156,0.0018488703374779925,-0.049982238010657196,0,0,-1,0,0,0,0.2645589072824157,-0.004869129662522009,-0.049982238010657196,0,0,-1,0,0,0,0.2646699072824157,-0.013059129662522012,-0.049982238010657196,0,0,-1,0,0,0,0.18858990728241576,-0.019187129662522007,-0.049982238010657196,0,0,-1,0,0,0,0.2650339072824157,-0.021443129662522015,-0.049982238010657196,0,0,-1,0,0,0,0.1893949072824157,-0.03270012966252203,-0.049982238010657196,0,0,-1,0,0,0,0.2656979072824157,-0.02997012966252202,-0.049982238010657196,0,0,-0.999969,0,0,0,0.26670690728241575,-0.03859212966252201,-0.049982238010657196,0,0,-0.999969,0,0,0,0.19082190728241555,-0.046190129662522006,-0.049982238010657196,0,0,-1,0,0,0,0.2681069072824156,-0.04726012966252202,-0.049982238010657196,0,0,-1,0,0,0,0.1929389072824157,-0.05961112966252202,-0.049982238010657196,0,0,-1,0,0,0,0.2699439072824157,-0.05592512966252203,-0.049982238010657196,0,0,-1,0,0,0,0.27226390728241556,-0.06453912966252201,-0.049982238010657196,0,0,-1,0,0,0,0.1958159072824157,-0.07291712966252202,-0.049982238010657196,0,0,-1,0,0,0,0.2751139072824156,-0.07305112966252202,-0.049982238010657196,0,0,-1,0,0,0,0.1995219072824157,-0.08606212966252202,-0.049982238010657196,0,0,-1,0,0,0,0.27853990728241573,-0.08141512966252203,-0.049982238010657196,0,0,-0.999969,0,0,0,0.4739189072824157,-0.08047012966252202,-0.049982238010657196,0,0,-1,0,0,0,0.4694749072824156,-0.08606612966252201,-0.049982238010657196,0,0,-1,0,0,0,0.2825859072824157,-0.08957912966252202,-0.049982238010657196,0,0,-1,0,0,0,0.2041239072824157,-0.09900012966252202,-0.049982238010657196,0,0,-1,0,0,0,0.46502990728241556,-0.09125312966252203,-0.049982238010657196,0,0,-1,0,0,0,0.2872999072824156,-0.09749612966252202,-0.049982238010657196,0,0,-0.999969,0,0,0,0.4606369072824157,-0.09603512966252202,-0.049982238010657196,0,0,-1,0,0,0,0.4563479072824157,-0.10041412966252201,-0.049982238010657196,0,0,-0.999969,0,0,0,0.2927279072824156,-0.10511712966252201,-0.049982238010657196,0,0,-1,0,0,0,0.20969390728241555,-0.11168412966252202,-0.049982238010657196,0,0,-1,0,0,0,0.4522139072824156,-0.10439312966252202,-0.049982238010657196,0,0,-1,0,0,0,0.4482869072824156,-0.10797512966252203,-0.049982238010657196,0,0,-0.999969,0,0,0,0.2974079072824156,-0.11070812966252203,-0.049982238010657196,0,0,-1,0,0,0,0.44461990728241574,-0.11116212966252202,-0.049982238010657196,0,0,-1,0,0,0,0.30234390728241567,-0.11587312966252201,-0.049982238010657196,0,0,-0.999969,0,0,0,0.44126190728241554,-0.11395912966252202,-0.049982238010657196,0,0,-1,0,0,0,0.21629890728241574,-0.12406912966252202,-0.049982238010657196,0,0,-1,0,0,0,0.4382679072824156,-0.11636712966252202,-0.049982238010657196,0,0,-0.999969,0,0,0,0.3075499072824157,-0.12060012966252202,-0.049982238010657196,0,0,-1,0,0,0,0.43568690728241566,-0.11839012966252202,-0.049982238010657196,0,0,-1,0,0,0,0.4335729072824157,-0.12003012966252202,-0.049982238010657196,0,0,-1,0,0,0,0.47831190728241557,-0.15234212966252203,-0.049982238010657196,0,0,-1,0,0,0,0.42823490728241564,-0.12376112966252202,-0.049982238010657196,0,0,-1,0,0,0,0.3130409072824156,-0.12487912966252201,-0.049982238010657196,0,0,-1,0,0,0,0.4229749072824156,-0.12709212966252204,-0.049982238010657196,0,0,-0.999969,0,0,0,0.2240079072824157,-0.136110129662522,-0.049982238010657196,0,0,-1,0,0,0,0.3188319072824157,-0.128697129662522,-0.049982238010657196,0,0,-1,0,0,0,0.4177669072824157,-0.130037129662522,-0.049982238010657196,0,0,-1,0,0,0,0.3249359072824156,-0.13204412966252202,-0.049982238010657196,0,0,-1,0,0,0,0.41258390728241556,-0.13261112966252203,-0.049982238010657196,0,0,-1,0,0,0,0.3313679072824156,-0.13490712966252202,-0.049982238010657196,0,0,-0.999969,0,0,0,0.40740190728241554,-0.13482912966252203,-0.049982238010657196,0,0,-1,0,0,0,0.40219290728241575,-0.13670412966252202,-0.049982238010657196,0,0,-1,0,0,0,0.33814190728241567,-0.137276129662522,-0.049982238010657196,0,0,-0.999969,0,0,0,0.2328919072824156,-0.14775812966252203,-0.049982238010657196,0,0,-1,0,0,0,0.3969329072824157,-0.138251129662522,-0.049982238010657196,0,0,-1,0,0,0,0.34527290728241566,-0.13913812966252204,-0.049982238010657196,0,0,-1,0,0,0,0.39159490728241564,-0.13948512966252202,-0.049982238010657196,0,0,-1,0,0,0,0.35277490728241556,-0.14048212966252202,-0.049982238010657196,0,0,-0.999969,0,0,0,0.3861539072824156,-0.140419129662522,-0.049982238010657196,0,0,-1,0,0,0,0.3805829072824156,-0.14106912966252202,-0.049982238010657196,0,0,-1,0,0,0,0.36066190728241576,-0.141297129662522,-0.049982238010657196,0,0,-1,0,0,0,0.3748569072824157,-0.14144812966252202,-0.049982238010657196,0,0,-0.999969,0,0,0,0.3689499072824156,-0.14157112966252203,-0.049982238010657196,0,0,-0.999969,0,0,0,0.24301790728241568,-0.15897012966252203,-0.049982238010657196,0,0,-1,0,0,0,0.4687639072824157,-0.16273512966252202,-0.049982238010657196,0,0,-1,0,0,0,0.47831190728241557,-0.19376712966252202,-0.049982238010657196,0,0,-1,0,0,0,0.2515479072824156,-0.167144129662522,-0.049982238010657196,0,0,-0.999969,0,0,0,0.4588189072824156,-0.17162012966252202,-0.049982238010657196,0,0,-0.999969,0,0,0,0.26017090728241565,-0.174305129662522,-0.049982238010657196,0,0,-0.999969,0,0,0,0.44856290728241555,-0.17911312966252202,-0.049982238010657196,0,0,-1,0,0,0,0.26890790728241565,-0.18051112966252203,-0.049982238010657196,0,0,-1,0,0,0,0.43808390728241564,-0.18532912966252202,-0.049982238010657196,0,0,-0.999969,0,0,0,0.27778390728241575,-0.185820129662522,-0.049982238010657196,0,0,-1,0,0,0,0.4274649072824157,-0.19038212966252202,-0.049982238010657196,0,0,-1,0,0,0,0.2868209072824157,-0.190288129662522,-0.049982238010657196,0,0,-0.999969,0,0,0,0.29604190728241564,-0.19397412966252203,-0.049982238010657196,0,0,-1,0,0,0,0.41679590728241567,-0.19438812966252203,-0.049982238010657196,0,0,-0.999969,0,0,0,0.30546990728241563,-0.19693512966252202,-0.049982238010657196,0,0,-1,0,0,0,0.4061599072824156,-0.19746312966252202,-0.049982238010657196,0,0,-1,0,0,0,0.3151279072824156,-0.19922912966252201,-0.049982238010657196,0,0,-1,0,0,0,0.39564590728241567,-0.199720129662522,-0.049982238010657196,0,0,-1,0,0,0,0.3250389072824156,-0.200913129662522,-0.049982238010657196,0,0,-1,0,0,0,0.3853389072824156,-0.201275129662522,-0.049982238010657196,0,0,-1,0,0,0,0.33522690728241566,-0.20204412966252203,-0.049982238010657196,0,0,-0.999969,0,0,0,0.37532490728241563,-0.20224412966252203,-0.049982238010657196,0,0,-1,0,0,0,0.3457139072824156,-0.20268112966252202,-0.049982238010657196,0,0,-1,0,0,0,0.36568990728241557,-0.20274112966252203,-0.049982238010657196,0,0,-0.999969,0,0,0,0.36568990728241557,-0.20274112966252203,-0.049982238010657196,0,0,-0.999969,0.09411764705882353,0.09411764705882353,0.09411764705882353,0.35652190728241573,-0.20288112966252203,-0.049982238010657196,0,0,-1,0.08627450980392157,0.08627450980392157,0.08627450980392157,0.3457139072824156,-0.20268112966252202,-0.049982238010657196,0,0,-1,0.058823529411764705,0.058823529411764705,0.058823529411764705,-0.01694309271758443,0.20218987033747798,-0.049982238010657196,0,0,-1,0,0,0,-0.029319092717584372,0.202182870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.02293109271758431,0.202255870337478,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.010239092717584386,0.201933870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.03565009271758446,0.20194587033747796,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.04193509271758433,0.20151787033747798,-0.049982238010657196,0,0,-1,0,0,0,-0.002930092717584376,0.20140187033747797,-0.049982238010657196,0,0,-1,0,0,0,-0.04818509271758442,0.20087487033747797,-0.049982238010657196,0,0,-0.999969,0,0,0,0.004869907282415653,0.200506870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.054412092717584404,0.19999087033747798,-0.049982238010657196,0,0,-1,0,0,0,0.01304990728241573,0.19916387033747796,-0.049982238010657196,0,0,-1,0,0,0,-0.0606280927175844,0.198838870337478,-0.049982238010657196,0,0,-1,0,0,0,0.0214969072824156,0.197284870337478,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.06684309271758426,0.197392870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.07307009271758425,0.19562787033747797,-0.049982238010657196,0,0,-1,0,0,0,0.03009990728241574,0.194784870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.07932109271758425,0.19351787033747797,-0.049982238010657196,0,0,-1,0,0,0,0.03874590728241567,0.19157787033747797,-0.049982238010657196,0,0,-1,0,0,0,-0.08560509271758443,0.19103687033747796,-0.049982238010657196,0,0,-1,0,0,0,-0.14720609271758445,0.19314287033747796,-0.049982238010657196,0,0,-1,0,0,0,-0.21597209271758433,-0.19376712966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.21597209271758433,0.19314287033747796,-0.049982238010657196,0,0,-1,0,0,0,-0.14720609271758445,0.14674687033747796,-0.049982238010657196,0,0,-1,0,0,0,0.04732290728241573,0.18757587033747797,-0.049982238010657196,0,0,-1,0,0,0,-0.0919360927175843,0.18815887033747797,-0.049982238010657196,0,0,-1,0,0,0,-0.09832409271758435,0.18485787033747797,-0.049982238010657196,0,0,-1,0,0,0,0.055718907282415575,0.18269387033747797,-0.049982238010657196,0,0,-1,0,0,0,-0.10442809271758424,0.18140187033747796,-0.049982238010657196,0,0,-0.999969,0,0,0,0.06382090728241563,0.176845870337478,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.11028809271758444,0.177719870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.11586509271758438,0.17389287033747797,-0.049982238010657196,0,0,-1,0,0,0,0.0715179072824157,0.16994487033747796,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.12112409271758429,0.170005870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.12602509271758433,0.16614187033747796,-0.049982238010657196,0,0,-1,0,0,0,0.07841890728241574,0.162204870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.1305330927175843,0.162384870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.13460909271758426,0.158816870337478,-0.049982238010657196,0,0,-0.999969,0,0,0,0.08426790728241573,0.15393787033747797,-0.049982238010657196,0,0,-1,0,0,0,-0.13821509271758425,0.15552287033747797,-0.049982238010657196,0,0,-1,0,0,0,-0.14131609271758427,0.15258487033747797,-0.049982238010657196,0,0,-1,0,0,0,0.08914990728241556,0.145205870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.14387309271758442,0.150087870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.1458490927175844,0.14811387033747797,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.14720609271758445,0.06721087033747797,-0.049982238010657196,0,0,-1,0,0,0,-0.1442350927175844,0.071178870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.14111509271758438,0.075203870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.1378340927175843,0.07927587033747796,-0.049982238010657196,0,0,-1,0,0,0,-0.13438009271758444,0.08338187033747796,-0.049982238010657196,0,0,-1,0,0,0,-0.1307420927175844,0.08751087033747795,-0.049982238010657196,0,0,-1,0,0,0,-0.1269080927175843,0.09165087033747799,-0.049982238010657196,0,0,-1,0,0,0,-0.12286709271758434,0.09579187033747799,-0.049982238010657196,0,0,-1,0,0,0,-0.1186070927175844,0.09992087033747798,-0.049982238010657196,0,0,-1,0,0,0,-0.11411809271758444,0.10402687033747798,-0.049982238010657196,0,0,-1,0,0,0,-0.10938609271758426,0.108098870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.10440209271758438,0.112123870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.09915309271758432,0.11609187033747798,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.09379709271758441,0.119887870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.08847809271758433,0.12339887033747798,-0.049982238010657196,0,0,-1,0,0,0,-0.08316609271758435,0.12661687033747798,-0.049982238010657196,0,0,-1,0,0,0,-0.07782709271758437,0.12953187033747798,-0.049982238010657196,0,0,-1,0,0,0,-0.07243109271758441,0.132136870337478,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.06694509271758431,0.13442287033747796,-0.049982238010657196,0,0,-1,0,0,0,-0.06133909271758431,0.136379870337478,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.05558009271758424,0.138000870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.04963709271758443,0.139276870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.04347909271758432,0.14019887033747797,-0.049982238010657196,0,0,-1,0,0,0,-0.03707309271758441,0.14075887033747797,-0.049982238010657196,0,0,-1,0,0,0,-0.03038709271758444,0.140946870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.02323709271758445,0.14067987033747797,-0.049982238010657196,0,0,-1,0,0,0,0.09315090728241571,0.13606787033747797,-0.049982238010657196,0,0,-1,0,0,0,-0.01668309271758428,0.13991487033747796,-0.049982238010657196,0,0,-1,0,0,0,-0.010698092717584373,0.138707870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.005256092717584426,0.13711187033747796,-0.049982238010657196,0,0,-1,0,0,0,-0.0003330927175844156,0.13518187033747797,-0.049982238010657196,0,0,-1,0,0,0,0.09635890728241558,0.126584870337478,-0.049982238010657196,0,0,-1,0,0,0,0.004098907282415576,0.13297287033747796,-0.049982238010657196,0,0,-1,0,0,0,0.008063907282415572,0.130539870337478,-0.049982238010657196,0,0,-1,0,0,0,0.011589907282415712,0.12793687033747797,-0.049982238010657196,0,0,-1,0,0,0,0.014700907282415576,0.12521887033747797,-0.049982238010657196,0,0,-0.999969,0,0,0,0.09885890728241575,0.11681687033747801,-0.049982238010657196,0,0,-1,0,0,0,0.017423907282415607,0.122439870337478,-0.049982238010657196,0,0,-0.999969,0,0,0,0.019783907282415747,0.11965587033747799,-0.049982238010657196,0,0,-0.999969,0,0,0,0.02180790728241555,0.116920870337478,-0.049982238010657196,0,0,-1,0,0,0,0.02398290728241559,0.11343487033747796,-0.049982238010657196,0,0,-0.999969,0,0,0,0.10073690728241558,0.106824870337478,-0.049982238010657196,0,0,-1,0,0,0,0.025953907282415756,0.10960987033747799,-0.049982238010657196,0,0,-1,0,0,0,0.027723907282415583,0.10545087033747796,-0.049982238010657196,0,0,-1,0,0,0,0.10208090728241559,0.09666787033747798,-0.049982238010657196,0,0,-0.999969,0,0,0,0.029294907282415572,0.100963870337478,-0.049982238010657196,0,0,-1,0,0,0,0.030670907282415616,0.096154870337478,-0.049982238010657196,0,0,-1,0,0,0,0.10297490728241576,0.08640887033747796,-0.049982238010657196,0,0,-1,0,0,0,0.03185390728241555,0.091029870337478,-0.049982238010657196,0,0,-1,0,0,0,0.03284690728241557,0.085593870337478,-0.049982238010657196,0,0,-1,0,0,0,0.10350690728241574,0.07610487033747798,-0.049982238010657196,0,0,-1,0,0,0,0.033652907282415656,0.07985287033747795,-0.049982238010657196,0,0,-1,0,0,0,0.03427390728241564,0.07381287033747796,-0.049982238010657196,0,0,-1,0,0,0,0.10376290728241555,0.06581987033747799,-0.049982238010657196,0,0,-0.999969,0,0,0,0.03471490728241555,0.06747887033747796,-0.049982238010657196,0,0,-1,0,0,0,0.03497690728241576,0.06085787033747797,-0.049982238010657196,0,0,-1,0,0,0,-0.14720609271758445,-0.19376712966252202,-0.049982238010657196,0,0,-1,0,0,0,0.10382990728241559,0.05561187033747797,-0.049982238010657196,0,0,-1,0,0,0,0.03506390728241571,0.05395487033747798,-0.049982238010657196,0,0,-1,0,0,0,0.10382990728241559,-0.19376712966252202,-0.049982238010657196,0,0,-0.999969,0,0,0,0.03506390728241571,-0.19376712966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.4665000927175843,0.201917870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.4935680927175844,0.202039870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.48109209271758435,0.202255870337478,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.5061310927175844,0.20135487033747795,-0.049982238010657196,0,0,-1,0,0,0,-0.45294209271758434,0.20093287033747798,-0.049982238010657196,0,0,-1,0,0,0,-0.5187620927175843,0.200145870337478,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.44037909271758435,0.199342870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.5314460927175844,0.19835887033747795,-0.049982238010657196,0,0,-1,0,0,0,-0.42877309271758435,0.19719287033747795,-0.049982238010657196,0,0,-1,0,0,0,-0.5441640927175844,0.19593887033747798,-0.049982238010657196,0,0,-1,0,0,0,-0.4180890927175843,0.194524870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.5568990927175843,0.192831870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.40828709271758434,0.191381870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.5696350927175844,0.188981870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.3993310927175844,0.18780787033747798,-0.049982238010657196,0,0,-1,0,0,0,-0.5823530927175844,0.184335870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.39118409271758436,0.18384487033747798,-0.049982238010657196,0,0,-1,0,0,0,-0.5950360927175844,0.178837870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.3838080927175843,0.179536870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.37716509271758436,0.174926870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.6076680927175844,0.17243387033747798,-0.049982238010657196,0,0,-1,0,0,0,-0.3712180927175843,0.170057870337478,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.6202310927175844,0.16506887033747797,-0.049982238010657196,0,0,-1,0,0,0,-0.36593009271758437,0.16497387033747796,-0.049982238010657196,0,0,-1,0,0,0,-0.6327070927175843,0.15668887033747797,-0.049982238010657196,0,0,-1,0,0,0,-0.35906109271758435,0.15684287033747796,-0.049982238010657196,0,0,-1,0,0,0,-0.3533030927175843,0.148253870337478,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.5942150927175843,0.11124387033747796,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.5987390927175843,0.10863587033747796,-0.049982238010657196,0,0,-1,0,0,0,-0.5897520927175843,0.11369087033747799,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.5853400927175844,0.11598887033747796,-0.049982238010657196,0,0,-1,0,0,0,-0.5809720927175843,0.11814787033747798,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.5766380927175844,0.12018087033747799,-0.049982238010657196,0,0,-1,0,0,0,-0.5723300927175844,0.12209887033747796,-0.049982238010657196,0,0,-1,0,0,0,-0.5680400927175844,0.123912870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.5637580927175844,0.125634870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.5594760927175844,0.12727687033747798,-0.049982238010657196,0,0,-1,0,0,0,-0.5551850927175843,0.12884987033747797,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.5508770927175843,0.13036487033747796,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.5465430927175844,0.13183387033747795,-0.049982238010657196,0,0,-1,0,0,0,-0.5419500927175843,0.133263870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.5372800927175844,0.13464487033747796,-0.049982238010657196,0,0,-1,0,0,0,-0.5325230927175844,0.135962870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.5276720927175843,0.137203870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.5227170927175844,0.13835187033747798,-0.049982238010657196,0,0,-1,0,0,0,-0.5176490927175843,0.13939387033747797,-0.049982238010657196,0,0,-1,0,0,0,-0.5124610927175843,0.14031487033747797,-0.049982238010657196,0,0,-1,0,0,0,-0.5071430927175844,0.14110087033747798,-0.049982238010657196,0,0,-1,0,0,0,-0.5016880927175843,0.141736870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.4960850927175844,0.14220887033747798,-0.049982238010657196,0,0,-1,0,0,0,-0.4903280927175844,0.142502870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.4844060927175844,0.14260387033747796,-0.049982238010657196,0,0,-1,0,0,0,-0.4795140927175844,0.14253087033747797,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.3485570927175844,0.13930287033747796,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.4744060927175844,0.142292870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.46914309271758436,0.141865870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.4637850927175844,0.141222870337478,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.4583930927175843,0.140338870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.4530260927175843,0.139186870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.34472609271758436,0.13008487033747795,-0.049982238010657196,0,0,-1,0,0,0,-0.44774609271758437,0.137740870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.4426120927175844,0.135975870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.4376860927175843,0.133865870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.4330270927175843,0.13138487033747798,-0.049982238010657196,0,0,-1,0,0,0,-0.42869609271758435,0.12850687033747799,-0.049982238010657196,0,0,-1,0,0,0,-0.3417130927175843,0.12069387033747797,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.42475409271758435,0.125205870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.42055009271758437,0.12079887033747799,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.41701309271758435,0.11590787033747796,-0.049982238010657196,0,0,-1,0,0,0,-0.3394180927175844,0.11122487033747797,-0.049982238010657196,0,0,-1,0,0,0,-0.41408709271758437,0.11060287033747795,-0.049982238010657196,0,0,-1,0,0,0,-0.33774509271758435,0.101772870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.41171209271758435,0.10495287033747797,-0.049982238010657196,0,0,-1,0,0,0,-0.4098330927175844,0.09902687033747798,-0.049982238010657196,0,0,-1,0,0,0,-0.33659509271758437,0.09243387033747796,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.40839109271758434,0.09289387033747798,-0.049982238010657196,0,0,-1,0,0,0,-0.4073280927175843,0.08662287033747795,-0.049982238010657196,0,0,-1,0,0,0,-0.3358710927175843,0.08330187033747799,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.40658809271758434,0.080282870337478,-0.049982238010657196,0,0,-1,0,0,0,-0.33547509271758436,0.07447187033747799,-0.049982238010657196,0,0,-1,0,0,0,-0.4061120927175843,0.07394187033747796,-0.049982238010657196,0,0,-1,0,0,0,-0.33530909271758436,0.06603787033747799,-0.049982238010657196,0,0,-1,0,0,0,-0.40584409271758437,0.06767087033747798,-0.049982238010657196,0,0,-1,0,0,0,-0.4057250927175844,0.061537870337477985,-0.049982238010657196,0,0,-1,0,0,0,-0.3352760927175843,0.05809687033747796,-0.049982238010657196,0,0,-1,0,0,0,-0.4056980927175844,0.05561187033747797,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.3352760927175843,-0.07612012966252202,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.4056980927175844,0.05146887033747799,-0.049982238010657196,0,0,-1,0,0,0,-0.4140060927175844,0.05141687033747799,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.4227250927175843,0.05126187033747798,-0.049982238010657196,0,0,-1,0,0,0,-0.4317830927175843,0.05100287033747797,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.44110909271758436,0.05064087033747797,-0.049982238010657196,0,0,-1,0,0,0,-0.45063009271758436,0.05017487033747797,-0.049982238010657196,0,0,-1,0,0,0,-0.40404109271758437,-0.0056971296625220325,-0.049982238010657196,0,0,-1,0,0,0,-0.4602760927175843,0.049604870337477985,-0.049982238010657196,0,0,-1,0,0,0,-0.46997309271758436,0.04893187033747798,-0.049982238010657196,0,0,-1,0,0,0,-0.4796500927175843,0.04815487033747798,-0.049982238010657196,0,0,-1,0,0,0,-0.48923409271758433,0.04727487033747799,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.49865509271758435,0.046290870337477974,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.5078400927175843,0.04520387033747797,-0.049982238010657196,0,0,-1,0,0,0,-0.5167170927175844,0.04401287033747797,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.5241690927175844,0.04284687033747797,-0.049982238010657196,0,0,-1,0,0,0,-0.5323550927175843,0.041380870337477976,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.5411450927175844,0.039558870337477986,-0.049982238010657196,0,0,-1,0,0,0,-0.5504100927175843,0.03732287033747797,-0.049982238010657196,0,0,-1,0,0,0,-0.5600190927175843,0.03461487033747798,-0.049982238010657196,0,0,-1,0,0,0,-0.5698450927175843,0.03137787033747799,-0.049982238010657196,0,0,-1,0,0,0,-0.5797570927175844,0.02755387033747797,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.5896250927175843,0.02308487033747797,-0.049982238010657196,0,0,-1,0,0,0,-0.5993210927175844,0.01791487033747799,-0.049982238010657196,0,0,-1,0,0,0,-0.6087150927175844,0.01198487033747797,-0.049982238010657196,0,0,-1,0,0,0,-0.6176780927175843,0.005237870337477968,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.6260790927175843,-0.002383129662522021,-0.049982238010657196,0,0,-1,0,0,0,-0.6302280927175844,-0.006734129662522015,-0.049982238010657196,0,0,-1,0,0,0,-0.40678909271758434,-0.00575012966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.40404109271758437,-0.08191912966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.4115240927175844,-0.005912129662522025,-0.049982238010657196,0,0,-1,0,0,0,-0.4179570927175843,-0.006189129662522025,-0.049982238010657196,0,0,-1,0,0,0,-0.42579709271758437,-0.006587129662522007,-0.049982238010657196,0,0,-1,0,0,0,-0.43475309271758433,-0.007112129662522032,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.6343490927175843,-0.011508129662522015,-0.049982238010657196,0,0,-1,0,0,0,-0.4445340927175844,-0.007769129662522023,-0.049982238010657196,0,0,-1,0,0,0,-0.4548510927175844,-0.008564129662522013,-0.049982238010657196,0,0,-1,0,0,0,-0.4654120927175843,-0.009502129662522008,-0.049982238010657196,0,0,-1,0,0,0,-0.47592609271758435,-0.010591129662522014,-0.049982238010657196,0,0,-1,0,0,0,-0.4861050927175844,-0.011834129662522008,-0.049982238010657196,0,0,-1,0,0,0,-0.6383770927175844,-0.01671412966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.4956560927175844,-0.013239129662522026,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.5042900927175843,-0.014811129662522016,-0.049982238010657196,0,0,-1,0,0,0,-0.5097520927175844,-0.015950129662522017,-0.049982238010657196,0,0,-1,0,0,0,-0.5153320927175844,-0.017293129662522028,-0.049982238010657196,0,0,-1,0,0,0,-0.6422500927175844,-0.022359129662522015,-0.049982238010657196,0,0,-1,0,0,0,-0.5209760927175844,-0.018837129662522017,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.5266280927175844,-0.020580129662522012,-0.049982238010657196,0,0,-1,0,0,0,-0.5322350927175844,-0.022518129662522007,-0.049982238010657196,0,0,-1,0,0,0,-0.6459050927175843,-0.028454129662522032,-0.049982238010657196,0,0,-1,0,0,0,-0.5377400927175844,-0.02464912966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.5430910927175844,-0.02697012966252202,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.5482310927175843,-0.02947812966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.6492770927175844,-0.035006129662522006,-0.049982238010657196,0,0,-1,0,0,0,-0.5531060927175844,-0.03217112966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.5576630927175843,-0.03504412966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.6523040927175844,-0.04202312966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.5618450927175843,-0.038096129662522016,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.5655990927175844,-0.04132312966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.5678880927175843,-0.04353212966252201,-0.049982238010657196,0,0,-1,0,0,0,-0.6549230927175843,-0.04951612966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.5701750927175844,-0.046014129662522024,-0.049982238010657196,0,0,-1,0,0,0,-0.5724210927175843,-0.04876612966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.5745900927175843,-0.051787129662522025,-0.049982238010657196,0,0,-1,0,0,0,-0.6570700927175843,-0.05749212966252201,-0.049982238010657196,0,0,-1,0,0,0,-0.5766430927175843,-0.055071129662522006,-0.049982238010657196,0,0,-1,0,0,0,-0.5785440927175843,-0.05861812966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.6586820927175844,-0.06595912966252201,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.5802550927175844,-0.06242312966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.5817390927175844,-0.06648512966252201,-0.049982238010657196,0,0,-1,0,0,0,-0.6596960927175843,-0.07492812966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.5829580927175844,-0.07079912966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.5838760927175843,-0.07536412966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.6600480927175844,-0.08440512966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.5844530927175844,-0.08017712966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.3353020927175844,-0.08102612966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.5846540927175844,-0.08523312966252201,-0.049982238010657196,0,0,-1,0,0,0,-0.33535209271758437,-0.08616512966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.4083660927175844,-0.08672712966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.6596950927175843,-0.09429612966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.5844550927175843,-0.09043112966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.33537909271758437,-0.09146012966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.41302809271758434,-0.09158912966252201,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.5838870927175843,-0.09526012966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.3353370927175844,-0.09683212966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.4179830927175844,-0.09645712966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.6586780927175844,-0.10367112966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.5829970927175844,-0.09973212966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.4231890927175843,-0.10128212966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.3351800927175843,-0.10220512966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.5818310927175844,-0.10385912966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.4286010927175844,-0.10601512966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.33486109271758435,-0.10749912966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.6570570927175844,-0.11253512966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.5804350927175843,-0.10765312966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.43417809271758434,-0.11060612966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.33433609271758435,-0.11263912966252201,-0.049982238010657196,0,0,-1,0,0,0,-0.5788550927175844,-0.11112412966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.4398750927175843,-0.11500812966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.5771360927175844,-0.11428512966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.6548930927175843,-0.12089012966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.3335570927175844,-0.11754512966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.5753260927175844,-0.11714612966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.4456500927175844,-0.11917112966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.5734690927175844,-0.11972012966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.33247909271758436,-0.12214112966252202,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.45146009271758436,-0.12304712966252201,-0.049982238010657196,0,0,-1,0,0,0,-0.5716130927175843,-0.12201712966252203,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.6522450927175844,-0.12873812966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.5698030927175843,-0.12405012966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.3310560927175843,-0.126348129662522,-0.049982238010657196,0,0,-1,0,0,0,-0.4572610927175843,-0.12658612966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.5680840927175843,-0.12583012966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.5642580927175843,-0.12911512966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.3292420927175843,-0.130089129662522,-0.049982238010657196,0,0,-1,0,0,0,-0.4630100927175843,-0.12973912966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.6491740927175843,-0.136083129662522,-0.049982238010657196,0,0,-1,0,0,0,-0.5602560927175844,-0.131948129662522,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.46866409271758436,-0.13245812966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.3269910927175843,-0.133286129662522,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.5561100927175844,-0.134361129662522,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.47299609271758436,-0.134220129662522,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.32540609271758436,-0.135063129662522,-0.049982238010657196,0,0,-1,0,0,0,-0.4772910927175843,-0.135783129662522,-0.049982238010657196,0,0,-1,0,0,0,-0.5518520927175844,-0.136386129662522,-0.049982238010657196,0,0,-1,0,0,0,-0.3235650927175844,-0.136662129662522,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.4815450927175844,-0.13715712966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.6457400927175844,-0.14292712966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.5475130927175843,-0.138054129662522,-0.049982238010657196,0,0,-1,0,0,0,-0.3214890927175843,-0.13807612966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.48575609271758435,-0.13835012966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.5431260927175844,-0.13939712966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.31919709271758434,-0.139301129662522,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.48992109271758433,-0.13936912966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.3167090927175843,-0.140330129662522,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.49403709271758434,-0.140225129662522,-0.049982238010657196,0,0,-1,0,0,0,-0.5387210927175844,-0.140446129662522,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.4981010927175843,-0.14092612966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.3140450927175843,-0.14115712966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.5343300927175844,-0.14123412966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.5021110927175844,-0.14147912966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.3112270927175843,-0.141778129662522,-0.049982238010657196,0,0,-1,0,0,0,-0.5299860927175843,-0.14179212966252203,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.5060630927175843,-0.14189512966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.3054500927175844,-0.20039512966252201,-0.049982238010657196,0,0,-1,0,0,0,-0.29880109271758437,-0.14207312966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.2955080927175844,-0.14157112966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.3082730927175843,-0.142185129662522,-0.049982238010657196,0,0,-1,0,0,0,-0.5257190927175843,-0.14215112966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.5099550927175843,-0.14218112966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.30204009271758436,-0.14233912966252202,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.5215620927175844,-0.14234312966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.5137830927175844,-0.14234712966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.3052040927175843,-0.14237412966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.5175460927175843,-0.14240012966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.3982420927175844,-0.146542129662522,-0.049982238010657196,0,0,-1,0,0,0,-0.6420050927175843,-0.149273129662522,-0.049982238010657196,0,0,-1,0,0,0,-0.4014820927175844,-0.14991912966252202,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.3970880927175844,-0.150681129662522,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.6380280927175843,-0.155125129662522,-0.049982238010657196,0,0,-1,0,0,0,-0.4049730927175843,-0.153397129662522,-0.049982238010657196,0,0,-1,0,0,0,-0.3957060927175844,-0.154793129662522,-0.049982238010657196,0,0,-1,0,0,0,-0.40868809271758433,-0.15693812966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.3941120927175843,-0.15885312966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.6338690927175844,-0.160485129662522,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.4126020927175843,-0.16050412966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.39231909271758436,-0.16283612966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.6295900927175844,-0.16535612966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.41668909271758436,-0.164059129662522,-0.049982238010657196,0,0,-1,0,0,0,-0.3903430927175844,-0.16671612966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.4209220927175843,-0.16756612966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.6252510927175844,-0.16974012966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.3881960927175844,-0.17046512966252203,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.4252760927175844,-0.17098612966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.6178700927175843,-0.17631012966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.38589409271758435,-0.17406012966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.4297250927175843,-0.17428212966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.3834510927175844,-0.17747312966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.4342430927175843,-0.17741712966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.6102530927175843,-0.18197612966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.43880409271758436,-0.180354129662522,-0.049982238010657196,0,0,-1,0,0,0,-0.38088209271758433,-0.18067912966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.44338209271758433,-0.18305512966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.37820009271758437,-0.183652129662522,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.6024410927175844,-0.18680212966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.4479520927175843,-0.18548212966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.3754210927175844,-0.18636712966252203,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.45287209271758433,-0.18791312966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.37255809271758433,-0.18879612966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.5944730927175843,-0.19085212966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.45811209271758435,-0.19022312966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.3686110927175843,-0.19158712966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.46368009271758437,-0.192395129662522,-0.049982238010657196,0,0,-1,0,0,0,-0.5863910927175844,-0.19418812966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.36425009271758435,-0.194143129662522,-0.049982238010657196,0,0,-1,0,0,0,-0.4695850927175843,-0.19441112966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.35950909271758436,-0.19643412966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.5782330927175844,-0.19687412966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.4758350927175844,-0.196255129662522,-0.049982238010657196,0,0,-1,0,0,0,-0.4824380927175843,-0.19791012966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.3544230927175843,-0.19843112966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.5700410927175843,-0.198973129662522,-0.049982238010657196,0,0,-1,0,0,0,-0.48940409271758434,-0.19935712966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.34902609271758434,-0.20010612966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.5618550927175844,-0.20054812966252203,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.4967410927175844,-0.20057912966252203,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.3433530927175843,-0.20143112966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.31205509271758436,-0.201781129662522,-0.049982238010657196,0,0,-1,0,0,0,-0.5537150927175843,-0.201664129662522,-0.049982238010657196,0,0,-0.999969,0,0,0,-0.5044580927175843,-0.20156012966252201,-0.049982238010657196,0,0,-1,0,0,0,-0.3374390927175843,-0.20237512966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.5125630927175844,-0.20228212966252201,-0.049982238010657196,0,0,-1,0,0,0,-0.5456610927175843,-0.20238212966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.3185900927175843,-0.20264312966252201,-0.049982238010657196,0,0,-1,0,0,0,-0.5210650927175844,-0.20272812966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.33131709271758436,-0.202911129662522,-0.049982238010657196,0,0,-1,0,0,0,-0.5377340927175843,-0.20276612966252203,-0.049982238010657196,0,0,-1,0,0,0,-0.32502309271758434,-0.20301012966252202,-0.049982238010657196,0,0,-1,0,0,0,-0.5299730927175843,-0.20288112966252203,-0.049982238010657196,0,0,-1,0,0,0,-1.0941820927175843,0.38618287033747795,-0.049982238010657196,0,0,-1,1,0,0.00784313725490196,-0.9806770927175843,0.028270870337477993,-0.049982238010657196,0,0,-1,1,0,0.00784313725490196,-1.1836600927175844,0.38618287033747795,-0.049982238010657196,0,0,-1,1,0,0.00784313725490196,-0.9409090927175843,0.106978870337478,-0.049982238010657196,0,0,-1,1,0,0.00784313725490196,-0.6981590927175844,0.38618287033747795,-0.049982238010657196,0,0,-0.999969,1,0,0.00784313725490196,-0.7876370927175844,0.38618287033747795,-0.049982238010657196,0,0,-1,1,0,0.00784313725490196,-0.9011410927175844,0.028270870337477993,-0.049982238010657196,0,0,-0.999969,1,0,0.00784313725490196,-0.9806770927175843,-0.19376712966252202,-0.049982238010657196,0,0,-1,1,0,0.00784313725490196,-0.9011410927175844,-0.19376712966252202,-0.049982238010657196,0,0,-1,1,0,0.00784313725490196,-0.9011410927175844,0.028270870337477993,0.05001776198934281,0.966887,-0.255074,0,1,0,0.00784313725490196,-0.9011410927175844,0.028270870337477993,-0.049982238010657196,0.966887,-0.255074,0,1,0,0.00784313725490196,-0.6981590927175844,0.38618287033747795,-0.049982238010657196,0.864071,0.503311,0,1,0,0.00784313725490196,-0.9011410927175844,-0.19376712966252202,0.05001776198934281,0.707083,-0.707083,0,1,0,0.00784313725490196,-0.9011410927175844,-0.19376712966252202,-0.049982238010657196,0.707083,-0.707083,0,1,0,0.00784313725490196,-0.9806770927175843,-0.19376712966252202,0.05001776198934281,-0.707083,-0.707083,0,1,0,0.00784313725490196,-0.9806770927175843,-0.19376712966252202,-0.049982238010657196,-0.707083,-0.707083,0,1,0,0.00784313725490196,-0.9806770927175843,0.028270870337477993,0.05001776198934281,-0.966887,-0.255074,0,1,0,0.00784313725490196,-0.9806770927175843,0.028270870337477993,-0.049982238010657196,-0.966887,-0.255074,0,1,0,0.00784313725490196,-1.1836600927175844,0.38618287033747795,0.05001776198934281,-0.864071,0.503311,0,1,0,0.00784313725490196,-1.1836600927175844,0.38618287033747795,-0.049982238010657196,-0.864071,0.503311,0,1,0,0.00784313725490196,-1.0941820927175843,0.38618287033747795,0.05001776198934281,0.509293,0.860561,0,1,0,0.00784313725490196,-1.0941820927175843,0.38618287033747795,-0.049982238010657196,0.509293,0.860561,0,1,0,0.00784313725490196,-0.9409090927175843,0.106978870337478,0.05001776198934281,0,1,0,1,0,0.00784313725490196,-0.9409090927175843,0.106978870337478,-0.049982238010657196,0,1,0,1,0,0.00784313725490196,-0.7876370927175844,0.38618287033747795,0.05001776198934281,-0.509293,0.860561,0,1,0,0.00784313725490196,-0.7876370927175844,0.38618287033747795,-0.049982238010657196,-0.509293,0.860561,0,1,0,0.00784313725490196,-0.6981590927175844,0.38618287033747795,0.05001776198934281,0.864071,0.503311,0,1,0,0.00784313725490196,-0.6076680927175844,0.17243387033747798,0.05001776198934281,-0.479171,0.877682,0,0,0,0,-0.6076680927175844,0.17243387033747798,-0.049982238010657196,-0.479171,0.877682,0,0,0,0,-0.6202310927175844,0.16506887033747797,-0.049982238010657196,-0.531907,0.846797,0,0,0,0,-0.5950360927175844,0.178837870337478,0.05001776198934281,-0.425123,0.905118,0,0,0,0,-0.5950360927175844,0.178837870337478,-0.049982238010657196,-0.425123,0.905118,0,0,0,0,-0.5823530927175844,0.184335870337478,0.05001776198934281,-0.370586,0.92877,0,0,0,0,-0.5823530927175844,0.184335870337478,-0.049982238010657196,-0.370586,0.92877,0,0,0,0,-0.5696350927175844,0.188981870337478,0.05001776198934281,-0.316355,0.948607,0,0,0,0,-0.5696350927175844,0.188981870337478,-0.049982238010657196,-0.316355,0.948607,0,0,0,0,-0.5568990927175843,0.192831870337478,0.05001776198934281,-0.263283,0.96469,0,0,0,0,-0.5568990927175843,0.192831870337478,-0.049982238010657196,-0.263283,0.96469,0,0,0,0,-0.5441640927175844,0.19593887033747798,0.05001776198934281,-0.212043,0.977233,0,0,0,0,-0.5441640927175844,0.19593887033747798,-0.049982238010657196,-0.212043,0.977233,0,0,0,0,-0.5314460927175844,0.19835887033747795,0.05001776198934281,-0.163244,0.986572,0,0,0,0,-0.5314460927175844,0.19835887033747795,-0.049982238010657196,-0.163244,0.986572,0,0,0,0,-0.5187620927175843,0.200145870337478,0.05001776198934281,-0.117405,0.993072,0,0,0,0,-0.5187620927175843,0.200145870337478,-0.049982238010657196,-0.117405,0.993072,0,0,0,0,-0.5061310927175844,0.20135487033747795,0.05001776198934281,-0.074862,0.997192,0,0,0,0,-0.5061310927175844,0.20135487033747795,-0.049982238010657196,-0.074862,0.997192,0,0,0,0,-0.4935680927175844,0.202039870337478,0.05001776198934281,-0.03589,0.999329,0,0,0,0,-0.4935680927175844,0.202039870337478,-0.049982238010657196,-0.03589,0.999329,0,0,0,0,-0.48109209271758435,0.202255870337478,0.05001776198934281,0.002899,0.999969,0,0,0,0,-0.48109209271758435,0.202255870337478,-0.049982238010657196,0.002899,0.999969,0,0,0,0,-0.4665000927175843,0.201917870337478,0.05001776198934281,0.047823,0.99884,0,0,0,0,-0.4665000927175843,0.201917870337478,-0.049982238010657196,0.047823,0.99884,0,0,0,0,-0.45294209271758434,0.20093287033747798,0.05001776198934281,0.099002,0.995056,0,0,0,0,-0.45294209271758434,0.20093287033747798,-0.049982238010657196,0.099002,0.995056,0,0,0,0,-0.44037909271758435,0.199342870337478,0.05001776198934281,0.153905,0.988067,0,0,0,0,-0.44037909271758435,0.199342870337478,-0.049982238010657196,0.153905,0.988067,0,0,0,0,-0.42877309271758435,0.19719287033747795,0.05001776198934281,0.212317,0.977172,0,0,0,0,-0.42877309271758435,0.19719287033747795,-0.049982238010657196,0.212317,0.977172,0,0,0,0,-0.4180890927175843,0.194524870337478,0.05001776198934281,0.273934,0.96173,0,0,0,0,-0.4180890927175843,0.194524870337478,-0.049982238010657196,0.273934,0.96173,0,0,0,0,-0.40828709271758434,0.191381870337478,0.05001776198934281,0.338206,0.941069,0,0,0,0,-0.40828709271758434,0.191381870337478,-0.049982238010657196,0.338206,0.941069,0,0,0,0,-0.3993310927175844,0.18780787033747798,0.05001776198934281,0.404279,0.914609,0,0,0,0,-0.3993310927175844,0.18780787033747798,-0.049982238010657196,0.404279,0.914609,0,0,0,0,-0.39118409271758436,0.18384487033747798,0.05001776198934281,0.471175,0.882015,0,0,0,0,-0.39118409271758436,0.18384487033747798,-0.049982238010657196,0.471175,0.882015,0,0,0,0,-0.3838080927175843,0.179536870337478,0.05001776198934281,0.537614,0.843165,0,0,0,0,-0.3838080927175843,0.179536870337478,-0.049982238010657196,0.537614,0.843165,0,0,0,0,-0.37716509271758436,0.174926870337478,0.05001776198934281,0.602283,0.798273,0,0,0,0,-0.37716509271758436,0.174926870337478,-0.049982238010657196,0.602283,0.798273,0,0,0,0,-0.3712180927175843,0.170057870337478,0.05001776198934281,0.663808,0.747856,0,0,0,0,-0.3712180927175843,0.170057870337478,-0.049982238010657196,0.663808,0.747856,0,0,0,0,-0.36593009271758437,0.16497387033747796,0.05001776198934281,0.729484,0.683981,0,0,0,0,-0.36593009271758437,0.16497387033747796,-0.049982238010657196,0.729484,0.683981,0,0,0,0,-0.35906109271758435,0.15684287033747796,0.05001776198934281,0.798456,0.602008,0,0,0,0,-0.35906109271758435,0.15684287033747796,-0.049982238010657196,0.798456,0.602008,0,0,0,0,-0.3533030927175843,0.148253870337478,0.05001776198934281,0.85818,0.513321,0,0,0,0,-0.3533030927175843,0.148253870337478,-0.049982238010657196,0.85818,0.513321,0,0,0,0,-0.3485570927175844,0.13930287033747796,0.05001776198934281,0.904447,0.426527,0,0,0,0,-0.3485570927175844,0.13930287033747796,-0.049982238010657196,0.904447,0.426527,0,0,0,0,-0.34472609271758436,0.13008487033747795,0.05001776198934281,0.938597,0.344951,0,0,0,0,-0.34472609271758436,0.13008487033747795,-0.049982238010657196,0.938597,0.344951,0,0,0,0,-0.3417130927175843,0.12069387033747797,0.05001776198934281,0.962645,0.270699,0,0,0,0,-0.3417130927175843,0.12069387033747797,-0.049982238010657196,0.962645,0.270699,0,0,0,0,-0.3394180927175844,0.11122487033747797,0.05001776198934281,0.978729,0.204993,0,0,0,0,-0.3394180927175844,0.11122487033747797,-0.049982238010657196,0.978729,0.205023,0,0,0,0,-0.33774509271758435,0.101772870337478,0.05001776198934281,0.988922,0.148289,0,0,0,0,-0.33774509271758435,0.101772870337478,-0.049982238010657196,0.988922,0.148289,0,0,0,0,-0.33659509271758437,0.09243387033747796,0.05001776198934281,0.994903,0.10062,0,0,0,0,-0.33659509271758437,0.09243387033747796,-0.049982238010657196,0.994903,0.10062,0,0,0,0,-0.3358710927175843,0.08330187033747799,0.05001776198934281,0.998077,0.061892,0,0,0,0,-0.3358710927175843,0.08330187033747799,-0.049982238010657196,0.998077,0.061922,0,0,0,0,-0.33547509271758436,0.07447187033747799,0.05001776198934281,0.999451,0.032228,0,0,0,0,-0.33547509271758436,0.07447187033747799,-0.049982238010657196,0.999451,0.032228,0,0,0,0,-0.33530909271758436,0.06603787033747799,0.05001776198934281,0.999908,0.011933,0,0,0,0,-0.33530909271758436,0.06603787033747799,-0.049982238010657196,0.999908,0.011933,0,0,0,0,-0.3352760927175843,0.05809687033747796,0.05001776198934281,0.999969,0.002106,0,0,0,0,-0.3352760927175843,0.05809687033747796,-0.049982238010657196,0.999969,0.002106,0,0,0,0,-0.3352760927175843,-0.07612012966252202,0.05001776198934281,0.999969,-0.002716,0,0,0,0,-0.3352760927175843,-0.07612012966252202,-0.049982238010657196,0.999969,-0.002716,0,0,0,0,-0.3353020927175844,-0.08102612966252203,0.05001776198934281,0.999969,-0.007569,0,0,0,0,-0.3353020927175844,-0.08102612966252203,-0.049982238010657196,0.999969,-0.007569,0,0,0,0,-0.33535209271758437,-0.08616512966252202,0.05001776198934281,0.999969,-0.007385,0,0,0,0,-0.33535209271758437,-0.08616512966252202,-0.049982238010657196,0.999969,-0.007355,0,0,0,0,-0.33537909271758437,-0.09146012966252202,0.05001776198934281,0.999969,0.001373,0,0,0,0,-0.33537909271758437,-0.09146012966252202,-0.049982238010657196,0.999969,0.001373,0,0,0,0,-0.3353370927175844,-0.09683212966252203,0.05001776198934281,0.999817,0.018525,0,0,0,0,-0.3353370927175844,-0.09683212966252203,-0.049982238010657196,0.999817,0.018555,0,0,0,0,-0.3351800927175843,-0.10220512966252202,0.05001776198934281,0.998993,0.044618,0,0,0,0,-0.3351800927175843,-0.10220512966252202,-0.049982238010657196,0.998993,0.044618,0,0,0,0,-0.33486109271758435,-0.10749912966252202,0.05001776198934281,0.996704,0.080874,0,0,0,0,-0.33486109271758435,-0.10749912966252202,-0.049982238010657196,0.996704,0.080874,0,0,0,0,-0.33433609271758435,-0.11263912966252201,0.05001776198934281,0.991607,0.129276,0,0,0,0,-0.33433609271758435,-0.11263912966252201,-0.049982238010657196,0.991607,0.129276,0,0,0,0,-0.3335570927175844,-0.11754512966252202,0.05001776198934281,0.981262,0.192633,0,0,0,0,-0.3335570927175844,-0.11754512966252202,-0.049982238010657196,0.981262,0.192663,0,0,0,0,-0.33247909271758436,-0.12214112966252202,0.05001776198934281,0.961516,0.274667,0,0,0,0,-0.33247909271758436,-0.12214112966252202,-0.049982238010657196,0.961516,0.274667,0,0,0,0,-0.3310560927175843,-0.126348129662522,0.05001776198934281,0.925321,0.379101,0,0,0,0,-0.3310560927175843,-0.126348129662522,-0.049982238010657196,0.925321,0.379101,0,0,0,0,-0.3292420927175843,-0.130089129662522,0.05001776198934281,0.861538,0.507675,0,0,0,0,-0.3292420927175843,-0.130089129662522,-0.049982238010657196,0.861507,0.507706,0,0,0,0,-0.3269910927175843,-0.133286129662522,0.05001776198934281,0.783258,0.621662,0,0,0,0,-0.3269910927175843,-0.133286129662522,-0.049982238010657196,0.783258,0.621662,0,0,0,0,-0.32540609271758436,-0.135063129662522,0.05001776198934281,0.702445,0.711722,0,0,0,0,-0.32540609271758436,-0.135063129662522,-0.049982238010657196,0.702414,0.711722,0,0,0,0,-0.3235650927175844,-0.136662129662522,0.05001776198934281,0.61037,0.792077,0,0,0,0,-0.3235650927175844,-0.136662129662522,-0.049982238010657196,0.61034,0.792108,0,0,0,0,-0.3214890927175843,-0.13807612966252203,0.05001776198934281,0.517808,0.855464,0,0,0,0,-0.3214890927175843,-0.13807612966252203,-0.049982238010657196,0.517808,0.855464,0,0,0,0,-0.31919709271758434,-0.139301129662522,0.05001776198934281,0.427198,0.904141,0,0,0,0,-0.31919709271758434,-0.139301129662522,-0.049982238010657196,0.427198,0.904141,0,0,0,0,-0.3167090927175843,-0.140330129662522,0.05001776198934281,0.339793,0.940489,0,0,0,0,-0.3167090927175843,-0.140330129662522,-0.049982238010657196,0.339793,0.940489,0,0,0,0,-0.3140450927175843,-0.14115712966252203,0.05001776198934281,0.25605,0.966643,0,0,0,0,-0.3140450927175843,-0.14115712966252203,-0.049982238010657196,0.25605,0.966643,0,0,0,0,-0.3112270927175843,-0.141778129662522,0.05001776198934281,0.175939,0.984375,0,0,0,0,-0.3112270927175843,-0.141778129662522,-0.049982238010657196,0.175939,0.984375,0,0,0,0,-0.3082730927175843,-0.142185129662522,0.05001776198934281,0.099124,0.995056,0,0,0,0,-0.3082730927175843,-0.142185129662522,-0.049982238010657196,0.099094,0.995056,0,0,0,0,-0.3052040927175843,-0.14237412966252203,0.05001776198934281,0.025117,0.999664,0,0,0,0,-0.3052040927175843,-0.14237412966252203,-0.049982238010657196,0.025117,0.999664,0,0,0,0,-0.30204009271758436,-0.14233912966252202,0.05001776198934281,-0.04648,0.998901,0,0,0,0,-0.30204009271758436,-0.14233912966252202,-0.049982238010657196,-0.04648,0.998901,0,0,0,0,-0.29880109271758437,-0.14207312966252203,0.05001776198934281,-0.116184,0.993225,0,0,0,0,-0.29880109271758437,-0.14207312966252203,-0.049982238010657196,-0.116184,0.993194,0,0,0,0,-0.2955080927175844,-0.14157112966252203,0.05001776198934281,0.712851,0.701285,0,0,0,0,-0.2955080927175844,-0.14157112966252203,-0.049982238010657196,0.712821,0.701315,0,0,0,0,-0.3054500927175844,-0.20039512966252201,0.05001776198934281,0.720878,-0.693045,0,0,0,0,-0.3054500927175844,-0.20039512966252201,-0.049982238010657196,0.720878,-0.693045,0,0,0,0,-0.31205509271758436,-0.201781129662522,0.05001776198934281,0.168157,-0.985748,0,0,0,0,-0.31205509271758436,-0.201781129662522,-0.049982238010657196,0.168157,-0.985748,0,0,0,0,-0.3185900927175843,-0.20264312966252201,0.05001776198934281,0.093936,-0.995575,0,0,0,0,-0.3185900927175843,-0.20264312966252201,-0.049982238010657196,0.093936,-0.995575,0,0,0,0,-0.32502309271758434,-0.20301012966252202,0.05001776198934281,0.020661,-0.999756,0,0,0,0,-0.32502309271758434,-0.20301012966252202,-0.049982238010657196,0.020661,-0.999756,0,0,0,0,-0.33131709271758436,-0.202911129662522,0.05001776198934281,-0.051485,-0.998657,0,0,0,0,-0.33131709271758436,-0.202911129662522,-0.049982238010657196,-0.051485,-0.998657,0,0,0,0,-0.3374390927175843,-0.20237512966252202,0.05001776198934281,-0.122532,-0.992462,0,0,0,0,-0.3374390927175843,-0.20237512966252202,-0.049982238010657196,-0.122532,-0.992462,0,0,0,0,-0.3433530927175843,-0.20143112966252202,0.05001776198934281,-0.192602,-0.981262,0,0,0,0,-0.3433530927175843,-0.20143112966252202,-0.049982238010657196,-0.192602,-0.981262,0,0,0,0,-0.34902609271758434,-0.20010612966252203,0.05001776198934281,-0.262032,-0.965026,0,0,0,0,-0.34902609271758434,-0.20010612966252203,-0.049982238010657196,-0.262032,-0.965026,0,0,0,0,-0.3544230927175843,-0.19843112966252202,0.05001776198934281,-0.331217,-0.943541,0,0,0,0,-0.3544230927175843,-0.19843112966252202,-0.049982238010657196,-0.331217,-0.943541,0,0,0,0,-0.35950909271758436,-0.19643412966252202,0.05001776198934281,-0.400586,-0.916227,0,0,0,0,-0.35950909271758436,-0.19643412966252202,-0.049982238010657196,-0.400586,-0.916227,0,0,0,0,-0.36425009271758435,-0.194143129662522,0.05001776198934281,-0.470687,-0.88229,0,0,0,0,-0.36425009271758435,-0.194143129662522,-0.049982238010657196,-0.470687,-0.88229,0,0,0,0,-0.3686110927175843,-0.19158712966252203,0.05001776198934281,-0.541978,-0.840388,0,0,0,0,-0.3686110927175843,-0.19158712966252203,-0.049982238010657196,-0.541978,-0.840358,0,0,0,0,-0.37255809271758433,-0.18879612966252202,0.05001776198934281,-0.612812,-0.790216,0,0,0,0,-0.37255809271758433,-0.18879612966252202,-0.049982238010657196,-0.612812,-0.790216,0,0,0,0,-0.3754210927175844,-0.18636712966252203,0.05001776198934281,-0.673269,-0.739372,0,0,0,0,-0.3754210927175844,-0.18636712966252203,-0.049982238010657196,-0.673238,-0.739402,0,0,0,0,-0.37820009271758437,-0.183652129662522,0.05001776198934281,-0.720969,-0.692953,0,0,0,0,-0.37820009271758437,-0.183652129662522,-0.049982238010657196,-0.720969,-0.692953,0,0,0,0,-0.38088209271758433,-0.18067912966252203,0.05001776198934281,-0.761773,-0.647816,0,0,0,0,-0.38088209271758433,-0.18067912966252203,-0.049982238010657196,-0.761773,-0.647816,0,0,0,0,-0.3834510927175844,-0.17747312966252202,0.05001776198934281,-0.797052,-0.6039,0,0,0,0,-0.3834510927175844,-0.17747312966252202,-0.049982238010657196,-0.797052,-0.60387,0,0,0,0,-0.38589409271758435,-0.17406012966252202,0.05001776198934281,-0.827906,-0.560808,0,0,0,0,-0.38589409271758435,-0.17406012966252202,-0.049982238010657196,-0.827906,-0.560808,0,0,0,0,-0.3881960927175844,-0.17046512966252203,0.05001776198934281,-0.855251,-0.518174,0,0,0,0,-0.3881960927175844,-0.17046512966252203,-0.049982238010657196,-0.855251,-0.518204,0,0,0,0,-0.3903430927175844,-0.16671612966252203,0.05001776198934281,-0.879665,-0.475539,0,0,0,0,-0.3903430927175844,-0.16671612966252203,-0.049982238010657196,-0.879665,-0.475509,0,0,0,0,-0.39231909271758436,-0.16283612966252203,0.05001776198934281,-0.901669,-0.432356,0,0,0,0,-0.39231909271758436,-0.16283612966252203,-0.049982238010657196,-0.9017,-0.432325,0,0,0,0,-0.3941120927175843,-0.15885312966252202,0.05001776198934281,-0.921628,-0.388043,0,0,0,0,-0.3941120927175843,-0.15885312966252202,-0.049982238010657196,-0.921628,-0.388043,0,0,0,0,-0.3957060927175844,-0.154793129662522,0.05001776198934281,-0.939665,-0.342021,0,0,0,0,-0.3957060927175844,-0.154793129662522,-0.049982238010657196,-0.939665,-0.342051,0,0,0,0,-0.3970880927175844,-0.150681129662522,0.05001776198934281,-0.955901,-0.293619,0,0,0,0,-0.3970880927175844,-0.150681129662522,-0.049982238010657196,-0.955901,-0.293588,0,0,0,0,-0.3982420927175844,-0.146542129662522,0.05001776198934281,-0.243934,-0.969787,0,0,0,0,-0.3982420927175844,-0.146542129662522,-0.049982238010657196,-0.243934,-0.969756,0,0,0,0,-0.4014820927175844,-0.14991912966252202,0.05001776198934281,0.713645,-0.700461,0,0,0,0,-0.4014820927175844,-0.14991912966252202,-0.049982238010657196,0.713645,-0.700461,0,0,0,0,-0.4049730927175843,-0.153397129662522,0.05001776198934281,0.697836,-0.716208,0,0,0,0,-0.4049730927175843,-0.153397129662522,-0.049982238010657196,0.697836,-0.716208,0,0,0,0,-0.40868809271758433,-0.15693812966252202,0.05001776198934281,0.681753,-0.731559,0,0,0,0,-0.40868809271758433,-0.15693812966252202,-0.049982238010657196,0.681753,-0.731559,0,0,0,0,-0.4126020927175843,-0.16050412966252203,0.05001776198934281,0.664998,-0.746818,0,0,0,0,-0.4126020927175843,-0.16050412966252203,-0.049982238010657196,0.664998,-0.746818,0,0,0,0,-0.41668909271758436,-0.164059129662522,0.05001776198934281,0.647175,-0.762322,0,0,0,0,-0.41668909271758436,-0.164059129662522,-0.049982238010657196,0.647175,-0.762322,0,0,0,0,-0.4209220927175843,-0.16756612966252202,0.05001776198934281,0.627827,-0.778314,0,0,0,0,-0.4209220927175843,-0.16756612966252202,-0.049982238010657196,0.627827,-0.778314,0,0,0,0,-0.4252760927175844,-0.17098612966252202,0.05001776198934281,0.606555,-0.795007,0,0,0,0,-0.4252760927175844,-0.17098612966252202,-0.049982238010657196,0.606555,-0.795007,0,0,0,0,-0.4297250927175843,-0.17428212966252202,0.05001776198934281,0.582781,-0.812616,0,0,0,0,-0.4297250927175843,-0.17428212966252202,-0.049982238010657196,0.582781,-0.812616,0,0,0,0,-0.4342430927175843,-0.17741712966252202,0.05001776198934281,0.555803,-0.831294,0,0,0,0,-0.4342430927175843,-0.17741712966252202,-0.049982238010657196,0.555803,-0.831294,0,0,0,0,-0.43880409271758436,-0.180354129662522,0.05001776198934281,0.524796,-0.851192,0,0,0,0,-0.43880409271758436,-0.180354129662522,-0.049982238010657196,0.524796,-0.851192,0,0,0,0,-0.44338209271758433,-0.18305512966252202,0.05001776198934281,0.488723,-0.872433,0,0,0,0,-0.44338209271758433,-0.18305512966252202,-0.049982238010657196,0.488723,-0.872433,0,0,0,0,-0.4479520927175843,-0.18548212966252203,0.05001776198934281,0.456038,-0.88992,0,0,0,0,-0.4479520927175843,-0.18548212966252203,-0.049982238010657196,0.456069,-0.88992,0,0,0,0,-0.45287209271758433,-0.18791312966252202,0.05001776198934281,0.423231,-0.906003,0,0,0,0,-0.45287209271758433,-0.18791312966252202,-0.049982238010657196,0.423231,-0.906003,0,0,0,0,-0.45811209271758435,-0.19022312966252203,0.05001776198934281,0.383465,-0.923521,0,0,0,0,-0.45811209271758435,-0.19022312966252203,-0.049982238010657196,0.383465,-0.923521,0,0,0,0,-0.46368009271758437,-0.192395129662522,0.05001776198934281,0.343364,-0.939177,0,0,0,0,-0.46368009271758437,-0.192395129662522,-0.049982238010657196,0.343364,-0.939177,0,0,0,0,-0.4695850927175843,-0.19441112966252203,0.05001776198934281,0.30314,-0.95291,0,0,0,0,-0.4695850927175843,-0.19441112966252203,-0.049982238010657196,0.30314,-0.95291,0,0,0,0,-0.4758350927175844,-0.196255129662522,0.05001776198934281,0.263039,-0.964782,0,0,0,0,-0.4758350927175844,-0.196255129662522,-0.049982238010657196,0.263039,-0.964782,0,0,0,0,-0.4824380927175843,-0.19791012966252203,0.05001776198934281,0.223212,-0.974761,0,0,0,0,-0.4824380927175843,-0.19791012966252203,-0.049982238010657196,0.223212,-0.974761,0,0,0,0,-0.48940409271758434,-0.19935712966252203,0.05001776198934281,0.183905,-0.98294,0,0,0,0,-0.48940409271758434,-0.19935712966252203,-0.049982238010657196,0.183905,-0.98294,0,0,0,0,-0.4967410927175844,-0.20057912966252203,0.05001776198934281,0.145238,-0.98938,0,0,0,0,-0.4967410927175844,-0.20057912966252203,-0.049982238010657196,0.145238,-0.98938,0,0,0,0,-0.5044580927175843,-0.20156012966252201,0.05001776198934281,0.107425,-0.994201,0,0,0,0,-0.5044580927175843,-0.20156012966252201,-0.049982238010657196,0.107425,-0.994201,0,0,0,0,-0.5125630927175844,-0.20228212966252201,0.05001776198934281,0.070559,-0.997497,0,0,0,0,-0.5125630927175844,-0.20228212966252201,-0.049982238010657196,0.070559,-0.997497,0,0,0,0,-0.5210650927175844,-0.20272812966252202,0.05001776198934281,0.03473,-0.99939,0,0,0,0,-0.5210650927175844,-0.20272812966252202,-0.049982238010657196,0.03473,-0.99939,0,0,0,0,-0.5299730927175843,-0.20288112966252203,0.05001776198934281,0.00119,-0.999969,0,0,0,0,-0.5299730927175843,-0.20288112966252203,-0.049982238010657196,0.00119,-0.999969,0,0,0,0,-0.5377340927175843,-0.20276612966252203,0.05001776198934281,-0.031556,-0.999481,0,0,0,0,-0.5377340927175843,-0.20276612966252203,-0.049982238010657196,-0.031556,-0.999481,0,0,0,0,-0.5456610927175843,-0.20238212966252203,0.05001776198934281,-0.068636,-0.99762,0,0,0,0,-0.5456610927175843,-0.20238212966252203,-0.049982238010657196,-0.068636,-0.99762,0,0,0,0,-0.5537150927175843,-0.201664129662522,0.05001776198934281,-0.112308,-0.993652,0,0,0,0,-0.5537150927175843,-0.201664129662522,-0.049982238010657196,-0.112308,-0.993652,0,0,0,0,-0.5618550927175844,-0.20054812966252203,0.05001776198934281,-0.16242,-0.986694,0,0,0,0,-0.5618550927175844,-0.20054812966252203,-0.049982238010657196,-0.16242,-0.986694,0,0,0,0,-0.5700410927175843,-0.198973129662522,0.05001776198934281,-0.218696,-0.975768,0,0,0,0,-0.5700410927175843,-0.198973129662522,-0.049982238010657196,-0.218696,-0.975768,0,0,0,0,-0.5782330927175844,-0.19687412966252202,0.05001776198934281,-0.280618,-0.959807,0,0,0,0,-0.5782330927175844,-0.19687412966252202,-0.049982238010657196,-0.280618,-0.959807,0,0,0,0,-0.5863910927175844,-0.19418812966252202,0.05001776198934281,-0.347362,-0.937712,0,0,0,0,-0.5863910927175844,-0.19418812966252202,-0.049982238010657196,-0.347362,-0.937712,0,0,0,0,-0.5944730927175843,-0.19085212966252202,0.05001776198934281,-0.417615,-0.908597,0,0,0,0,-0.5944730927175843,-0.19085212966252202,-0.049982238010657196,-0.417615,-0.908597,0,0,0,0,-0.6024410927175844,-0.18680212966252202,0.05001776198934281,-0.489731,-0.871853,0,0,0,0,-0.6024410927175844,-0.18680212966252202,-0.049982238010657196,-0.489731,-0.871853,0,0,0,0,-0.6102530927175843,-0.18197612966252202,0.05001776198934281,-0.561724,-0.827296,0,0,0,0,-0.6102530927175843,-0.18197612966252202,-0.049982238010657196,-0.561724,-0.827296,0,0,0,0,-0.6178700927175843,-0.17631012966252202,0.05001776198934281,-0.631458,-0.775384,0,0,0,0,-0.6178700927175843,-0.17631012966252202,-0.049982238010657196,-0.631458,-0.775384,0,0,0,0,-0.6252510927175844,-0.16974012966252203,0.05001776198934281,-0.688131,-0.725547,0,0,0,0,-0.6252510927175844,-0.16974012966252203,-0.049982238010657196,-0.688131,-0.725547,0,0,0,0,-0.6295900927175844,-0.16535612966252203,0.05001776198934281,-0.731315,-0.682028,0,0,0,0,-0.6295900927175844,-0.16535612966252203,-0.049982238010657196,-0.731315,-0.682028,0,0,0,0,-0.6338690927175844,-0.160485129662522,0.05001776198934281,-0.77102,-0.636769,0,0,0,0,-0.6338690927175844,-0.160485129662522,-0.049982238010657196,-0.77102,-0.636769,0,0,0,0,-0.6380280927175843,-0.155125129662522,0.05001776198934281,-0.808954,-0.587817,0,0,0,0,-0.6380280927175843,-0.155125129662522,-0.049982238010657196,-0.808985,-0.587817,0,0,0,0,-0.6420050927175843,-0.149273129662522,0.05001776198934281,-0.844874,-0.534928,0,0,0,0,-0.6420050927175843,-0.149273129662522,-0.049982238010657196,-0.844874,-0.534928,0,0,0,0,-0.6457400927175844,-0.14292712966252202,0.05001776198934281,-0.878292,-0.478072,0,0,0,0,-0.6457400927175844,-0.14292712966252202,-0.049982238010657196,-0.878292,-0.478072,0,0,0,0,-0.6491740927175843,-0.136083129662522,0.05001776198934281,-0.90875,-0.41731,0,0,0,0,-0.6491740927175843,-0.136083129662522,-0.049982238010657196,-0.90875,-0.41728,0,0,0,0,-0.6522450927175844,-0.12873812966252202,0.05001776198934281,-0.935636,-0.352947,0,0,0,0,-0.6522450927175844,-0.12873812966252202,-0.049982238010657196,-0.935636,-0.352916,0,0,0,0,-0.6548930927175843,-0.12089012966252202,0.05001776198934281,-0.958373,-0.28544,0,0,0,0,-0.6548930927175843,-0.12089012966252202,-0.049982238010657196,-0.958373,-0.28544,0,0,0,0,-0.6570570927175844,-0.11253512966252202,0.05001776198934281,-0.976501,-0.215491,0,0,0,0,-0.6570570927175844,-0.11253512966252202,-0.049982238010657196,-0.976501,-0.215491,0,0,0,0,-0.6586780927175844,-0.10367112966252202,0.05001776198934281,-0.989563,-0.143956,0,0,0,0,-0.6586780927175844,-0.10367112966252202,-0.049982238010657196,-0.989563,-0.143956,0,0,0,0,-0.6596950927175843,-0.09429612966252202,0.05001776198934281,-0.997406,-0.071749,0,0,0,0,-0.6596950927175843,-0.09429612966252202,-0.049982238010657196,-0.997406,-0.071749,0,0,0,0,-0.6600480927175844,-0.08440512966252202,0.05001776198934281,-0.999969,0.000732,0,0,0,0,-0.6600480927175844,-0.08440512966252202,-0.049982238010657196,-0.999969,0.000732,0,0,0,0,-0.6596960927175843,-0.07492812966252202,0.05001776198934281,-0.997192,0.07474,0,0,0,0,-0.6596960927175843,-0.07492812966252202,-0.049982238010657196,-0.997192,0.07474,0,0,0,0,-0.6586820927175844,-0.06595912966252201,0.05001776198934281,-0.988708,0.149754,0,0,0,0,-0.6586820927175844,-0.06595912966252201,-0.049982238010657196,-0.988708,0.149754,0,0,0,0,-0.6570700927175843,-0.05749212966252201,0.05001776198934281,-0.97467,0.223609,0,0,0,0,-0.6570700927175843,-0.05749212966252201,-0.049982238010657196,-0.97467,0.223609,0,0,0,0,-0.6549230927175843,-0.04951612966252203,0.05001776198934281,-0.955443,0.295114,0,0,0,0,-0.6549230927175843,-0.04951612966252203,-0.049982238010657196,-0.955443,0.295144,0,0,0,0,-0.6523040927175844,-0.04202312966252203,0.05001776198934281,-0.931669,0.363231,0,0,0,0,-0.6523040927175844,-0.04202312966252203,-0.049982238010657196,-0.931669,0.363231,0,0,0,0,-0.6492770927175844,-0.035006129662522006,0.05001776198934281,-0.904172,0.427107,0,0,0,0,-0.6492770927175844,-0.035006129662522006,-0.049982238010657196,-0.904172,0.427107,0,0,0,0,-0.6459050927175843,-0.028454129662522032,0.05001776198934281,-0.873836,0.48619,0,0,0,0,-0.6459050927175843,-0.028454129662522032,-0.049982238010657196,-0.873806,0.486221,0,0,0,0,-0.6422500927175844,-0.022359129662522015,0.05001776198934281,-0.841487,0.540239,0,0,0,0,-0.6422500927175844,-0.022359129662522015,-0.049982238010657196,-0.841487,0.540239,0,0,0,0,-0.6383770927175844,-0.01671412966252203,0.05001776198934281,-0.808039,0.589099,0,0,0,0,-0.6383770927175844,-0.01671412966252203,-0.049982238010657196,-0.808039,0.589068,0,0,0,0,-0.6343490927175843,-0.011508129662522015,0.05001776198934281,-0.774194,0.632923,0,0,0,0,-0.6343490927175843,-0.011508129662522015,-0.049982238010657196,-0.774194,0.632923,0,0,0,0,-0.6302280927175844,-0.006734129662522015,0.05001776198934281,-0.740562,0.671957,0,0,0,0,-0.6302280927175844,-0.006734129662522015,-0.049982238010657196,-0.740562,0.671957,0,0,0,0,-0.6260790927175843,-0.002383129662522021,0.05001776198934281,-0.698233,0.715842,0,0,0,0,-0.6260790927175843,-0.002383129662522021,-0.049982238010657196,-0.698233,0.715842,0,0,0,0,-0.6176780927175843,0.005237870337477968,0.05001776198934281,-0.637318,0.770592,0,0,0,0,-0.6176780927175843,0.005237870337477968,-0.049982238010657196,-0.637318,0.770592,0,0,0,0,-0.6087150927175844,0.01198487033747797,0.05001776198934281,-0.568072,0.822962,0,0,0,0,-0.6087150927175844,0.01198487033747797,-0.049982238010657196,-0.568072,0.822962,0,0,0,0,-0.5993210927175844,0.01791487033747799,0.05001776198934281,-0.502487,0.864559,0,0,0,0,-0.5993210927175844,0.01791487033747799,-0.049982238010657196,-0.502487,0.864559,0,0,0,0,-0.5896250927175843,0.02308487033747797,0.05001776198934281,-0.441725,0.897122,0,0,0,0,-0.5896250927175843,0.02308487033747797,-0.049982238010657196,-0.441725,0.897122,0,0,0,0,-0.5797570927175844,0.02755387033747797,0.05001776198934281,-0.386364,0.92233,0,0,0,0,-0.5797570927175844,0.02755387033747797,-0.049982238010657196,-0.386364,0.92233,0,0,0,0,-0.5698450927175843,0.03137787033747799,0.05001776198934281,-0.336528,0.941649,0,0,0,0,-0.5698450927175843,0.03137787033747799,-0.049982238010657196,-0.336528,0.941649,0,0,0,0,-0.5600190927175843,0.03461487033747798,0.05001776198934281,-0.292123,0.956359,0,0,0,0,-0.5600190927175843,0.03461487033747798,-0.049982238010657196,-0.292123,0.956359,0,0,0,0,-0.5504100927175843,0.03732287033747797,0.05001776198934281,-0.252968,0.967467,0,0,0,0,-0.5504100927175843,0.03732287033747797,-0.049982238010657196,-0.252968,0.967467,0,0,0,0,-0.5411450927175844,0.039558870337477986,0.05001776198934281,-0.218818,0.975738,0,0,0,0,-0.5411450927175844,0.039558870337477986,-0.049982238010657196,-0.218818,0.975738,0,0,0,0,-0.5323550927175843,0.041380870337477976,0.05001776198934281,-0.189581,0.981842,0,0,0,0,-0.5323550927175843,0.041380870337477976,-0.049982238010657196,-0.189581,0.981842,0,0,0,0,-0.5241690927175844,0.04284687033747797,0.05001776198934281,-0.16538,0.986206,0,0,0,0,-0.5241690927175844,0.04284687033747797,-0.049982238010657196,-0.16538,0.986206,0,0,0,0,-0.5167170927175844,0.04401287033747797,0.05001776198934281,-0.143773,0.989593,0,0,0,0,-0.5167170927175844,0.04401287033747797,-0.049982238010657196,-0.143773,0.989593,0,0,0,0,-0.5078400927175843,0.04520387033747797,0.05001776198934281,-0.125248,0.992096,0,0,0,0,-0.5078400927175843,0.04520387033747797,-0.049982238010657196,-0.125248,0.992096,0,0,0,0,-0.49865509271758435,0.046290870337477974,0.05001776198934281,-0.110691,0.993835,0,0,0,0,-0.49865509271758435,0.046290870337477974,-0.049982238010657196,-0.110721,0.993835,0,0,0,0,-0.48923409271758433,0.04727487033747799,0.05001776198934281,-0.097659,0.995209,0,0,0,0,-0.48923409271758433,0.04727487033747799,-0.049982238010657196,-0.097659,0.995209,0,0,0,0,-0.4796500927175843,0.04815487033747798,0.05001776198934281,-0.085726,0.996307,0,0,0,0,-0.4796500927175843,0.04815487033747798,-0.049982238010657196,-0.085726,0.996307,0,0,0,0,-0.46997309271758436,0.04893187033747798,0.05001776198934281,-0.074618,0.997192,0,0,0,0,-0.46997309271758436,0.04893187033747798,-0.049982238010657196,-0.074618,0.997192,0,0,0,0,-0.4602760927175843,0.049604870337477985,0.05001776198934281,-0.064089,0.997925,0,0,0,0,-0.4602760927175843,0.049604870337477985,-0.049982238010657196,-0.064089,0.997925,0,0,0,0,-0.45063009271758436,0.05017487033747797,0.05001776198934281,-0.053896,0.998535,0,0,0,0,-0.45063009271758436,0.05017487033747797,-0.049982238010657196,-0.053896,0.998535,0,0,0,0,-0.44110909271758436,0.05064087033747797,0.05001776198934281,-0.043855,0.999023,0,0,0,0,-0.44110909271758436,0.05064087033747797,-0.049982238010657196,-0.043855,0.999023,0,0,0,0,-0.4317830927175843,0.05100287033747797,0.05001776198934281,-0.033692,0.99942,0,0,0,0,-0.4317830927175843,0.05100287033747797,-0.049982238010657196,-0.033692,0.99942,0,0,0,0,-0.4227250927175843,0.05126187033747798,0.05001776198934281,-0.023164,0.999725,0,0,0,0,-0.4227250927175843,0.05126187033747798,-0.049982238010657196,-0.023164,0.999725,0,0,0,0,-0.4140060927175844,0.05141687033747799,0.05001776198934281,-0.011994,0.999908,0,0,0,0,-0.4140060927175844,0.05141687033747799,-0.049982238010657196,-0.011994,0.999908,0,0,0,0,-0.4056980927175844,0.05146887033747799,0.05001776198934281,-0.709281,0.704886,0,0,0,0,-0.4056980927175844,0.05146887033747799,-0.049982238010657196,-0.709281,0.704886,0,0,0,0,-0.4056980927175844,0.05561187033747797,0.05001776198934281,-0.999969,-0.002258,0,0,0,0,-0.4056980927175844,0.05561187033747797,-0.049982238010657196,-0.999969,-0.002258,0,0,0,0,-0.4057250927175844,0.061537870337477985,0.05001776198934281,-0.999908,-0.011933,0,0,0,0,-0.4057250927175844,0.061537870337477985,-0.049982238010657196,-0.999908,-0.011933,0,0,0,0,-0.40584409271758437,0.06767087033747798,0.05001776198934281,-0.999512,-0.031068,0,0,0,0,-0.40584409271758437,0.06767087033747798,-0.049982238010657196,-0.999512,-0.031068,0,0,0,0,-0.4061120927175843,0.07394187033747796,0.05001776198934281,-0.99826,-0.058779,0,0,0,0,-0.4061120927175843,0.07394187033747796,-0.049982238010657196,-0.99826,-0.058779,0,0,0,0,-0.40658809271758434,0.080282870337478,0.05001776198934281,-0.995422,-0.095401,0,0,0,0,-0.40658809271758434,0.080282870337478,-0.049982238010657196,-0.995422,-0.095401,0,0,0,0,-0.4073280927175843,0.08662287033747795,0.05001776198934281,-0.989929,-0.141545,0,0,0,0,-0.4073280927175843,0.08662287033747795,-0.049982238010657196,-0.989929,-0.141514,0,0,0,0,-0.40839109271758434,0.09289387033747798,0.05001776198934281,-0.980163,-0.198065,0,0,0,0,-0.40839109271758434,0.09289387033747798,-0.049982238010657196,-0.980163,-0.198035,0,0,0,0,-0.4098330927175844,0.09902687033747798,0.05001776198934281,-0.964019,-0.265786,0,0,0,0,-0.4098330927175844,0.09902687033747798,-0.049982238010657196,-0.964019,-0.265786,0,0,0,0,-0.41171209271758435,0.10495287033747797,0.05001776198934281,-0.938505,-0.345195,0,0,0,0,-0.41171209271758435,0.10495287033747797,-0.049982238010657196,-0.938505,-0.345195,0,0,0,0,-0.41408709271758437,0.11060287033747795,0.05001776198934281,-0.899991,-0.435835,0,0,0,0,-0.41408709271758437,0.11060287033747795,-0.049982238010657196,-0.899991,-0.435835,0,0,0,0,-0.41701309271758435,0.11590787033747796,0.05001776198934281,-0.844508,-0.535508,0,0,0,0,-0.41701309271758435,0.11590787033747796,-0.049982238010657196,-0.844508,-0.535508,0,0,0,0,-0.42055009271758437,0.12079887033747799,0.05001776198934281,-0.768731,-0.639546,0,0,0,0,-0.42055009271758437,0.12079887033747799,-0.049982238010657196,-0.7687,-0.639546,0,0,0,0,-0.42475409271758435,0.125205870337478,0.05001776198934281,-0.683859,-0.729606,0,0,0,0,-0.42475409271758435,0.125205870337478,-0.049982238010657196,-0.683828,-0.729606,0,0,0,0,-0.42869609271758435,0.12850687033747799,0.05001776198934281,-0.598621,-0.800989,0,0,0,0,-0.42869609271758435,0.12850687033747799,-0.049982238010657196,-0.598621,-0.800989,0,0,0,0,-0.4330270927175843,0.13138487033747798,0.05001776198934281,-0.512375,-0.85873,0,0,0,0,-0.4330270927175843,0.13138487033747798,-0.049982238010657196,-0.512345,-0.85876,0,0,0,0,-0.4376860927175843,0.133865870337478,0.05001776198934281,-0.432264,-0.90173,0,0,0,0,-0.4376860927175843,0.133865870337478,-0.049982238010657196,-0.432264,-0.90173,0,0,0,0,-0.4426120927175844,0.135975870337478,0.05001776198934281,-0.359661,-0.933073,0,0,0,0,-0.4426120927175844,0.135975870337478,-0.049982238010657196,-0.359661,-0.933073,0,0,0,0,-0.44774609271758437,0.137740870337478,0.05001776198934281,-0.294717,-0.955565,0,0,0,0,-0.44774609271758437,0.137740870337478,-0.049982238010657196,-0.294717,-0.955565,0,0,0,0,-0.4530260927175843,0.139186870337478,0.05001776198934281,-0.237068,-0.971465,0,0,0,0,-0.4530260927175843,0.139186870337478,-0.049982238010657196,-0.237037,-0.971465,0,0,0,0,-0.4583930927175843,0.140338870337478,0.05001776198934281,-0.185919,-0.982543,0,0,0,0,-0.4583930927175843,0.140338870337478,-0.049982238010657196,-0.185919,-0.982543,0,0,0,0,-0.4637850927175844,0.141222870337478,0.05001776198934281,-0.140538,-0.990051,0,0,0,0,-0.4637850927175844,0.141222870337478,-0.049982238010657196,-0.140538,-0.990051,0,0,0,0,-0.46914309271758436,0.141865870337478,0.05001776198934281,-0.10004,-0.994964,0,0,0,0,-0.46914309271758436,0.141865870337478,-0.049982238010657196,-0.10004,-0.994964,0,0,0,0,-0.4744060927175844,0.142292870337478,0.05001776198934281,-0.063662,-0.997955,0,0,0,0,-0.4744060927175844,0.142292870337478,-0.049982238010657196,-0.063662,-0.997955,0,0,0,0,-0.4795140927175844,0.14253087033747797,0.05001776198934281,-0.030702,-0.999512,0,0,0,0,-0.4795140927175844,0.14253087033747797,-0.049982238010657196,-0.030702,-0.999512,0,0,0,0,-0.4844060927175844,0.14260387033747796,0.05001776198934281,0.001038,-0.999969,0,0,0,0,-0.4844060927175844,0.14260387033747796,-0.049982238010657196,0.001038,-0.999969,0,0,0,0,-0.4903280927175844,0.142502870337478,0.05001776198934281,0.034028,-0.99942,0,0,0,0,-0.4903280927175844,0.142502870337478,-0.049982238010657196,0.034028,-0.99942,0,0,0,0,-0.4960850927175844,0.14220887033747798,0.05001776198934281,0.067476,-0.997711,0,0,0,0,-0.4960850927175844,0.14220887033747798,-0.049982238010657196,0.067476,-0.997711,0,0,0,0,-0.5016880927175843,0.141736870337478,0.05001776198934281,0.099918,-0.994964,0,0,0,0,-0.5016880927175843,0.141736870337478,-0.049982238010657196,0.099918,-0.994964,0,0,0,0,-0.5071430927175844,0.14110087033747798,0.05001776198934281,0.131016,-0.991363,0,0,0,0,-0.5071430927175844,0.14110087033747798,-0.049982238010657196,0.131016,-0.991363,0,0,0,0,-0.5124610927175843,0.14031487033747797,0.05001776198934281,0.160497,-0.98703,0,0,0,0,-0.5124610927175843,0.14031487033747797,-0.049982238010657196,0.160497,-0.98703,0,0,0,0,-0.5176490927175843,0.13939387033747797,0.05001776198934281,0.188086,-0.982147,0,0,0,0,-0.5176490927175843,0.13939387033747797,-0.049982238010657196,0.188086,-0.982147,0,0,0,0,-0.5227170927175844,0.13835187033747798,0.05001776198934281,0.213569,-0.976897,0,0,0,0,-0.5227170927175844,0.13835187033747798,-0.049982238010657196,0.213569,-0.976897,0,0,0,0,-0.5276720927175843,0.137203870337478,0.05001776198934281,0.236732,-0.971557,0,0,0,0,-0.5276720927175843,0.137203870337478,-0.049982238010657196,0.236732,-0.971557,0,0,0,0,-0.5325230927175844,0.135962870337478,0.05001776198934281,0.257363,-0.966308,0,0,0,0,-0.5325230927175844,0.135962870337478,-0.049982238010657196,0.257363,-0.966308,0,0,0,0,-0.5372800927175844,0.13464487033747796,0.05001776198934281,0.275307,-0.961333,0,0,0,0,-0.5372800927175844,0.13464487033747796,-0.049982238010657196,0.275307,-0.961333,0,0,0,0,-0.5419500927175843,0.133263870337478,0.05001776198934281,0.290475,-0.956877,0,0,0,0,-0.5419500927175843,0.133263870337478,-0.049982238010657196,0.290475,-0.956877,0,0,0,0,-0.5465430927175844,0.13183387033747795,0.05001776198934281,0.309183,-0.950987,0,0,0,0,-0.5465430927175844,0.13183387033747795,-0.049982238010657196,0.309183,-0.950987,0,0,0,0,-0.5508770927175843,0.13036487033747796,0.05001776198934281,0.326395,-0.945219,0,0,0,0,-0.5508770927175843,0.13036487033747796,-0.049982238010657196,0.326395,-0.945219,0,0,0,0,-0.5551850927175843,0.12884987033747797,0.05001776198934281,0.337962,-0.94113,0,0,0,0,-0.5551850927175843,0.12884987033747797,-0.049982238010657196,0.337962,-0.94113,0,0,0,0,-0.5594760927175844,0.12727687033747798,0.05001776198934281,0.351054,-0.936338,0,0,0,0,-0.5594760927175844,0.12727687033747798,-0.049982238010657196,0.351054,-0.936338,0,0,0,0,-0.5637580927175844,0.125634870337478,0.05001776198934281,0.365551,-0.930754,0,0,0,0,-0.5637580927175844,0.125634870337478,-0.049982238010657196,0.365551,-0.930754,0,0,0,0,-0.5680400927175844,0.123912870337478,0.05001776198934281,0.381298,-0.924436,0,0,0,0,-0.5680400927175844,0.123912870337478,-0.049982238010657196,0.381298,-0.924436,0,0,0,0,-0.5723300927175844,0.12209887033747796,0.05001776198934281,0.398083,-0.917325,0,0,0,0,-0.5723300927175844,0.12209887033747796,-0.049982238010657196,0.398083,-0.917325,0,0,0,0,-0.5766380927175844,0.12018087033747799,0.05001776198934281,0.415693,-0.909482,0,0,0,0,-0.5766380927175844,0.12018087033747799,-0.049982238010657196,0.415693,-0.909482,0,0,0,0,-0.5809720927175843,0.11814787033747798,0.05001776198934281,0.433943,-0.900937,0,0,0,0,-0.5809720927175843,0.11814787033747798,-0.049982238010657196,0.433912,-0.900937,0,0,0,0,-0.5853400927175844,0.11598887033747796,0.05001776198934281,0.452559,-0.89172,0,0,0,0,-0.5853400927175844,0.11598887033747796,-0.049982238010657196,0.452559,-0.89172,0,0,0,0,-0.5897520927175843,0.11369087033747799,0.05001776198934281,0.471358,-0.881924,0,0,0,0,-0.5897520927175843,0.11369087033747799,-0.049982238010657196,0.471358,-0.881924,0,0,0,0,-0.5942150927175843,0.11124387033747796,0.05001776198934281,0.490158,-0.871609,0,0,0,0,-0.5942150927175843,0.11124387033747796,-0.049982238010657196,0.490158,-0.871609,0,0,0,0,-0.5987390927175843,0.10863587033747796,0.05001776198934281,-0.214515,-0.976714,0,0,0,0,-0.5987390927175843,0.10863587033747796,-0.049982238010657196,-0.214515,-0.976714,0,0,0,0,-0.6327070927175843,0.15668887033747797,0.05001776198934281,-0.983459,0.180975,0,0,0,0,-0.6327070927175843,0.15668887033747797,-0.049982238010657196,-0.983459,0.180975,0,0,0,0,-0.6202310927175844,0.16506887033747797,0.05001776198934281,-0.531907,0.846767,0,0,0,0,-0.4115240927175844,-0.005912129662522025,0.05001776198934281,0.038606,-0.999237,0,0,0,0,-0.4115240927175844,-0.005912129662522025,-0.049982238010657196,0.038606,-0.999237,0,0,0,0,-0.40678909271758434,-0.00575012966252203,-0.049982238010657196,0.026673,-0.999634,0,0,0,0,-0.4179570927175843,-0.006189129662522025,0.05001776198934281,0.046846,-0.998871,0,0,0,0,-0.4179570927175843,-0.006189129662522025,-0.049982238010657196,0.046846,-0.998871,0,0,0,0,-0.42579709271758437,-0.006587129662522007,0.05001776198934281,0.054567,-0.998505,0,0,0,0,-0.42579709271758437,-0.006587129662522007,-0.049982238010657196,0.054567,-0.998505,0,0,0,0,-0.43475309271758433,-0.007112129662522032,0.05001776198934281,0.062716,-0.998016,0,0,0,0,-0.43475309271758433,-0.007112129662522032,-0.049982238010657196,0.062716,-0.998016,0,0,0,0,-0.4445340927175844,-0.007769129662522023,0.05001776198934281,0.071902,-0.997406,0,0,0,0,-0.4445340927175844,-0.007769129662522023,-0.049982238010657196,0.071902,-0.997406,0,0,0,0,-0.4548510927175844,-0.008564129662522013,0.05001776198934281,0.082675,-0.996551,0,0,0,0,-0.4548510927175844,-0.008564129662522013,-0.049982238010657196,0.082675,-0.996551,0,0,0,0,-0.4654120927175843,-0.009502129662522008,0.05001776198934281,0.095737,-0.995392,0,0,0,0,-0.4654120927175843,-0.009502129662522008,-0.049982238010657196,0.095737,-0.995392,0,0,0,0,-0.47592609271758435,-0.010591129662522014,0.05001776198934281,0.112125,-0.993683,0,0,0,0,-0.47592609271758435,-0.010591129662522014,-0.049982238010657196,0.112125,-0.993683,0,0,0,0,-0.4861050927175844,-0.011834129662522008,0.05001776198934281,0.133396,-0.991058,0,0,0,0,-0.4861050927175844,-0.011834129662522008,-0.049982238010657196,0.133396,-0.991058,0,0,0,0,-0.4956560927175844,-0.013239129662522026,0.05001776198934281,0.162328,-0.986724,0,0,0,0,-0.4956560927175844,-0.013239129662522026,-0.049982238010657196,0.162328,-0.986724,0,0,0,0,-0.5042900927175843,-0.014811129662522016,0.05001776198934281,0.191595,-0.981445,0,0,0,0,-0.5042900927175843,-0.014811129662522016,-0.049982238010657196,0.191595,-0.981445,0,0,0,0,-0.5097520927175844,-0.015950129662522017,0.05001776198934281,0.219031,-0.975707,0,0,0,0,-0.5097520927175844,-0.015950129662522017,-0.049982238010657196,0.219031,-0.975707,0,0,0,0,-0.5153320927175844,-0.017293129662522028,0.05001776198934281,0.24897,-0.968505,0,0,0,0,-0.5153320927175844,-0.017293129662522028,-0.049982238010657196,0.24897,-0.968505,0,0,0,0,-0.5209760927175844,-0.018837129662522017,0.05001776198934281,0.279305,-0.960173,0,0,0,0,-0.5209760927175844,-0.018837129662522017,-0.049982238010657196,0.279305,-0.960173,0,0,0,0,-0.5266280927175844,-0.020580129662522012,0.05001776198934281,0.310739,-0.950468,0,0,0,0,-0.5266280927175844,-0.020580129662522012,-0.049982238010657196,0.310739,-0.950468,0,0,0,0,-0.5322350927175844,-0.022518129662522007,0.05001776198934281,0.343913,-0.938963,0,0,0,0,-0.5322350927175844,-0.022518129662522007,-0.049982238010657196,0.343944,-0.938963,0,0,0,0,-0.5377400927175844,-0.02464912966252203,0.05001776198934281,0.379559,-0.925138,0,0,0,0,-0.5377400927175844,-0.02464912966252203,-0.049982238010657196,0.379559,-0.925138,0,0,0,0,-0.5430910927175844,-0.02697012966252202,0.05001776198934281,0.418317,-0.908261,0,0,0,0,-0.5430910927175844,-0.02697012966252202,-0.049982238010657196,0.418348,-0.908261,0,0,0,0,-0.5482310927175843,-0.02947812966252203,0.05001776198934281,0.461074,-0.887326,0,0,0,0,-0.5482310927175843,-0.02947812966252203,-0.049982238010657196,0.461074,-0.887326,0,0,0,0,-0.5531060927175844,-0.03217112966252203,0.05001776198934281,0.508591,-0.860988,0,0,0,0,-0.5531060927175844,-0.03217112966252203,-0.049982238010657196,0.508591,-0.860988,0,0,0,0,-0.5576630927175843,-0.03504412966252202,0.05001776198934281,0.561724,-0.827296,0,0,0,0,-0.5576630927175843,-0.03504412966252202,-0.049982238010657196,0.561754,-0.827296,0,0,0,0,-0.5618450927175843,-0.038096129662522016,0.05001776198934281,0.621174,-0.783654,0,0,0,0,-0.5618450927175843,-0.038096129662522016,-0.049982238010657196,0.621174,-0.783654,0,0,0,0,-0.5655990927175844,-0.04132312966252202,0.05001776198934281,0.673391,-0.73925,0,0,0,0,-0.5655990927175844,-0.04132312966252202,-0.049982238010657196,0.673391,-0.73925,0,0,0,0,-0.5678880927175843,-0.04353212966252201,0.05001776198934281,0.715201,-0.698874,0,0,0,0,-0.5678880927175843,-0.04353212966252201,-0.049982238010657196,0.715201,-0.698874,0,0,0,0,-0.5701750927175844,-0.046014129662522024,0.05001776198934281,0.755455,-0.655171,0,0,0,0,-0.5701750927175844,-0.046014129662522024,-0.049982238010657196,0.755455,-0.655171,0,0,0,0,-0.5724210927175843,-0.04876612966252203,0.05001776198934281,0.793878,-0.60802,0,0,0,0,-0.5724210927175843,-0.04876612966252203,-0.049982238010657196,0.793878,-0.60802,0,0,0,0,-0.5745900927175843,-0.051787129662522025,0.05001776198934281,0.830531,-0.556963,0,0,0,0,-0.5745900927175843,-0.051787129662522025,-0.049982238010657196,0.830531,-0.556963,0,0,0,0,-0.5766430927175843,-0.055071129662522006,0.05001776198934281,0.865108,-0.501541,0,0,0,0,-0.5766430927175843,-0.055071129662522006,-0.049982238010657196,0.865108,-0.501511,0,0,0,0,-0.5785440927175843,-0.05861812966252203,0.05001776198934281,0.897214,-0.441511,0,0,0,0,-0.5785440927175843,-0.05861812966252203,-0.049982238010657196,0.897214,-0.441542,0,0,0,0,-0.5802550927175844,-0.06242312966252203,0.05001776198934281,0.926237,-0.376873,0,0,0,0,-0.5802550927175844,-0.06242312966252203,-0.049982238010657196,0.926237,-0.376873,0,0,0,0,-0.5817390927175844,-0.06648512966252201,0.05001776198934281,0.951445,-0.307749,0,0,0,0,-0.5817390927175844,-0.06648512966252201,-0.049982238010657196,0.951445,-0.307749,0,0,0,0,-0.5829580927175844,-0.07079912966252203,0.05001776198934281,0.972076,-0.234626,0,0,0,0,-0.5829580927175844,-0.07079912966252203,-0.049982238010657196,0.972076,-0.234626,0,0,0,0,-0.5838760927175843,-0.07536412966252203,0.05001776198934281,0.987396,-0.158208,0,0,0,0,-0.5838760927175843,-0.07536412966252203,-0.049982238010657196,0.987396,-0.158208,0,0,0,0,-0.5844530927175844,-0.08017712966252202,0.05001776198934281,0.996826,-0.079501,0,0,0,0,-0.5844530927175844,-0.08017712966252202,-0.049982238010657196,0.996826,-0.079501,0,0,0,0,-0.5846540927175844,-0.08523312966252201,0.05001776198934281,0.999969,-0.000671,0,0,0,0,-0.5846540927175844,-0.08523312966252201,-0.049982238010657196,0.999969,-0.000671,0,0,0,0,-0.5844550927175843,-0.09043112966252202,0.05001776198934281,0.996979,0.077578,0,0,0,0,-0.5844550927175843,-0.09043112966252202,-0.049982238010657196,0.996979,0.077578,0,0,0,0,-0.5838870927175843,-0.09526012966252202,0.05001776198934281,0.987732,0.156072,0,0,0,0,-0.5838870927175843,-0.09526012966252202,-0.049982238010657196,0.987732,0.156072,0,0,0,0,-0.5829970927175844,-0.09973212966252203,0.05001776198934281,0.972289,0.23368,0,0,0,0,-0.5829970927175844,-0.09973212966252203,-0.049982238010657196,0.972289,0.23368,0,0,0,0,-0.5818310927175844,-0.10385912966252202,0.05001776198934281,0.951079,0.308847,0,0,0,0,-0.5818310927175844,-0.10385912966252202,-0.049982238010657196,0.951079,0.308847,0,0,0,0,-0.5804350927175843,-0.10765312966252202,0.05001776198934281,0.924924,0.380108,0,0,0,0,-0.5804350927175843,-0.10765312966252202,-0.049982238010657196,0.924924,0.380108,0,0,0,0,-0.5788550927175844,-0.11112412966252203,0.05001776198934281,0.894864,0.446272,0,0,0,0,-0.5788550927175844,-0.11112412966252203,-0.049982238010657196,0.894894,0.446272,0,0,0,0,-0.5771360927175844,-0.11428512966252202,0.05001776198934281,0.86227,0.506424,0,0,0,0,-0.5771360927175844,-0.11428512966252202,-0.049982238010657196,0.86227,0.506424,0,0,0,0,-0.5753260927175844,-0.11714612966252202,0.05001776198934281,0.828425,0.560076,0,0,0,0,-0.5753260927175844,-0.11714612966252202,-0.049982238010657196,0.828425,0.560076,0,0,0,0,-0.5734690927175844,-0.11972012966252202,0.05001776198934281,0.794702,0.606952,0,0,0,0,-0.5734690927175844,-0.11972012966252202,-0.049982238010657196,0.794702,0.606952,0,0,0,0,-0.5716130927175843,-0.12201712966252203,0.05001776198934281,0.762505,0.646962,0,0,0,0,-0.5716130927175843,-0.12201712966252203,-0.049982238010657196,0.762505,0.646962,0,0,0,0,-0.5698030927175843,-0.12405012966252202,0.05001776198934281,0.733238,0.679952,0,0,0,0,-0.5698030927175843,-0.12405012966252202,-0.049982238010657196,0.733207,0.679952,0,0,0,0,-0.5680840927175843,-0.12583012966252202,0.05001776198934281,0.686117,0.727439,0,0,0,0,-0.5680840927175843,-0.12583012966252202,-0.049982238010657196,0.686117,0.72747,0,0,0,0,-0.5642580927175843,-0.12911512966252203,0.05001776198934281,0.615223,0.788324,0,0,0,0,-0.5642580927175843,-0.12911512966252203,-0.049982238010657196,0.615223,0.788324,0,0,0,0,-0.5602560927175844,-0.131948129662522,0.05001776198934281,0.540941,0.841029,0,0,0,0,-0.5602560927175844,-0.131948129662522,-0.049982238010657196,0.540941,0.841029,0,0,0,0,-0.5561100927175844,-0.134361129662522,0.05001776198934281,0.466628,0.884426,0,0,0,0,-0.5561100927175844,-0.134361129662522,-0.049982238010657196,0.466628,0.884426,0,0,0,0,-0.5518520927175844,-0.136386129662522,0.05001776198934281,0.394421,0.918912,0,0,0,0,-0.5518520927175844,-0.136386129662522,-0.049982238010657196,0.394421,0.918912,0,0,0,0,-0.5475130927175843,-0.138054129662522,0.05001776198934281,0.325938,0.945372,0,0,0,0,-0.5475130927175843,-0.138054129662522,-0.049982238010657196,0.325938,0.945372,0,0,0,0,-0.5431260927175844,-0.13939712966252202,0.05001776198934281,0.262337,0.964965,0,0,0,0,-0.5431260927175844,-0.13939712966252202,-0.049982238010657196,0.262337,0.964965,0,0,0,0,-0.5387210927175844,-0.140446129662522,0.05001776198934281,0.20426,0.978912,0,0,0,0,-0.5387210927175844,-0.140446129662522,-0.049982238010657196,0.20426,0.978912,0,0,0,0,-0.5343300927175844,-0.14123412966252202,0.05001776198934281,0.151982,0.988372,0,0,0,0,-0.5343300927175844,-0.14123412966252202,-0.049982238010657196,0.151982,0.988372,0,0,0,0,-0.5299860927175843,-0.14179212966252203,0.05001776198934281,0.105594,0.994385,0,0,0,0,-0.5299860927175843,-0.14179212966252203,-0.049982238010657196,0.105594,0.994385,0,0,0,0,-0.5257190927175843,-0.14215112966252202,0.05001776198934281,0.065035,0.997864,0,0,0,0,-0.5257190927175843,-0.14215112966252202,-0.049982238010657196,0.065035,0.997864,0,0,0,0,-0.5215620927175844,-0.14234312966252202,0.05001776198934281,0.030183,0.999542,0,0,0,0,-0.5215620927175844,-0.14234312966252202,-0.049982238010657196,0.030183,0.999542,0,0,0,0,-0.5175460927175843,-0.14240012966252202,0.05001776198934281,0,0.999969,0,0,0,0,-0.5175460927175843,-0.14240012966252202,-0.049982238010657196,0,1,0,0,0,0,-0.5137830927175844,-0.14234712966252203,0.05001776198934281,-0.028657,0.999573,0,0,0,0,-0.5137830927175844,-0.14234712966252203,-0.049982238010657196,-0.028657,0.999573,0,0,0,0,-0.5099550927175843,-0.14218112966252203,0.05001776198934281,-0.05826,0.998291,0,0,0,0,-0.5099550927175843,-0.14218112966252203,-0.049982238010657196,-0.05826,0.998291,0,0,0,0,-0.5060630927175843,-0.14189512966252202,0.05001776198934281,-0.088961,0.996033,0,0,0,0,-0.5060630927175843,-0.14189512966252202,-0.049982238010657196,-0.088961,0.996002,0,0,0,0,-0.5021110927175844,-0.14147912966252202,0.05001776198934281,-0.120701,0.992676,0,0,0,0,-0.5021110927175844,-0.14147912966252202,-0.049982238010657196,-0.120701,0.992676,0,0,0,0,-0.4981010927175843,-0.14092612966252202,0.05001776198934281,-0.153325,0.988159,0,0,0,0,-0.4981010927175843,-0.14092612966252202,-0.049982238010657196,-0.153325,0.988159,0,0,0,0,-0.49403709271758434,-0.140225129662522,0.05001776198934281,-0.186712,0.982391,0,0,0,0,-0.49403709271758434,-0.140225129662522,-0.049982238010657196,-0.186712,0.982391,0,0,0,0,-0.48992109271758433,-0.13936912966252202,0.05001776198934281,-0.22071,0.975311,0,0,0,0,-0.48992109271758433,-0.13936912966252202,-0.049982238010657196,-0.22071,0.975311,0,0,0,0,-0.48575609271758435,-0.13835012966252203,0.05001776198934281,-0.255165,0.966887,0,0,0,0,-0.48575609271758435,-0.13835012966252203,-0.049982238010657196,-0.255165,0.966887,0,0,0,0,-0.4815450927175844,-0.13715712966252203,0.05001776198934281,-0.289895,0.95703,0,0,0,0,-0.4815450927175844,-0.13715712966252203,-0.049982238010657196,-0.289895,0.95703,0,0,0,0,-0.4772910927175843,-0.135783129662522,0.05001776198934281,-0.324717,0.945799,0,0,0,0,-0.4772910927175843,-0.135783129662522,-0.049982238010657196,-0.324717,0.945799,0,0,0,0,-0.47299609271758436,-0.134220129662522,0.05001776198934281,-0.359478,0.933134,0,0,0,0,-0.47299609271758436,-0.134220129662522,-0.049982238010657196,-0.359478,0.933134,0,0,0,0,-0.46866409271758436,-0.13245812966252202,0.05001776198934281,-0.405255,0.914182,0,0,0,0,-0.46866409271758436,-0.13245812966252202,-0.049982238010657196,-0.405255,0.914182,0,0,0,0,-0.4630100927175843,-0.12973912966252202,0.05001776198934281,-0.457289,0.889309,0,0,0,0,-0.4630100927175843,-0.12973912966252202,-0.049982238010657196,-0.457289,0.889309,0,0,0,0,-0.4572610927175843,-0.12658612966252203,0.05001776198934281,-0.500961,0.865444,0,0,0,0,-0.4572610927175843,-0.12658612966252203,-0.049982238010657196,-0.500961,0.865444,0,0,0,0,-0.45146009271758436,-0.12304712966252201,0.05001776198934281,-0.53795,0.842952,0,0,0,0,-0.45146009271758436,-0.12304712966252201,-0.049982238010657196,-0.53795,0.842952,0,0,0,0,-0.4456500927175844,-0.11917112966252202,0.05001776198934281,-0.569933,0.82165,0,0,0,0,-0.4456500927175844,-0.11917112966252202,-0.049982238010657196,-0.569933,0.82165,0,0,0,0,-0.4398750927175843,-0.11500812966252202,0.05001776198934281,-0.598163,0.801355,0,0,0,0,-0.4398750927175843,-0.11500812966252202,-0.049982238010657196,-0.598163,0.801355,0,0,0,0,-0.43417809271758434,-0.11060612966252202,0.05001776198934281,-0.623585,0.781732,0,0,0,0,-0.43417809271758434,-0.11060612966252202,-0.049982238010657196,-0.623585,0.781732,0,0,0,0,-0.4286010927175844,-0.10601512966252202,0.05001776198934281,-0.646992,0.762474,0,0,0,0,-0.4286010927175844,-0.10601512966252202,-0.049982238010657196,-0.646992,0.762474,0,0,0,0,-0.4231890927175843,-0.10128212966252202,0.05001776198934281,-0.669057,0.743187,0,0,0,0,-0.4231890927175843,-0.10128212966252202,-0.049982238010657196,-0.669088,0.743156,0,0,0,0,-0.4179830927175844,-0.09645712966252203,0.05001776198934281,-0.690329,0.723441,0,0,0,0,-0.4179830927175844,-0.09645712966252203,-0.049982238010657196,-0.690359,0.723441,0,0,0,0,-0.41302809271758434,-0.09158912966252201,0.05001776198934281,-0.711386,0.70278,0,0,0,0,-0.41302809271758434,-0.09158912966252201,-0.049982238010657196,-0.711386,0.70278,0,0,0,0,-0.4083660927175844,-0.08672712966252202,0.05001776198934281,-0.732688,0.680532,0,0,0,0,-0.4083660927175844,-0.08672712966252202,-0.049982238010657196,-0.732719,0.680502,0,0,0,0,-0.40404109271758437,-0.08191912966252202,0.05001776198934281,-0.933622,0.358165,0,0,0,0,-0.40404109271758437,-0.08191912966252202,-0.049982238010657196,-0.933653,0.358165,0,0,0,0,-0.40404109271758437,-0.0056971296625220325,0.05001776198934281,-0.700278,-0.713858,0,0,0,0,-0.40404109271758437,-0.0056971296625220325,-0.049982238010657196,-0.700278,-0.713858,0,0,0,0,-0.40678909271758434,-0.00575012966252203,0.05001776198934281,0.026673,-0.999634,0,0,0,0,-0.1458490927175844,0.14811387033747797,0.05001776198934281,-0.708182,0.705985,0,0,0,0,-0.1458490927175844,0.14811387033747797,-0.049982238010657196,-0.708213,0.705985,0,0,0,0,-0.14720609271758445,0.14674687033747796,-0.049982238010657196,0.380993,0.924558,0,0,0,0,-0.14387309271758442,0.150087870337478,0.05001776198934281,-0.702719,0.711417,0,0,0,0,-0.14387309271758442,0.150087870337478,-0.049982238010657196,-0.70275,0.711386,0,0,0,0,-0.14131609271758427,0.15258487033747797,0.05001776198934281,-0.693258,0.720664,0,0,0,0,-0.14131609271758427,0.15258487033747797,-0.049982238010657196,-0.693258,0.720664,0,0,0,0,-0.13821509271758425,0.15552287033747797,0.05001776198934281,-0.681112,0.73217,0,0,0,0,-0.13821509271758425,0.15552287033747797,-0.049982238010657196,-0.681082,0.73217,0,0,0,0,-0.13460909271758426,0.158816870337478,0.05001776198934281,-0.666555,0.745445,0,0,0,0,-0.13460909271758426,0.158816870337478,-0.049982238010657196,-0.666524,0.745445,0,0,0,0,-0.1305330927175843,0.162384870337478,0.05001776198934281,-0.649495,0.760338,0,0,0,0,-0.1305330927175843,0.162384870337478,-0.049982238010657196,-0.649525,0.760338,0,0,0,0,-0.12602509271758433,0.16614187033747796,0.05001776198934281,-0.629719,0.776788,0,0,0,0,-0.12602509271758433,0.16614187033747796,-0.049982238010657196,-0.629749,0.776757,0,0,0,0,-0.12112409271758429,0.170005870337478,0.05001776198934281,-0.60683,0.794824,0,0,0,0,-0.12112409271758429,0.170005870337478,-0.049982238010657196,-0.60683,0.794824,0,0,0,0,-0.11586509271758438,0.17389287033747797,0.05001776198934281,-0.580157,0.814478,0,0,0,0,-0.11586509271758438,0.17389287033747797,-0.049982238010657196,-0.580157,0.814478,0,0,0,0,-0.11028809271758444,0.177719870337478,0.05001776198934281,-0.549028,0.83578,0,0,0,0,-0.11028809271758444,0.177719870337478,-0.049982238010657196,-0.549028,0.83578,0,0,0,0,-0.10442809271758424,0.18140187033747796,0.05001776198934281,-0.512497,0.858669,0,0,0,0,-0.10442809271758424,0.18140187033747796,-0.049982238010657196,-0.512497,0.858669,0,0,0,0,-0.09832409271758435,0.18485787033747797,0.05001776198934281,-0.475906,0.879452,0,0,0,0,-0.09832409271758435,0.18485787033747797,-0.049982238010657196,-0.475906,0.879482,0,0,0,0,-0.0919360927175843,0.18815887033747797,0.05001776198934281,-0.436598,0.899625,0,0,0,0,-0.0919360927175843,0.18815887033747797,-0.049982238010657196,-0.436598,0.899625,0,0,0,0,-0.08560509271758443,0.19103687033747796,0.05001776198934281,-0.390667,0.92053,0,0,0,0,-0.08560509271758443,0.19103687033747796,-0.049982238010657196,-0.390637,0.92053,0,0,0,0,-0.07932109271758425,0.19351787033747797,0.05001776198934281,-0.343638,0.939085,0,0,0,0,-0.07932109271758425,0.19351787033747797,-0.049982238010657196,-0.343638,0.939085,0,0,0,0,-0.07307009271758425,0.19562787033747797,0.05001776198934281,-0.296365,0.955046,0,0,0,0,-0.07307009271758425,0.19562787033747797,-0.049982238010657196,-0.296335,0.955046,0,0,0,0,-0.06684309271758426,0.197392870337478,0.05001776198934281,-0.249641,0.968322,0,0,0,0,-0.06684309271758426,0.197392870337478,-0.049982238010657196,-0.249672,0.968322,0,0,0,0,-0.0606280927175844,0.198838870337478,0.05001776198934281,-0.204413,0.978851,0,0,0,0,-0.0606280927175844,0.198838870337478,-0.049982238010657196,-0.204413,0.978851,0,0,0,0,-0.054412092717584404,0.19999087033747798,0.05001776198934281,-0.161473,0.986847,0,0,0,0,-0.054412092717584404,0.19999087033747798,-0.049982238010657196,-0.161473,0.986847,0,0,0,0,-0.04818509271758442,0.20087487033747797,0.05001776198934281,-0.121494,0.992584,0,0,0,0,-0.04818509271758442,0.20087487033747797,-0.049982238010657196,-0.121494,0.992584,0,0,0,0,-0.04193509271758433,0.20151787033747798,0.05001776198934281,-0.085086,0.996368,0,0,0,0,-0.04193509271758433,0.20151787033747798,-0.049982238010657196,-0.085086,0.996368,0,0,0,0,-0.03565009271758446,0.20194587033747796,0.05001776198934281,-0.052644,0.998596,0,0,0,0,-0.03565009271758446,0.20194587033747796,-0.049982238010657196,-0.052644,0.998596,0,0,0,0,-0.029319092717584372,0.202182870337478,0.05001776198934281,-0.024445,0.999695,0,0,0,0,-0.029319092717584372,0.202182870337478,-0.049982238010657196,-0.024445,0.999695,0,0,0,0,-0.02293109271758431,0.202255870337478,0.05001776198934281,-0.000214,1,0,0,0,0,-0.02293109271758431,0.202255870337478,-0.049982238010657196,-0.000214,1,0,0,0,0,-0.01694309271758443,0.20218987033747798,0.05001776198934281,0.024598,0.999695,0,0,0,0,-0.01694309271758443,0.20218987033747798,-0.049982238010657196,0.024598,0.999695,0,0,0,0,-0.010239092717584386,0.201933870337478,0.05001776198934281,0.055391,0.998444,0,0,0,0,-0.010239092717584386,0.201933870337478,-0.049982238010657196,0.055391,0.998444,0,0,0,0,-0.002930092717584376,0.20140187033747797,0.05001776198934281,0.093295,0.995636,0,0,0,0,-0.002930092717584376,0.20140187033747797,-0.049982238010657196,0.093295,0.995636,0,0,0,0,0.004869907282415653,0.200506870337478,0.05001776198934281,0.138035,0.990417,0,0,0,0,0.004869907282415653,0.200506870337478,-0.049982238010657196,0.138035,0.990417,0,0,0,0,0.01304990728241573,0.19916387033747796,0.05001776198934281,0.189642,0.981842,0,0,0,0,0.01304990728241573,0.19916387033747796,-0.049982238010657196,0.189611,0.981842,0,0,0,0,0.0214969072824156,0.197284870337478,0.05001776198934281,0.248177,0.968688,0,0,0,0,0.0214969072824156,0.197284870337478,-0.049982238010657196,0.248177,0.968688,0,0,0,0,0.03009990728241574,0.194784870337478,0.05001776198934281,0.313639,0.949522,0,0,0,0,0.03009990728241574,0.194784870337478,-0.049982238010657196,0.313608,0.949522,0,0,0,0,0.03874590728241567,0.19157787033747797,0.05001776198934281,0.385632,0.922636,0,0,0,0,0.03874590728241567,0.19157787033747797,-0.049982238010657196,0.385601,0.922636,0,0,0,0,0.04732290728241573,0.18757587033747797,0.05001776198934281,0.463179,0.886227,0,0,0,0,0.04732290728241573,0.18757587033747797,-0.049982238010657196,0.463179,0.886227,0,0,0,0,0.055718907282415575,0.18269387033747797,0.05001776198934281,0.544603,0.838679,0,0,0,0,0.055718907282415575,0.18269387033747797,-0.049982238010657196,0.544633,0.838649,0,0,0,0,0.06382090728241563,0.176845870337478,0.05001776198934281,0.627277,0.778771,0,0,0,0,0.06382090728241563,0.176845870337478,-0.049982238010657196,0.627308,0.778741,0,0,0,0,0.0715179072824157,0.16994487033747796,0.05001776198934281,0.70806,0.706107,0,0,0,0,0.0715179072824157,0.16994487033747796,-0.049982238010657196,0.70806,0.706107,0,0,0,0,0.07841890728241574,0.162204870337478,0.05001776198934281,0.782586,0.622517,0,0,0,0,0.07841890728241574,0.162204870337478,-0.049982238010657196,0.782586,0.622517,0,0,0,0,0.08426790728241573,0.15393787033747797,0.05001776198934281,0.84579,0.533494,0,0,0,0,0.08426790728241573,0.15393787033747797,-0.049982238010657196,0.845759,0.533494,0,0,0,0,0.08914990728241556,0.145205870337478,0.05001776198934281,0.895474,0.445051,0,0,0,0,0.08914990728241556,0.145205870337478,-0.049982238010657196,0.895474,0.445051,0,0,0,0,0.09315090728241571,0.13606787033747797,0.05001776198934281,0.932524,0.361095,0,0,0,0,0.09315090728241571,0.13606787033747797,-0.049982238010657196,0.932524,0.361095,0,0,0,0,0.09635890728241558,0.126584870337478,0.05001776198934281,0.958708,0.284371,0,0,0,0,0.09635890728241558,0.126584870337478,-0.049982238010657196,0.958708,0.284371,0,0,0,0,0.09885890728241575,0.11681687033747801,0.05001776198934281,0.976287,0.216437,0,0,0,0,0.09885890728241575,0.11681687033747801,-0.049982238010657196,0.976287,0.216437,0,0,0,0,0.10073690728241558,0.106824870337478,0.05001776198934281,0.987426,0.157994,0,0,0,0,0.10073690728241558,0.106824870337478,-0.049982238010657196,0.987426,0.157994,0,0,0,0,0.10208090728241559,0.09666787033747798,0.05001776198934281,0.994018,0.109012,0,0,0,0,0.10208090728241559,0.09666787033747798,-0.049982238010657196,0.994018,0.109012,0,0,0,0,0.10297490728241576,0.08640887033747796,0.05001776198934281,0.997589,0.069216,0,0,0,0,0.10297490728241576,0.08640887033747796,-0.049982238010657196,0.997589,0.069216,0,0,0,0,0.10350690728241574,0.07610487033747798,0.05001776198934281,0.999268,0.038209,0,0,0,0,0.10350690728241574,0.07610487033747798,-0.049982238010657196,0.999268,0.03824,0,0,0,0,0.10376290728241555,0.06581987033747799,0.05001776198934281,0.999847,0.015687,0,0,0,0,0.10376290728241555,0.06581987033747799,-0.049982238010657196,0.999847,0.015656,0,0,0,0,0.10382990728241559,0.05561187033747797,0.05001776198934281,0.999969,0.003235,0,0,0,0,0.10382990728241559,0.05561187033747797,-0.049982238010657196,0.999969,0.003204,0,0,0,0,0.10382990728241559,-0.19376712966252202,0.05001776198934281,0.707083,-0.707083,0,0,0,0,0.10382990728241559,-0.19376712966252202,-0.049982238010657196,0.707083,-0.707083,0,0,0,0,0.03506390728241571,-0.19376712966252202,0.05001776198934281,-0.707083,-0.707083,0,0,0,0,0.03506390728241571,-0.19376712966252202,-0.049982238010657196,-0.707083,-0.707083,0,0,0,0,0.03506390728241571,0.05395487033747798,0.05001776198934281,-0.999969,-0.006256,0,0,0,0,0.03506390728241571,0.05395487033747798,-0.049982238010657196,-0.999969,-0.006287,0,0,0,0,0.03497690728241576,0.06085787033747797,0.05001776198934281,-0.999634,-0.026063,0,0,0,0,0.03497690728241576,0.06085787033747797,-0.049982238010657196,-0.999634,-0.026093,0,0,0,0,0.03471490728241555,0.06747887033747796,0.05001776198934281,-0.998505,-0.054476,0,0,0,0,0.03471490728241555,0.06747887033747796,-0.049982238010657196,-0.998505,-0.054476,0,0,0,0,0.03427390728241564,0.07381287033747796,0.05001776198934281,-0.996277,-0.08591,0,0,0,0,0.03427390728241564,0.07381287033747796,-0.049982238010657196,-0.996277,-0.08591,0,0,0,0,0.033652907282415656,0.07985287033747795,0.05001776198934281,-0.992676,-0.120731,0,0,0,0,0.033652907282415656,0.07985287033747795,-0.049982238010657196,-0.992676,-0.120701,0,0,0,0,0.03284690728241557,0.085593870337478,0.05001776198934281,-0.987213,-0.159368,0,0,0,0,0.03284690728241557,0.085593870337478,-0.049982238010657196,-0.987213,-0.159368,0,0,0,0,0.03185390728241555,0.091029870337478,0.05001776198934281,-0.979308,-0.202307,0,0,0,0,0.03185390728241555,0.091029870337478,-0.049982238010657196,-0.979308,-0.202338,0,0,0,0,0.030670907282415616,0.096154870337478,0.05001776198934281,-0.96823,-0.249977,0,0,0,0,0.030670907282415616,0.096154870337478,-0.049982238010657196,-0.96823,-0.250008,0,0,0,0,0.029294907282415572,0.100963870337478,0.05001776198934281,-0.953001,-0.302866,0,0,0,0,0.029294907282415572,0.100963870337478,-0.049982238010657196,-0.953001,-0.302896,0,0,0,0,0.027723907282415583,0.10545087033747796,0.05001776198934281,-0.932463,-0.361187,0,0,0,0,0.027723907282415583,0.10545087033747796,-0.049982238010657196,-0.932463,-0.361217,0,0,0,0,0.025953907282415756,0.10960987033747799,0.05001776198934281,-0.905148,-0.425062,0,0,0,0,0.025953907282415756,0.10960987033747799,-0.049982238010657196,-0.905118,-0.425092,0,0,0,0,0.02398290728241559,0.11343487033747796,0.05001776198934281,-0.86935,-0.494125,0,0,0,0,0.02398290728241559,0.11343487033747796,-0.049982238010657196,-0.86935,-0.494156,0,0,0,0,0.02180790728241555,0.116920870337478,0.05001776198934281,-0.826746,-0.562517,0,0,0,0,0.02180790728241555,0.116920870337478,-0.049982238010657196,-0.826746,-0.562517,0,0,0,0,0.019783907282415747,0.11965587033747799,0.05001776198934281,-0.783746,-0.621052,0,0,0,0,0.019783907282415747,0.11965587033747799,-0.049982238010657196,-0.783746,-0.621052,0,0,0,0,0.017423907282415607,0.122439870337478,0.05001776198934281,-0.738945,-0.673727,0,0,0,0,0.017423907282415607,0.122439870337478,-0.049982238010657196,-0.738975,-0.673696,0,0,0,0,0.014700907282415576,0.12521887033747797,0.05001776198934281,-0.686544,-0.727042,0,0,0,0,0.014700907282415576,0.12521887033747797,-0.049982238010657196,-0.686575,-0.727012,0,0,0,0,0.011589907282415712,0.12793687033747797,0.05001776198934281,-0.626453,-0.779443,0,0,0,0,0.011589907282415712,0.12793687033747797,-0.049982238010657196,-0.626453,-0.779412,0,0,0,0,0.008063907282415572,0.130539870337478,0.05001776198934281,-0.558977,-0.829157,0,0,0,0,0.008063907282415572,0.130539870337478,-0.049982238010657196,-0.558977,-0.829157,0,0,0,0,0.004098907282415576,0.13297287033747796,0.05001776198934281,-0.485,-0.874508,0,0,0,0,0.004098907282415576,0.13297287033747796,-0.049982238010657196,-0.48497,-0.874508,0,0,0,0,-0.0003330927175844156,0.13518187033747797,0.05001776198934281,-0.405896,-0.913907,0,0,0,0,-0.0003330927175844156,0.13518187033747797,-0.049982238010657196,-0.405896,-0.913907,0,0,0,0,-0.005256092717584426,0.13711187033747796,0.05001776198934281,-0.323496,-0.946196,0,0,0,0,-0.005256092717584426,0.13711187033747796,-0.049982238010657196,-0.323496,-0.946196,0,0,0,0,-0.010698092717584373,0.138707870337478,0.05001776198934281,-0.239845,-0.970794,0,0,0,0,-0.010698092717584373,0.138707870337478,-0.049982238010657196,-0.239845,-0.970794,0,0,0,0,-0.01668309271758428,0.13991487033747796,0.05001776198934281,-0.156957,-0.987579,0,0,0,0,-0.01668309271758428,0.13991487033747796,-0.049982238010657196,-0.156957,-0.987579,0,0,0,0,-0.02323709271758445,0.14067987033747797,0.05001776198934281,-0.076662,-0.99704,0,0,0,0,-0.02323709271758445,0.14067987033747797,-0.049982238010657196,-0.076662,-0.99704,0,0,0,0,-0.03038709271758444,0.140946870337478,0.05001776198934281,-0.004578,-0.999969,0,0,0,0,-0.03038709271758444,0.140946870337478,-0.049982238010657196,-0.004578,-0.999969,0,0,0,0,-0.03707309271758441,0.14075887033747797,0.05001776198934281,0.057588,-0.998321,0,0,0,0,-0.03707309271758441,0.14075887033747797,-0.049982238010657196,0.057588,-0.998321,0,0,0,0,-0.04347909271758432,0.14019887033747797,0.05001776198934281,0.117588,-0.993042,0,0,0,0,-0.04347909271758432,0.14019887033747797,-0.049982238010657196,0.117588,-0.993042,0,0,0,0,-0.04963709271758443,0.139276870337478,0.05001776198934281,0.179052,-0.983825,0,0,0,0,-0.04963709271758443,0.139276870337478,-0.049982238010657196,0.179052,-0.983825,0,0,0,0,-0.05558009271758424,0.138000870337478,0.05001776198934281,0.240547,-0.970611,0,0,0,0,-0.05558009271758424,0.138000870337478,-0.049982238010657196,0.240547,-0.970611,0,0,0,0,-0.06133909271758431,0.136379870337478,0.05001776198934281,0.300455,-0.953764,0,0,0,0,-0.06133909271758431,0.136379870337478,-0.049982238010657196,0.300424,-0.953795,0,0,0,0,-0.06694509271758431,0.13442287033747796,0.05001776198934281,0.35728,-0.933988,0,0,0,0,-0.06694509271758431,0.13442287033747796,-0.049982238010657196,0.35728,-0.933988,0,0,0,0,-0.07243109271758441,0.132136870337478,0.05001776198934281,0.409803,-0.912137,0,0,0,0,-0.07243109271758441,0.132136870337478,-0.049982238010657196,0.409803,-0.912137,0,0,0,0,-0.07782709271758437,0.12953187033747798,0.05001776198934281,0.457137,-0.88937,0,0,0,0,-0.07782709271758437,0.12953187033747798,-0.049982238010657196,0.457137,-0.88937,0,0,0,0,-0.08316609271758435,0.12661687033747798,0.05001776198934281,0.498764,-0.866726,0,0,0,0,-0.08316609271758435,0.12661687033747798,-0.049982238010657196,0.498795,-0.866695,0,0,0,0,-0.08847809271758433,0.12339887033747798,0.05001776198934281,0.534562,-0.845119,0,0,0,0,-0.08847809271758433,0.12339887033747798,-0.049982238010657196,0.534562,-0.845088,0,0,0,0,-0.09379709271758441,0.119887870337478,0.05001776198934281,0.564623,-0.825312,0,0,0,0,-0.09379709271758441,0.119887870337478,-0.049982238010657196,0.564653,-0.825312,0,0,0,0,-0.09915309271758432,0.11609187033747798,0.05001776198934281,0.590686,-0.806879,0,0,0,0,-0.09915309271758432,0.11609187033747798,-0.049982238010657196,0.590686,-0.806879,0,0,0,0,-0.10440209271758438,0.112123870337478,0.05001776198934281,0.615741,-0.787927,0,0,0,0,-0.10440209271758438,0.112123870337478,-0.049982238010657196,0.615741,-0.787927,0,0,0,0,-0.10938609271758426,0.108098870337478,0.05001776198934281,0.640339,-0.768059,0,0,0,0,-0.10938609271758426,0.108098870337478,-0.049982238010657196,0.64037,-0.768059,0,0,0,0,-0.11411809271758444,0.10402687033747798,0.05001776198934281,0.663625,-0.748009,0,0,0,0,-0.11411809271758444,0.10402687033747798,-0.049982238010657196,0.663625,-0.748009,0,0,0,0,-0.1186070927175844,0.09992087033747798,0.05001776198934281,0.685507,-0.72805,0,0,0,0,-0.1186070927175844,0.09992087033747798,-0.049982238010657196,0.685507,-0.728019,0,0,0,0,-0.12286709271758434,0.09579187033747799,0.05001776198934281,0.705893,-0.708274,0,0,0,0,-0.12286709271758434,0.09579187033747799,-0.049982238010657196,0.705924,-0.708274,0,0,0,0,-0.1269080927175843,0.09165087033747799,0.05001776198934281,0.724754,-0.688955,0,0,0,0,-0.1269080927175843,0.09165087033747799,-0.049982238010657196,0.724784,-0.688955,0,0,0,0,-0.1307420927175844,0.08751087033747795,0.05001776198934281,0.742058,-0.670278,0,0,0,0,-0.1307420927175844,0.08751087033747795,-0.049982238010657196,0.742088,-0.670278,0,0,0,0,-0.13438009271758444,0.08338187033747796,0.05001776198934281,0.757805,-0.652455,0,0,0,0,-0.13438009271758444,0.08338187033747796,-0.049982238010657196,0.757805,-0.652425,0,0,0,0,-0.1378340927175843,0.07927587033747796,0.05001776198934281,0.771966,-0.635639,0,0,0,0,-0.1378340927175843,0.07927587033747796,-0.049982238010657196,0.771966,-0.635639,0,0,0,0,-0.14111509271758438,0.075203870337478,0.05001776198934281,0.784509,-0.620075,0,0,0,0,-0.14111509271758438,0.075203870337478,-0.049982238010657196,0.784509,-0.620106,0,0,0,0,-0.1442350927175844,0.071178870337478,0.05001776198934281,0.795465,-0.605976,0,0,0,0,-0.1442350927175844,0.071178870337478,-0.049982238010657196,0.795434,-0.606006,0,0,0,0,-0.14720609271758445,0.06721087033747797,0.05001776198934281,0.94879,-0.315806,0,0,0,0,-0.14720609271758445,0.06721087033747797,-0.049982238010657196,0.94879,-0.315806,0,0,0,0,-0.14720609271758445,-0.19376712966252202,0.05001776198934281,0.707083,-0.707083,0,0,0,0,-0.14720609271758445,-0.19376712966252202,-0.049982238010657196,0.707083,-0.707083,0,0,0,0,-0.21597209271758433,-0.19376712966252202,0.05001776198934281,-0.707083,-0.707083,0,0,0,0,-0.21597209271758433,-0.19376712966252202,-0.049982238010657196,-0.707083,-0.707083,0,0,0,0,-0.21597209271758433,0.19314287033747796,0.05001776198934281,-0.707083,0.707083,0,0,0,0,-0.21597209271758433,0.19314287033747796,-0.049982238010657196,-0.707083,0.707083,0,0,0,0,-0.14720609271758445,0.19314287033747796,0.05001776198934281,0.707083,0.707083,0,0,0,0,-0.14720609271758445,0.19314287033747796,-0.049982238010657196,0.707083,0.707083,0,0,0,0,-0.14720609271758445,0.14674687033747796,0.05001776198934281,0.380993,0.924558,0,0,0,0,0.4606949072824156,0.10326187033747797,0.05001776198934281,-0.699545,-0.71456,0,0,0,0,0.4606949072824156,0.10326187033747797,-0.049982238010657196,-0.699545,-0.71456,0,0,0,0,0.4694559072824156,0.094129870337478,-0.049982238010657196,-0.740989,-0.671468,0,0,0,0,0.4520199072824156,0.111237870337478,0.05001776198934281,-0.651173,-0.758904,0,0,0,0,0.4520199072824156,0.111237870337478,-0.049982238010657196,-0.651173,-0.758904,0,0,0,0,0.4434229072824156,0.11811687033747797,0.05001776198934281,-0.595416,-0.803369,0,0,0,0,0.4434229072824156,0.11811687033747797,-0.049982238010657196,-0.595447,-0.803369,0,0,0,0,0.43489490728241575,0.12396087033747799,0.05001776198934281,-0.532273,-0.846553,0,0,0,0,0.43489490728241575,0.12396087033747799,-0.049982238010657196,-0.532273,-0.846553,0,0,0,0,0.4264269072824156,0.128829870337478,0.05001776198934281,-0.462233,-0.886746,0,0,0,0,0.4264269072824156,0.128829870337478,-0.049982238010657196,-0.462233,-0.886746,0,0,0,0,0.41801090728241563,0.13278387033747796,0.05001776198934281,-0.386547,-0.922239,0,0,0,0,0.41801090728241563,0.13278387033747796,-0.049982238010657196,-0.386547,-0.922239,0,0,0,0,0.40963790728241567,0.135883870337478,0.05001776198934281,-0.307108,-0.951659,0,0,0,0,0.40963790728241567,0.135883870337478,-0.049982238010657196,-0.307108,-0.951659,0,0,0,0,0.4012999072824157,0.13818987033747798,0.05001776198934281,-0.226356,-0.974029,0,0,0,0,0.4012999072824157,0.13818987033747798,-0.049982238010657196,-0.226356,-0.974029,0,0,0,0,0.3929879072824156,0.139761870337478,0.05001776198934281,-0.146886,-0.989135,0,0,0,0,0.3929879072824156,0.139761870337478,-0.049982238010657196,-0.146886,-0.989135,0,0,0,0,0.3846929072824157,0.14066087033747798,0.05001776198934281,-0.071169,-0.997436,0,0,0,0,0.3846929072824157,0.14066087033747798,-0.049982238010657196,-0.071169,-0.997436,0,0,0,0,0.37640590728241574,0.140946870337478,0.05001776198934281,-0.003204,-0.999969,0,0,0,0,0.37640590728241574,0.140946870337478,-0.049982238010657196,-0.003204,-0.999969,0,0,0,0,0.3692359072824156,0.14074587033747799,0.05001776198934281,0.057863,-0.998321,0,0,0,0,0.3692359072824156,0.14074587033747799,-0.049982238010657196,0.057863,-0.998321,0,0,0,0,0.3618459072824156,0.140095870337478,0.05001776198934281,0.120304,-0.992706,0,0,0,0,0.3618459072824156,0.140095870337478,-0.049982238010657196,0.120304,-0.992706,0,0,0,0,0.35429590728241567,0.138927870337478,0.05001776198934281,0.188269,-0.982086,0,0,0,0,0.35429590728241567,0.138927870337478,-0.049982238010657196,0.188269,-0.982086,0,0,0,0,0.3466419072824156,0.137172870337478,0.05001776198934281,0.261299,-0.965239,0,0,0,0,0.3466419072824156,0.137172870337478,-0.049982238010657196,0.261299,-0.965239,0,0,0,0,0.3389419072824156,0.134761870337478,0.05001776198934281,0.338481,-0.940947,0,0,0,0,0.3389419072824156,0.134761870337478,-0.049982238010657196,0.338481,-0.940947,0,0,0,0,0.33125290728241574,0.131626870337478,0.05001776198934281,0.418409,-0.908231,0,0,0,0,0.33125290728241574,0.131626870337478,-0.049982238010657196,0.418409,-0.908231,0,0,0,0,0.3236339072824157,0.127696870337478,0.05001776198934281,0.49913,-0.866512,0,0,0,0,0.3236339072824157,0.127696870337478,-0.049982238010657196,0.49913,-0.866512,0,0,0,0,0.31614090728241573,0.12290387033747796,0.05001776198934281,0.578387,-0.81576,0,0,0,0,0.31614090728241573,0.12290387033747796,-0.049982238010657196,0.578387,-0.81576,0,0,0,0,0.3088319072824157,0.11717987033747795,0.05001776198934281,0.653737,-0.756676,0,0,0,0,0.3088319072824157,0.11717987033747795,-0.049982238010657196,0.653737,-0.756676,0,0,0,0,0.30176490728241556,0.110453870337478,0.05001776198934281,0.723075,-0.690756,0,0,0,0,0.30176490728241556,0.110453870337478,-0.049982238010657196,0.723075,-0.690756,0,0,0,0,0.2949969072824157,0.10265787033747797,0.05001776198934281,0.784631,-0.619922,0,0,0,0,0.2949969072824157,0.10265787033747797,-0.049982238010657196,0.784631,-0.619922,0,0,0,0,0.2885849072824156,0.093722870337478,0.05001776198934281,0.838588,-0.544725,0,0,0,0,0.2885849072824156,0.093722870337478,-0.049982238010657196,0.838588,-0.544725,0,0,0,0,0.28376190728241557,0.08548587033747795,0.05001776198934281,0.881466,-0.472213,0,0,0,0,0.28376190728241557,0.08548587033747795,-0.049982238010657196,0.881436,-0.472243,0,0,0,0,0.27961390728241575,0.076983870337478,0.05001776198934281,0.913297,-0.40727,0,0,0,0,0.27961390728241575,0.076983870337478,-0.049982238010657196,0.913266,-0.4073,0,0,0,0,0.27609290728241564,0.06829787033747797,0.05001776198934281,0.937956,-0.34669,0,0,0,0,0.27609290728241564,0.06829787033747797,-0.049982238010657196,0.937956,-0.346721,0,0,0,0,0.27315090728241564,0.05950887033747798,0.05001776198934281,0.956755,-0.290872,0,0,0,0,0.27315090728241564,0.05950887033747798,-0.049982238010657196,0.956725,-0.290902,0,0,0,0,0.27073790728241565,0.050695870337477994,0.05001776198934281,0.970763,-0.239906,0,0,0,0,0.27073790728241565,0.050695870337477994,-0.049982238010657196,0.970794,-0.239875,0,0,0,0,0.2688049072824157,0.04194087033747798,0.05001776198934281,0.981048,-0.19364,0,0,0,0,0.2688049072824157,0.04194087033747798,-0.049982238010657196,0.981048,-0.19364,0,0,0,0,0.2673039072824157,0.03332487033747797,0.05001776198934281,0.988403,-0.15183,0,0,0,0,0.2673039072824157,0.03332487033747797,-0.049982238010657196,0.988372,-0.15186,0,0,0,0,0.2661849072824156,0.02492587033747798,0.05001776198934281,0.993439,-0.114261,0,0,0,0,0.2661849072824156,0.02492587033747798,-0.049982238010657196,0.993439,-0.114231,0,0,0,0,0.2653999072824156,0.016826870337477984,0.05001776198934281,0.996734,-0.080569,0,0,0,0,0.2653999072824156,0.016826870337477984,-0.049982238010657196,0.996734,-0.080508,0,0,0,0,0.26489990728241564,0.00910787033747798,0.05001776198934281,0.998718,-0.050539,0,0,0,0,0.26489990728241564,0.00910787033747798,-0.049982238010657196,0.998718,-0.050478,0,0,0,0,0.2646359072824156,0.0018488703374779925,0.05001776198934281,0.999695,-0.023927,0,0,0,0,0.2646359072824156,0.0018488703374779925,-0.049982238010657196,0.999695,-0.023927,0,0,0,0,0.2645589072824157,-0.004869129662522009,0.05001776198934281,0.999969,0.001038,0,0,0,0,0.2645589072824157,-0.004869129662522009,-0.049982238010657196,0.999969,0.001007,0,0,0,0,0.2646699072824157,-0.013059129662522012,0.05001776198934281,0.999573,0.028504,0,0,0,0,0.2646699072824157,-0.013059129662522012,-0.049982238010657196,0.999573,0.028504,0,0,0,0,0.2650339072824157,-0.021443129662522015,0.05001776198934281,0.998138,0.060488,0,0,0,0,0.2650339072824157,-0.021443129662522015,-0.049982238010657196,0.998138,0.060488,0,0,0,0,0.2656979072824157,-0.02997012966252202,0.05001776198934281,0.99527,0.096896,0,0,0,0,0.2656979072824157,-0.02997012966252202,-0.049982238010657196,0.99527,0.096896,0,0,0,0,0.26670690728241575,-0.03859212966252201,0.05001776198934281,0.990448,0.137822,0,0,0,0,0.26670690728241575,-0.03859212966252201,-0.049982238010657196,0.990448,0.137852,0,0,0,0,0.2681069072824156,-0.04726012966252202,0.05001776198934281,0.983001,0.183477,0,0,0,0,0.2681069072824156,-0.04726012966252202,-0.049982238010657196,0.983001,0.183477,0,0,0,0,0.2699439072824157,-0.05592512966252203,0.05001776198934281,0.972259,0.233833,0,0,0,0,0.2699439072824157,-0.05592512966252203,-0.049982238010657196,0.972259,0.233833,0,0,0,0,0.27226390728241556,-0.06453912966252201,0.05001776198934281,0.957335,0.288919,0,0,0,0,0.27226390728241556,-0.06453912966252201,-0.049982238010657196,0.957335,0.288919,0,0,0,0,0.2751139072824156,-0.07305112966252202,0.05001776198934281,0.937315,0.348399,0,0,0,0,0.2751139072824156,-0.07305112966252202,-0.049982238010657196,0.937315,0.348399,0,0,0,0,0.27853990728241573,-0.08141512966252203,0.05001776198934281,0.911252,0.411786,0,0,0,0,0.27853990728241573,-0.08141512966252203,-0.049982238010657196,0.911252,0.411786,0,0,0,0,0.2825859072824157,-0.08957912966252202,0.05001776198934281,0.878231,0.478195,0,0,0,0,0.2825859072824157,-0.08957912966252202,-0.049982238010657196,0.878262,0.478164,0,0,0,0,0.2872999072824156,-0.09749612966252202,0.05001776198934281,0.837581,0.546312,0,0,0,0,0.2872999072824156,-0.09749612966252202,-0.049982238010657196,0.837581,0.546281,0,0,0,0,0.2927279072824156,-0.10511712966252201,0.05001776198934281,0.791253,0.611438,0,0,0,0,0.2927279072824156,-0.10511712966252201,-0.049982238010657196,0.791253,0.611438,0,0,0,0,0.2974079072824156,-0.11070812966252203,0.05001776198934281,0.745262,0.666738,0,0,0,0,0.2974079072824156,-0.11070812966252203,-0.049982238010657196,0.745262,0.666738,0,0,0,0,0.30234390728241567,-0.11587312966252201,0.05001776198934281,0.697989,0.716056,0,0,0,0,0.30234390728241567,-0.11587312966252201,-0.049982238010657196,0.698019,0.716056,0,0,0,0,0.3075499072824157,-0.12060012966252202,0.05001776198934281,0.64388,0.765099,0,0,0,0,0.3075499072824157,-0.12060012966252202,-0.049982238010657196,0.64388,0.765099,0,0,0,0,0.3130409072824156,-0.12487912966252201,0.05001776198934281,0.582995,0.812433,0,0,0,0,0.3130409072824156,-0.12487912966252201,-0.049982238010657196,0.583026,0.812433,0,0,0,0,0.3188319072824157,-0.128697129662522,0.05001776198934281,0.516068,0.856533,0,0,0,0,0.3188319072824157,-0.128697129662522,-0.049982238010657196,0.516037,0.856533,0,0,0,0,0.3249359072824156,-0.13204412966252202,0.05001776198934281,0.444105,0.895962,0,0,0,0,0.3249359072824156,-0.13204412966252202,-0.049982238010657196,0.444075,0.895962,0,0,0,0,0.3313679072824156,-0.13490712966252202,0.05001776198934281,0.368664,0.929533,0,0,0,0,0.3313679072824156,-0.13490712966252202,-0.049982238010657196,0.368664,0.929533,0,0,0,0,0.33814190728241567,-0.137276129662522,0.05001776198934281,0.291574,0.956511,0,0,0,0,0.33814190728241567,-0.137276129662522,-0.049982238010657196,0.291574,0.956542,0,0,0,0,0.34527290728241566,-0.13913812966252204,0.05001776198934281,0.214667,0.976653,0,0,0,0,0.34527290728241566,-0.13913812966252204,-0.049982238010657196,0.214698,0.976653,0,0,0,0,0.35277490728241556,-0.14048212966252202,0.05001776198934281,0.139683,0.990173,0,0,0,0,0.35277490728241556,-0.14048212966252202,-0.049982238010657196,0.139683,0.990173,0,0,0,0,0.36066190728241576,-0.141297129662522,0.05001776198934281,0.067965,0.997681,0,0,0,0,0.36066190728241576,-0.141297129662522,-0.049982238010657196,0.067965,0.997681,0,0,0,0,0.3689499072824156,-0.14157112966252203,0.05001776198934281,0.006104,0.999969,0,0,0,0,0.3689499072824156,-0.14157112966252203,-0.049982238010657196,0.006104,0.999969,0,0,0,0,0.3748569072824157,-0.14144812966252202,0.05001776198934281,-0.043458,0.999054,0,0,0,0,0.3748569072824157,-0.14144812966252202,-0.049982238010657196,-0.043458,0.999054,0,0,0,0,0.3805829072824156,-0.14106912966252202,0.05001776198934281,-0.090976,0.995849,0,0,0,0,0.3805829072824156,-0.14106912966252202,-0.049982238010657196,-0.090976,0.995849,0,0,0,0,0.3861539072824156,-0.140419129662522,0.05001776198934281,-0.142582,0.989776,0,0,0,0,0.3861539072824156,-0.140419129662522,-0.049982238010657196,-0.142582,0.989776,0,0,0,0,0.39159490728241564,-0.13948512966252202,0.05001776198934281,-0.197272,0.980316,0,0,0,0,0.39159490728241564,-0.13948512966252202,-0.049982238010657196,-0.197272,0.980316,0,0,0,0,0.3969329072824157,-0.138251129662522,0.05001776198934281,-0.253761,0.967254,0,0,0,0,0.3969329072824157,-0.138251129662522,-0.049982238010657196,-0.253792,0.967254,0,0,0,0,0.40219290728241575,-0.13670412966252202,0.05001776198934281,-0.310587,0.95053,0,0,0,0,0.40219290728241575,-0.13670412966252202,-0.049982238010657196,-0.310587,0.95053,0,0,0,0,0.40740190728241554,-0.13482912966252203,0.05001776198934281,-0.366192,0.930509,0,0,0,0,0.40740190728241554,-0.13482912966252203,-0.049982238010657196,-0.366222,0.930509,0,0,0,0,0.41258390728241556,-0.13261112966252203,0.05001776198934281,-0.419263,0.907834,0,0,0,0,0.41258390728241556,-0.13261112966252203,-0.049982238010657196,-0.419294,0.907834,0,0,0,0,0.4177669072824157,-0.130037129662522,0.05001776198934281,-0.468703,0.883328,0,0,0,0,0.4177669072824157,-0.130037129662522,-0.049982238010657196,-0.468703,0.883328,0,0,0,0,0.4229749072824156,-0.12709212966252204,0.05001776198934281,-0.513749,0.857906,0,0,0,0,0.4229749072824156,-0.12709212966252204,-0.049982238010657196,-0.513749,0.857906,0,0,0,0,0.42823490728241564,-0.12376112966252202,0.05001776198934281,-0.554033,0.832453,0,0,0,0,0.42823490728241564,-0.12376112966252202,-0.049982238010657196,-0.554033,0.832453,0,0,0,0,0.4335729072824157,-0.12003012966252202,0.05001776198934281,-0.593097,0.805109,0,0,0,0,0.4335729072824157,-0.12003012966252202,-0.049982238010657196,-0.593066,0.805139,0,0,0,0,0.43568690728241566,-0.11839012966252202,0.05001776198934281,-0.614948,0.788537,0,0,0,0,0.43568690728241566,-0.11839012966252202,-0.049982238010657196,-0.614917,0.788568,0,0,0,0,0.4382679072824156,-0.11636712966252202,0.05001776198934281,-0.621784,0.783166,0,0,0,0,0.4382679072824156,-0.11636712966252202,-0.049982238010657196,-0.621845,0.783135,0,0,0,0,0.44126190728241554,-0.11395912966252202,0.05001776198934281,-0.633351,0.773827,0,0,0,0,0.44126190728241554,-0.11395912966252202,-0.049982238010657196,-0.633381,0.773797,0,0,0,0,0.44461990728241574,-0.11116212966252202,0.05001776198934281,-0.648061,0.761559,0,0,0,0,0.44461990728241574,-0.11116212966252202,-0.049982238010657196,-0.648061,0.761559,0,0,0,0,0.4482869072824156,-0.10797512966252203,0.05001776198934281,-0.664998,0.746818,0,0,0,0,0.4482869072824156,-0.10797512966252203,-0.049982238010657196,-0.664998,0.746818,0,0,0,0,0.4522139072824156,-0.10439312966252202,0.05001776198934281,-0.683767,0.729667,0,0,0,0,0.4522139072824156,-0.10439312966252202,-0.049982238010657196,-0.683737,0.729698,0,0,0,0,0.4563479072824157,-0.10041412966252201,0.05001776198934281,-0.704001,0.710166,0,0,0,0,0.4563479072824157,-0.10041412966252201,-0.049982238010657196,-0.70397,0.710196,0,0,0,0,0.4606369072824157,-0.09603512966252202,0.05001776198934281,-0.725486,0.688223,0,0,0,0,0.4606369072824157,-0.09603512966252202,-0.049982238010657196,-0.725486,0.688223,0,0,0,0,0.46502990728241556,-0.09125312966252203,0.05001776198934281,-0.748009,0.663686,0,0,0,0,0.46502990728241556,-0.09125312966252203,-0.049982238010657196,-0.747978,0.663686,0,0,0,0,0.4694749072824156,-0.08606612966252201,0.05001776198934281,-0.771355,0.636402,0,0,0,0,0.4694749072824156,-0.08606612966252201,-0.049982238010657196,-0.771325,0.636402,0,0,0,0,0.4739189072824157,-0.08047012966252202,0.05001776198934281,-0.795282,0.60622,0,0,0,0,0.4739189072824157,-0.08047012966252202,-0.049982238010657196,-0.795282,0.60622,0,0,0,0,0.47831190728241557,-0.07446312966252203,0.05001776198934281,-0.95056,0.310465,0,0,0,0,0.47831190728241557,-0.07446312966252203,-0.049982238010657196,-0.95056,0.310465,0,0,0,0,0.47831190728241557,0.083780870337478,0.05001776198934281,-0.938017,-0.346538,0,0,0,0,0.47831190728241557,0.083780870337478,-0.049982238010657196,-0.938017,-0.346538,0,0,0,0,0.4694559072824156,0.094129870337478,0.05001776198934281,-0.740989,-0.671499,0,0,0,0,0.47831190728241557,-0.15234212966252203,0.05001776198934281,-0.363018,-0.931761,0,0,0,0,0.47831190728241557,-0.15234212966252203,-0.049982238010657196,-0.363018,-0.931761,0,0,0,0,0.47831190728241557,-0.19376712966252202,-0.049982238010657196,-0.707083,-0.707083,0,0,0,0,0.4687639072824157,-0.16273512966252202,0.05001776198934281,0.70217,-0.711966,0,0,0,0,0.4687639072824157,-0.16273512966252202,-0.049982238010657196,0.70217,-0.711966,0,0,0,0,0.4588189072824156,-0.17162012966252202,0.05001776198934281,0.628834,-0.77752,0,0,0,0,0.4588189072824156,-0.17162012966252202,-0.049982238010657196,0.628834,-0.77749,0,0,0,0,0.44856290728241555,-0.17911312966252202,0.05001776198934281,0.550645,-0.834712,0,0,0,0,0.44856290728241555,-0.17911312966252202,-0.049982238010657196,0.550645,-0.834712,0,0,0,0,0.43808390728241564,-0.18532912966252202,0.05001776198934281,0.470412,-0.882443,0,0,0,0,0.43808390728241564,-0.18532912966252202,-0.049982238010657196,0.470412,-0.882412,0,0,0,0,0.4274649072824157,-0.19038212966252202,0.05001776198934281,0.390973,-0.920377,0,0,0,0,0.4274649072824157,-0.19038212966252202,-0.049982238010657196,0.390973,-0.920377,0,0,0,0,0.41679590728241567,-0.19438812966252203,0.05001776198934281,0.314829,-0.949126,0,0,0,0,0.41679590728241567,-0.19438812966252203,-0.049982238010657196,0.314829,-0.949126,0,0,0,0,0.4061599072824156,-0.19746312966252202,0.05001776198934281,0.243934,-0.969787,0,0,0,0,0.4061599072824156,-0.19746312966252202,-0.049982238010657196,0.243934,-0.969787,0,0,0,0,0.39564590728241567,-0.199720129662522,0.05001776198934281,0.179632,-0.983703,0,0,0,0,0.39564590728241567,-0.199720129662522,-0.049982238010657196,0.179632,-0.983703,0,0,0,0,0.3853389072824156,-0.201275129662522,0.05001776198934281,0.122776,-0.992431,0,0,0,0,0.3853389072824156,-0.201275129662522,-0.049982238010657196,0.122776,-0.992431,0,0,0,0,0.37532490728241563,-0.20224412966252203,0.05001776198934281,0.073885,-0.997253,0,0,0,0,0.37532490728241563,-0.20224412966252203,-0.049982238010657196,0.073885,-0.997253,0,0,0,0,0.36568990728241557,-0.20274112966252203,0.05001776198934281,0.033357,-0.99942,0,0,0,0,0.36568990728241557,-0.20274112966252203,-0.049982238010657196,0.033357,-0.99942,0,0,0,0,0.35652190728241573,-0.20288112966252203,0.05001776198934281,-0.001587,-0.999969,0,0,0,0,0.35652190728241573,-0.20288112966252203,-0.049982238010657196,-0.001587,-0.999969,0,0,0,0,0.3457139072824156,-0.20268112966252202,0.05001776198934281,-0.039521,-0.999207,0,0,0,0,0.3457139072824156,-0.20268112966252202,-0.049982238010657196,-0.039521,-0.999207,0,0,0,0,0.33522690728241566,-0.20204412966252203,0.05001776198934281,-0.085513,-0.996307,0,0,0,0,0.33522690728241566,-0.20204412966252203,-0.049982238010657196,-0.085513,-0.996307,0,0,0,0,0.3250389072824156,-0.200913129662522,0.05001776198934281,-0.138981,-0.990265,0,0,0,0,0.3250389072824156,-0.200913129662522,-0.049982238010657196,-0.138981,-0.990265,0,0,0,0,0.3151279072824156,-0.19922912966252201,0.05001776198934281,-0.199377,-0.979919,0,0,0,0,0.3151279072824156,-0.19922912966252201,-0.049982238010657196,-0.199377,-0.979919,0,0,0,0,0.30546990728241563,-0.19693512966252202,0.05001776198934281,-0.265511,-0.96408,0,0,0,0,0.30546990728241563,-0.19693512966252202,-0.049982238010657196,-0.265511,-0.96408,0,0,0,0,0.29604190728241564,-0.19397412966252203,0.05001776198934281,-0.335643,-0.941984,0,0,0,0,0.29604190728241564,-0.19397412966252203,-0.049982238010657196,-0.335643,-0.941954,0,0,0,0,0.2868209072824157,-0.190288129662522,0.05001776198934281,-0.407514,-0.913175,0,0,0,0,0.2868209072824157,-0.190288129662522,-0.049982238010657196,-0.407514,-0.913175,0,0,0,0,0.27778390728241575,-0.185820129662522,0.05001776198934281,-0.478622,-0.877987,0,0,0,0,0.27778390728241575,-0.185820129662522,-0.049982238010657196,-0.478652,-0.877987,0,0,0,0,0.26890790728241565,-0.18051112966252203,0.05001776198934281,-0.546587,-0.837367,0,0,0,0,0.26890790728241565,-0.18051112966252203,-0.049982238010657196,-0.546587,-0.837367,0,0,0,0,0.26017090728241565,-0.174305129662522,0.05001776198934281,-0.609394,-0.79284,0,0,0,0,0.26017090728241565,-0.174305129662522,-0.049982238010657196,-0.609394,-0.79284,0,0,0,0,0.2515479072824156,-0.167144129662522,0.05001776198934281,-0.665792,-0.746117,0,0,0,0,0.2515479072824156,-0.167144129662522,-0.049982238010657196,-0.665792,-0.746117,0,0,0,0,0.24301790728241568,-0.15897012966252203,0.05001776198934281,-0.717429,-0.696585,0,0,0,0,0.24301790728241568,-0.15897012966252203,-0.049982238010657196,-0.717429,-0.696585,0,0,0,0,0.2328919072824156,-0.14775812966252203,0.05001776198934281,-0.76928,-0.638874,0,0,0,0,0.2328919072824156,-0.14775812966252203,-0.049982238010657196,-0.76928,-0.638874,0,0,0,0,0.2240079072824157,-0.136110129662522,0.05001776198934281,-0.81933,-0.57329,0,0,0,0,0.2240079072824157,-0.136110129662522,-0.049982238010657196,-0.81933,-0.57329,0,0,0,0,0.21629890728241574,-0.12406912966252202,0.05001776198934281,-0.862911,-0.505295,0,0,0,0,0.21629890728241574,-0.12406912966252202,-0.049982238010657196,-0.862941,-0.505295,0,0,0,0,0.20969390728241555,-0.11168412966252202,0.05001776198934281,-0.899625,-0.436598,0,0,0,0,0.20969390728241555,-0.11168412966252202,-0.049982238010657196,-0.899625,-0.436598,0,0,0,0,0.2041239072824157,-0.09900012966252202,0.05001776198934281,-0.929472,-0.368816,0,0,0,0,0.2041239072824157,-0.09900012966252202,-0.049982238010657196,-0.929472,-0.368816,0,0,0,0,0.1995219072824157,-0.08606212966252202,0.05001776198934281,-0.952849,-0.303415,0,0,0,0,0.1995219072824157,-0.08606212966252202,-0.049982238010657196,-0.952849,-0.303415,0,0,0,0,0.1958159072824157,-0.07291712966252202,0.05001776198934281,-0.970397,-0.241432,0,0,0,0,0.1958159072824157,-0.07291712966252202,-0.049982238010657196,-0.970397,-0.241401,0,0,0,0,0.1929389072824157,-0.05961112966252202,0.05001776198934281,-0.982971,-0.18363,0,0,0,0,0.1929389072824157,-0.05961112966252202,-0.049982238010657196,-0.982971,-0.18363,0,0,0,0,0.19082190728241555,-0.046190129662522006,0.05001776198934281,-0.991424,-0.130528,0,0,0,0,0.19082190728241555,-0.046190129662522006,-0.049982238010657196,-0.991424,-0.130528,0,0,0,0,0.1893949072824157,-0.03270012966252203,0.05001776198934281,-0.996582,-0.082369,0,0,0,0,0.1893949072824157,-0.03270012966252203,-0.049982238010657196,-0.996582,-0.082339,0,0,0,0,0.18858990728241576,-0.019187129662522007,0.05001776198934281,-0.999207,-0.039155,0,0,0,0,0.18858990728241576,-0.019187129662522007,-0.049982238010657196,-0.999207,-0.039125,0,0,0,0,0.1883369072824157,-0.0056971296625220325,0.05001776198934281,-0.999969,0.005707,0,0,0,0,0.1883369072824157,-0.0056971296625220325,-0.049982238010657196,-0.999969,0.005707,0,0,0,0,0.18896990728241558,0.015248870337477988,0.05001776198934281,-0.998077,0.061525,0,0,0,0,0.18896990728241558,0.015248870337477988,-0.049982238010657196,-0.998077,0.061525,0,0,0,0,0.19077590728241556,0.034626870337477994,0.05001776198934281,-0.992126,0.125034,0,0,0,0,0.19077590728241556,0.034626870337477994,-0.049982238010657196,-0.992126,0.125034,0,0,0,0,0.19361790728241557,0.052491870337477986,0.05001776198934281,-0.981811,0.189764,0,0,0,0,0.19361790728241557,0.052491870337477986,-0.049982238010657196,-0.981811,0.189764,0,0,0,0,0.19735790728241565,0.06889787033747796,0.05001776198934281,-0.966948,0.25486,0,0,0,0,0.19735790728241565,0.06889787033747796,-0.049982238010657196,-0.966948,0.25486,0,0,0,0,0.20185690728241568,0.083900870337478,0.05001776198934281,-0.9476,0.319376,0,0,0,0,0.20185690728241568,0.083900870337478,-0.049982238010657196,-0.9476,0.319376,0,0,0,0,0.2069779072824156,0.09755387033747798,0.05001776198934281,-0.924039,0.382244,0,0,0,0,0.2069779072824156,0.09755387033747798,-0.049982238010657196,-0.924039,0.382275,0,0,0,0,0.21258190728241555,0.10991287033747799,0.05001776198934281,-0.896695,0.442579,0,0,0,0,0.21258190728241555,0.10991287033747799,-0.049982238010657196,-0.896695,0.442579,0,0,0,0,0.21853090728241575,0.12103187033747798,0.05001776198934281,-0.866298,0.499496,0,0,0,0,0.21853090728241575,0.12103187033747798,-0.049982238010657196,-0.866298,0.499496,0,0,0,0,0.22468690728241558,0.13096587033747797,0.05001776198934281,-0.833613,0.552293,0,0,0,0,0.22468690728241558,0.13096587033747797,-0.049982238010657196,-0.833613,0.552324,0,0,0,0,0.23091190728241573,0.13976987033747795,0.05001776198934281,-0.799615,0.600452,0,0,0,0,0.23091190728241573,0.13976987033747795,-0.049982238010657196,-0.799615,0.600482,0,0,0,0,0.2370689072824157,0.147496870337478,0.05001776198934281,-0.765343,0.643574,0,0,0,0,0.2370689072824157,0.147496870337478,-0.049982238010657196,-0.765374,0.643574,0,0,0,0,0.24301790728241568,0.15420287033747798,0.05001776198934281,-0.724845,0.688894,0,0,0,0,0.24301790728241568,0.15420287033747798,-0.049982238010657196,-0.724845,0.688894,0,0,0,0,0.25266190728241567,0.16367687033747796,0.05001776198934281,-0.670309,0.742027,0,0,0,0,0.25266190728241567,0.16367687033747796,-0.049982238010657196,-0.670309,0.742058,0,0,0,0,0.26251790728241575,0.171858870337478,0.05001776198934281,-0.605274,0.795984,0,0,0,0,0.26251790728241575,0.171858870337478,-0.049982238010657196,-0.605274,0.795984,0,0,0,0,0.2725589072824157,0.178837870337478,0.05001776198934281,-0.535203,0.844691,0,0,0,0,0.2725589072824157,0.178837870337478,-0.049982238010657196,-0.535203,0.844691,0,0,0,0,0.2827549072824156,0.18470387033747798,0.05001776198934281,-0.46205,0.886837,0,0,0,0,0.2827549072824156,0.18470387033747798,-0.049982238010657196,-0.462081,0.886807,0,0,0,0,0.2930779072824157,0.189545870337478,0.05001776198934281,-0.388165,0.921567,0,0,0,0,0.2930779072824157,0.189545870337478,-0.049982238010657196,-0.388165,0.921567,0,0,0,0,0.30349790728241555,0.193452870337478,0.05001776198934281,-0.315836,0.94879,0,0,0,0,0.30349790728241555,0.193452870337478,-0.049982238010657196,-0.315806,0.94879,0,0,0,0,0.31398790728241566,0.196514870337478,0.05001776198934281,-0.247108,0.968963,0,0,0,0,0.31398790728241566,0.196514870337478,-0.049982238010657196,-0.247108,0.968963,0,0,0,0,0.3245179072824156,0.19881887033747797,0.05001776198934281,-0.183721,0.982971,0,0,0,0,0.3245179072824156,0.19881887033747797,-0.049982238010657196,-0.183721,0.982971,0,0,0,0,0.3350589072824157,0.200456870337478,0.05001776198934281,-0.126835,0.991913,0,0,0,0,0.3350589072824157,0.200456870337478,-0.049982238010657196,-0.126835,0.991913,0,0,0,0,0.3455829072824157,0.20151587033747798,0.05001776198934281,-0.077242,0.997009,0,0,0,0,0.3455829072824157,0.20151587033747798,-0.049982238010657196,-0.077242,0.997009,0,0,0,0,0.3560609072824157,0.202085870337478,0.05001776198934281,-0.03534,0.999359,0,0,0,0,0.3560609072824157,0.202085870337478,-0.049982238010657196,-0.03534,0.999359,0,0,0,0,0.3664639072824156,0.202255870337478,0.05001776198934281,-0.000336,0.999969,0,0,0,0,0.3664639072824156,0.202255870337478,-0.049982238010657196,-0.000336,1,0,0,0,0,0.3744079072824156,0.20213187033747798,0.05001776198934281,0.034669,0.99939,0,0,0,0,0.3744079072824156,0.20213187033747798,-0.049982238010657196,0.034669,0.99939,0,0,0,0,0.38286190728241576,0.201676870337478,0.05001776198934281,0.077792,0.996948,0,0,0,0,0.38286190728241576,0.201676870337478,-0.049982238010657196,0.077792,0.996948,0,0,0,0,0.39174590728241565,0.200767870337478,0.05001776198934281,0.130467,0.991424,0,0,0,0,0.39174590728241565,0.200767870337478,-0.049982238010657196,0.130467,0.991424,0,0,0,0,0.40098490728241565,0.19927987033747796,0.05001776198934281,0.191717,0.981445,0,0,0,0,0.40098490728241565,0.19927987033747796,-0.049982238010657196,0.191717,0.981445,0,0,0,0,0.4104999072824156,0.197089870337478,0.05001776198934281,0.260537,0.965453,0,0,0,0,0.4104999072824156,0.197089870337478,-0.049982238010657196,0.260537,0.965453,0,0,0,0,0.42021290728241567,0.194074870337478,0.05001776198934281,0.335459,0.942045,0,0,0,0,0.42021290728241567,0.194074870337478,-0.049982238010657196,0.335459,0.942045,0,0,0,0,0.43004690728241557,0.190109870337478,0.05001776198934281,0.414533,0.910031,0,0,0,0,0.43004690728241557,0.190109870337478,-0.049982238010657196,0.414502,0.910031,0,0,0,0,0.4399249072824156,0.185072870337478,0.05001776198934281,0.495224,0.86874,0,0,0,0,0.4399249072824156,0.185072870337478,-0.049982238010657196,0.495224,0.86874,0,0,0,0,0.44976690728241575,0.178837870337478,0.05001776198934281,0.574816,0.818262,0,0,0,0,0.44976690728241575,0.178837870337478,-0.049982238010657196,0.574816,0.818262,0,0,0,0,0.4594979072824157,0.17128287033747797,0.05001776198934281,0.650441,0.759514,0,0,0,0,0.4594979072824157,0.17128287033747797,-0.049982238010657196,0.650441,0.759545,0,0,0,0,0.4690389072824157,0.162283870337478,0.05001776198934281,0.719657,0.694296,0,0,0,0,0.4690389072824157,0.162283870337478,-0.049982238010657196,0.719657,0.694296,0,0,0,0,0.47831190728241557,0.15171787033747797,0.05001776198934281,-0.352397,0.93582,0,0,0,0,0.47831190728241557,0.15171787033747797,-0.049982238010657196,-0.352397,0.93582,0,0,0,0,0.47831190728241557,0.38618287033747795,0.05001776198934281,-0.707083,0.707083,0,0,0,0,0.47831190728241557,0.38618287033747795,-0.049982238010657196,-0.707083,0.707083,0,0,0,0,0.5470769072824158,0.38618287033747795,0.05001776198934281,0.707083,0.707083,0,0,0,0,0.5470769072824158,0.38618287033747795,-0.049982238010657196,0.707083,0.707083,0,0,0,0,0.5470769072824158,-0.19376712966252202,0.05001776198934281,0.707083,-0.707083,0,0,0,0,0.5470769072824158,-0.19376712966252202,-0.049982238010657196,0.707083,-0.707083,0,0,0,0,0.47831190728241557,-0.19376712966252202,0.05001776198934281,-0.707083,-0.707083,0,0,0,0,0.9003949072824158,0.07500087033747799,0.05001776198934281,-0.947478,-0.319803,0,0,0,0,0.9003949072824158,0.07500087033747799,-0.049982238010657196,-0.947478,-0.319773,0,0,0,0,0.9042339072824155,0.06097787033747798,-0.049982238010657196,-0.97766,-0.210181,0,0,0,0,0.8952549072824159,0.087728870337478,0.05001776198934281,-0.90289,-0.429853,0,0,0,0,0.8952549072824159,0.087728870337478,-0.049982238010657196,-0.90289,-0.429823,0,0,0,0,0.8889409072824157,0.09915387033747797,0.05001776198934281,-0.843501,-0.537095,0,0,0,0,0.8889409072824157,0.09915387033747797,-0.049982238010657196,-0.843501,-0.537095,0,0,0,0,0.8815809072824154,0.109266870337478,0.05001776198934281,-0.769768,-0.638295,0,0,0,0,0.8815809072824154,0.109266870337478,-0.049982238010657196,-0.769738,-0.638295,0,0,0,0,0.8732989072824155,0.118059870337478,0.05001776198934281,-0.682943,-0.73043,0,0,0,0,0.8732989072824155,0.118059870337478,-0.049982238010657196,-0.682943,-0.73043,0,0,0,0,0.8642239072824158,0.12552387033747797,0.05001776198934281,-0.584918,-0.81106,0,0,0,0,0.8642239072824158,0.12552387033747797,-0.049982238010657196,-0.584918,-0.81106,0,0,0,0,0.8544819072824157,0.131649870337478,0.05001776198934281,-0.477828,-0.878414,0,0,0,0,0.8544819072824157,0.131649870337478,-0.049982238010657196,-0.477828,-0.878414,0,0,0,0,0.8441979072824157,0.13642887033747797,0.05001776198934281,-0.363903,-0.931425,0,0,0,0,0.8441979072824157,0.13642887033747797,-0.049982238010657196,-0.363903,-0.931425,0,0,0,0,0.8335009072824158,0.13985387033747798,0.05001776198934281,-0.245125,-0.969481,0,0,0,0,0.8335009072824158,0.13985387033747798,-0.049982238010657196,-0.245125,-0.969481,0,0,0,0,0.8225149072824158,0.14191487033747796,0.05001776198934281,-0.123264,-0.99237,0,0,0,0,0.8225149072824158,0.14191487033747796,-0.049982238010657196,-0.123264,-0.99237,0,0,0,0,0.8113689072824157,0.14260387033747796,0.05001776198934281,-0.001251,-0.999969,0,0,0,0,0.8113689072824157,0.14260387033747796,-0.049982238010657196,-0.001251,-0.999969,0,0,0,0,0.7994759072824156,0.141898870337478,0.05001776198934281,0.119083,-0.992859,0,0,0,0,0.7994759072824156,0.141898870337478,-0.049982238010657196,0.119083,-0.992859,0,0,0,0,0.7878909072824156,0.13979587033747798,0.05001776198934281,0.238533,-0.971129,0,0,0,0,0.7878909072824156,0.13979587033747798,-0.049982238010657196,0.238533,-0.971129,0,0,0,0,0.7767139072824156,0.13631287033747796,0.05001776198934281,0.356304,-0.934355,0,0,0,0,0.7767139072824156,0.13631287033747796,-0.049982238010657196,0.356304,-0.934355,0,0,0,0,0.7660469072824156,0.131464870337478,0.05001776198934281,0.469955,-0.882687,0,0,0,0,0.7660469072824156,0.131464870337478,-0.049982238010657196,0.469924,-0.882687,0,0,0,0,0.7559889072824157,0.125271870337478,0.05001776198934281,0.5768,-0.816858,0,0,0,0,0.7559889072824157,0.125271870337478,-0.049982238010657196,0.5768,-0.816858,0,0,0,0,0.7466419072824158,0.117748870337478,0.05001776198934281,0.674367,-0.738365,0,0,0,0,0.7466419072824158,0.117748870337478,-0.049982238010657196,0.674367,-0.738365,0,0,0,0,0.7381069072824156,0.10891487033747799,0.05001776198934281,0.760491,-0.649312,0,0,0,0,0.7381069072824156,0.10891487033747799,-0.049982238010657196,0.760491,-0.649312,0,0,0,0,0.7304829072824157,0.09878587033747799,0.05001776198934281,0.833552,-0.552385,0,0,0,0,0.7304829072824157,0.09878587033747799,-0.049982238010657196,0.833552,-0.552385,0,0,0,0,0.7238719072824156,0.08737887033747799,0.05001776198934281,0.892727,-0.450575,0,0,0,0,0.7238719072824156,0.08737887033747799,-0.049982238010657196,0.892727,-0.450575,0,0,0,0,0.7183739072824156,0.07471287033747798,0.05001776198934281,0.937925,-0.346782,0,0,0,0,0.7183739072824156,0.07471287033747798,-0.049982238010657196,0.937925,-0.346782,0,0,0,0,0.7140899072824156,0.06080387033747797,0.05001776198934281,0.969817,-0.243751,0,0,0,0,0.7140899072824156,0.06080387033747797,-0.049982238010657196,0.969817,-0.243751,0,0,0,0,0.7111199072824157,0.04566987033747799,0.05001776198934281,0.772179,0.635395,0,0,0,0,0.7111199072824157,0.04566987033747799,-0.049982238010657196,0.772149,0.635395,0,0,0,0,0.9066469072824157,0.04566987033747799,0.05001776198934281,-0.760125,0.649739,0,0,0,0,0.9066469072824157,0.04566987033747799,-0.049982238010657196,-0.760125,0.649739,0,0,0,0,0.9042339072824155,0.06097787033747798,0.05001776198934281,-0.97763,-0.210181,0,0,0,0,0.9597159072824155,-0.15819512966252203,0.05001776198934281,0.661977,-0.749504,0,0,0,0,0.9597159072824155,-0.15819512966252203,-0.049982238010657196,0.661977,-0.749504,0,0,0,0,0.9682889072824157,-0.15008812966252202,-0.049982238010657196,0.709342,-0.704825,0,0,0,0,0.9504529072824157,-0.16583112966252203,0.05001776198934281,0.607471,-0.794305,0,0,0,0,0.9504529072824157,-0.16583112966252203,-0.049982238010657196,0.607471,-0.794305,0,0,0,0,0.9404309072824155,-0.17293212966252203,0.05001776198934281,0.546434,-0.837458,0,0,0,0,0.9404309072824155,-0.17293212966252203,-0.049982238010657196,0.546434,-0.837489,0,0,0,0,0.9295799072824158,-0.179434129662522,0.05001776198934281,0.479934,-0.877285,0,0,0,0,0.9295799072824158,-0.179434129662522,-0.049982238010657196,0.479934,-0.877285,0,0,0,0,0.9178309072824158,-0.18527512966252202,0.05001776198934281,0.409497,-0.91229,0,0,0,0,0.9178309072824158,-0.18527512966252202,-0.049982238010657196,0.409528,-0.91229,0,0,0,0,0.9051159072824158,-0.19039112966252203,0.05001776198934281,0.336985,-0.941496,0,0,0,0,0.9051159072824158,-0.19039112966252203,-0.049982238010657196,0.336955,-0.941496,0,0,0,0,0.8913649072824157,-0.19471812966252203,0.05001776198934281,0.264199,-0.964446,0,0,0,0,0.8913649072824157,-0.19471812966252203,-0.049982238010657196,0.264199,-0.964446,0,0,0,0,0.8765099072824158,-0.19819412966252203,0.05001776198934281,0.192907,-0.981201,0,0,0,0,0.8765099072824158,-0.19819412966252203,-0.049982238010657196,0.192907,-0.981201,0,0,0,0,0.8604809072824158,-0.20075612966252201,0.05001776198934281,0.124577,-0.992187,0,0,0,0,0.8604809072824158,-0.20075612966252201,-0.049982238010657196,0.124577,-0.992187,0,0,0,0,0.8432089072824156,-0.20233912966252202,0.05001776198934281,0.060213,-0.998169,0,0,0,0,0.8432089072824156,-0.20233912966252202,-0.049982238010657196,0.060213,-0.998169,0,0,0,0,0.8246249072824154,-0.20288112966252203,0.05001776198934281,0.007721,-0.999969,0,0,0,0,0.8246249072824154,-0.20288112966252203,-0.049982238010657196,0.007721,-0.999969,0,0,0,0,0.8131689072824155,-0.202724129662522,0.05001776198934281,-0.030213,-0.999542,0,0,0,0,0.8131689072824155,-0.202724129662522,-0.049982238010657196,-0.030213,-0.999542,0,0,0,0,0.8016069072824157,-0.20218212966252203,0.05001776198934281,-0.067782,-0.997681,0,0,0,0,0.8016069072824157,-0.20218212966252203,-0.049982238010657196,-0.067782,-0.997681,0,0,0,0,0.7899699072824156,-0.20114612966252202,0.05001776198934281,-0.113926,-0.993469,0,0,0,0,0.7899699072824156,-0.20114612966252202,-0.049982238010657196,-0.113926,-0.993469,0,0,0,0,0.7782899072824156,-0.199505129662522,0.05001776198934281,-0.16831,-0.985717,0,0,0,0,0.7782899072824156,-0.199505129662522,-0.049982238010657196,-0.16831,-0.985717,0,0,0,0,0.7665989072824158,-0.19715112966252202,0.05001776198934281,-0.23014,-0.973144,0,0,0,0,0.7665989072824158,-0.19715112966252202,-0.049982238010657196,-0.23014,-0.973144,0,0,0,0,0.7549269072824156,-0.19397412966252203,0.05001776198934281,-0.298196,-0.954466,0,0,0,0,0.7549269072824156,-0.19397412966252203,-0.049982238010657196,-0.298196,-0.954497,0,0,0,0,0.7433079072824156,-0.18986512966252203,0.05001776198934281,-0.3708,-0.928678,0,0,0,0,0.7433079072824156,-0.18986512966252203,-0.049982238010657196,-0.3708,-0.928678,0,0,0,0,0.7317719072824156,-0.18471512966252202,0.05001776198934281,-0.445753,-0.895138,0,0,0,0,0.7317719072824156,-0.18471512966252202,-0.049982238010657196,-0.445753,-0.895138,0,0,0,0,0.7203499072824155,-0.17841412966252201,0.05001776198934281,-0.520493,-0.853847,0,0,0,0,0.7203499072824155,-0.17841412966252201,-0.049982238010657196,-0.520493,-0.853847,0,0,0,0,0.7090759072824158,-0.17085312966252203,0.05001776198934281,-0.592517,-0.805536,0,0,0,0,0.7090759072824158,-0.17085312966252203,-0.049982238010657196,-0.592517,-0.805536,0,0,0,0,0.6979799072824155,-0.161922129662522,0.05001776198934281,-0.659627,-0.751579,0,0,0,0,0.6979799072824155,-0.161922129662522,-0.049982238010657196,-0.659627,-0.751579,0,0,0,0,0.6870939072824156,-0.151513129662522,0.05001776198934281,-0.720237,-0.693686,0,0,0,0,0.6870939072824156,-0.151513129662522,-0.049982238010657196,-0.720237,-0.693716,0,0,0,0,0.6788659072824157,-0.14223512966252203,0.05001776198934281,-0.77102,-0.636769,0,0,0,0,0.6788659072824157,-0.14223512966252203,-0.049982238010657196,-0.77102,-0.636799,0,0,0,0,0.6711869072824157,-0.13224312966252202,0.05001776198934281,-0.813105,-0.58208,0,0,0,0,0.6711869072824157,-0.13224312966252202,-0.049982238010657196,-0.813105,-0.58211,0,0,0,0,0.6640899072824156,-0.12158412966252202,0.05001776198934281,-0.850124,-0.526566,0,0,0,0,0.6640899072824156,-0.12158412966252202,-0.049982238010657196,-0.850093,-0.526566,0,0,0,0,0.6576049072824157,-0.11030312966252202,0.05001776198934281,-0.882443,-0.470351,0,0,0,0,0.6576049072824157,-0.11030312966252202,-0.049982238010657196,-0.882443,-0.470351,0,0,0,0,0.6517649072824157,-0.09844712966252202,0.05001776198934281,-0.910459,-0.413556,0,0,0,0,0.6517649072824157,-0.09844712966252202,-0.049982238010657196,-0.910459,-0.413556,0,0,0,0,0.6466009072824157,-0.08606212966252202,0.05001776198934281,-0.934385,-0.356212,0,0,0,0,0.6466009072824157,-0.08606212966252202,-0.049982238010657196,-0.934385,-0.356212,0,0,0,0,0.6421439072824155,-0.07319312966252202,0.05001776198934281,-0.954466,-0.298257,0,0,0,0,0.6421439072824155,-0.07319312966252202,-0.049982238010657196,-0.954466,-0.298288,0,0,0,0,0.6384269072824156,-0.05988712966252202,0.05001776198934281,-0.970824,-0.239784,0,0,0,0,0.6384269072824156,-0.05988712966252202,-0.049982238010657196,-0.970824,-0.239784,0,0,0,0,0.6354809072824157,-0.046190129662522006,0.05001776198934281,-0.98352,-0.18067,0,0,0,0,0.6354809072824157,-0.046190129662522006,-0.049982238010657196,-0.98352,-0.18067,0,0,0,0,0.6333369072824158,-0.03214812966252201,0.05001776198934281,-0.992645,-0.120945,0,0,0,0,0.6333369072824158,-0.03214812966252201,-0.049982238010657196,-0.992645,-0.120945,0,0,0,0,0.6320279072824158,-0.017807129662522014,0.05001776198934281,-0.998138,-0.060671,0,0,0,0,0.6320279072824158,-0.017807129662522014,-0.049982238010657196,-0.998138,-0.06064,0,0,0,0,0.6315839072824156,-0.0032121296625220175,0.05001776198934281,-0.999939,0.009125,0,0,0,0,0.6315839072824156,-0.0032121296625220175,-0.049982238010657196,-0.999939,0.009125,0,0,0,0,0.6327809072824158,0.021367870337477973,0.05001776198934281,-0.99527,0.097049,0,0,0,0,0.6327809072824158,0.021367870337477973,-0.049982238010657196,-0.99527,0.097049,0,0,0,0,0.6363909072824157,0.04595287033747797,0.05001776198934281,-0.980926,0.194311,0,0,0,0,0.6363909072824157,0.04595287033747797,-0.049982238010657196,-0.980926,0.194311,0,0,0,0,0.6424459072824156,0.07013587033747798,0.05001776198934281,-0.955992,0.293283,0,0,0,0,0.6424459072824156,0.07013587033747798,-0.049982238010657196,-0.955992,0.293283,0,0,0,0,0.6509769072824156,0.09350787033747798,0.05001776198934281,-0.918607,0.395093,0,0,0,0,0.6509769072824156,0.09350787033747798,-0.049982238010657196,-0.918607,0.395093,0,0,0,0,0.6620179072824157,0.11565987033747799,0.05001776198934281,-0.866085,0.499863,0,0,0,0,0.6620179072824157,0.11565987033747799,-0.049982238010657196,-0.866085,0.499863,0,0,0,0,0.6755979072824156,0.136182870337478,0.05001776198934281,-0.795251,0.60622,0,0,0,0,0.6755979072824156,0.136182870337478,-0.049982238010657196,-0.795251,0.60622,0,0,0,0,0.6917509072824157,0.15466987033747798,0.05001776198934281,-0.70336,0.710807,0,0,0,0,0.6917509072824157,0.15466987033747798,-0.049982238010657196,-0.70336,0.710807,0,0,0,0,0.7105069072824157,0.17071187033747798,0.05001776198934281,-0.589129,0.808008,0,0,0,0,0.7105069072824157,0.17071187033747798,-0.049982238010657196,-0.589129,0.808008,0,0,0,0,0.7318979072824157,0.18389987033747796,0.05001776198934281,-0.454543,0.890683,0,0,0,0,0.7318979072824157,0.18389987033747796,-0.049982238010657196,-0.454543,0.890683,0,0,0,0,0.7559549072824157,0.19382487033747797,0.05001776198934281,-0.30549,0.952178,0,0,0,0,0.7559549072824157,0.19382487033747797,-0.049982238010657196,-0.30549,0.952178,0,0,0,0,0.7827109072824157,0.20007987033747798,0.05001776198934281,-0.151067,0.988495,0,0,0,0,0.7827109072824157,0.20007987033747798,-0.049982238010657196,-0.151067,0.988495,0,0,0,0,0.8121979072824157,0.202255870337478,0.05001776198934281,0.002716,0.999969,0,0,0,0,0.8121979072824157,0.202255870337478,-0.049982238010657196,0.002716,0.999969,0,0,0,0,0.8445119072824157,0.19969487033747796,0.05001776198934281,0.164892,0.986297,0,0,0,0,0.8445119072824157,0.19969487033747796,-0.049982238010657196,0.164892,0.986297,0,0,0,0,0.8728389072824156,0.19239487033747799,0.05001776198934281,0.337565,0.941282,0,0,0,0,0.8728389072824156,0.19239487033747799,-0.049982238010657196,0.337565,0.941282,0,0,0,0,0.8974039072824156,0.18093487033747796,0.05001776198934281,0.50441,0.86343,0,0,0,0,0.8974039072824156,0.18093487033747796,-0.049982238010657196,0.50441,0.86343,0,0,0,0,0.9184299072824156,0.165893870337478,0.05001776198934281,0.650166,0.759758,0,0,0,0,0.9184299072824156,0.165893870337478,-0.049982238010657196,0.650166,0.759758,0,0,0,0,0.9361419072824155,0.14784987033747798,0.05001776198934281,0.765984,0.642811,0,0,0,0,0.9361419072824155,0.14784987033747798,-0.049982238010657196,0.765984,0.642811,0,0,0,0,0.9507649072824158,0.12738087033747797,0.05001776198934281,0.851161,0.524888,0,0,0,0,0.9507649072824158,0.12738087033747797,-0.049982238010657196,0.851161,0.524888,0,0,0,0,0.9625219072824156,0.105063870337478,0.05001776198934281,0.910245,0.414014,0,0,0,0,0.9625219072824156,0.105063870337478,-0.049982238010657196,0.910245,0.414014,0,0,0,0,0.9716379072824157,0.08147887033747797,0.05001776198934281,0.949522,0.313669,0,0,0,0,0.9716379072824157,0.08147887033747797,-0.049982238010657196,0.949522,0.313669,0,0,0,0,0.9783379072824157,0.05720387033747798,0.05001776198934281,0.974548,0.224097,0,0,0,0,0.9783379072824157,0.05720387033747798,-0.049982238010657196,0.974548,0.224097,0,0,0,0,0.9828459072824156,0.03281587033747799,0.05001776198934281,0.989593,0.143773,0,0,0,0,0.9828459072824156,0.03281587033747799,-0.049982238010657196,0.989593,0.143773,0,0,0,0,0.9853859072824158,0.00889487033747799,0.05001776198934281,0.997528,0.070223,0,0,0,0,0.9853859072824158,0.00889487033747799,-0.049982238010657196,0.997528,0.070223,0,0,0,0,0.9861829072824158,-0.01398212966252202,0.05001776198934281,0.719291,-0.694662,0,0,0,0,0.9861829072824158,-0.01398212966252202,-0.049982238010657196,0.719291,-0.694662,0,0,0,0,0.7078059072824157,-0.01398212966252202,0.05001776198934281,0.733146,-0.680044,0,0,0,0,0.7078059072824157,-0.01398212966252202,-0.049982238010657196,0.733146,-0.680044,0,0,0,0,0.7092809072824156,-0.033582129662522026,0.05001776198934281,0.991241,0.131901,0,0,0,0,0.7092809072824156,-0.033582129662522026,-0.049982238010657196,0.991241,0.131901,0,0,0,0,0.7127659072824157,-0.05174812966252201,0.05001776198934281,0.969024,0.246864,0,0,0,0,0.7127659072824157,-0.05174812966252201,-0.049982238010657196,0.969024,0.246864,0,0,0,0,0.7180979072824156,-0.06843012966252202,0.05001776198934281,0.931761,0.363048,0,0,0,0,0.7180979072824156,-0.06843012966252202,-0.049982238010657196,0.931761,0.363048,0,0,0,0,0.7251129072824156,-0.08357612966252202,0.05001776198934281,0.878628,0.477432,0,0,0,0,0.7251129072824156,-0.08357612966252202,-0.049982238010657196,0.878628,0.477432,0,0,0,0,0.7336469072824157,-0.09713512966252202,0.05001776198934281,0.809656,0.58684,0,0,0,0,0.7336469072824157,-0.09713512966252202,-0.049982238010657196,0.809656,0.58684,0,0,0,0,0.7435349072824156,-0.10905312966252202,0.05001776198934281,0.725516,0.688192,0,0,0,0,0.7435349072824156,-0.10905312966252202,-0.049982238010657196,0.725516,0.688192,0,0,0,0,0.7546149072824158,-0.11928012966252202,0.05001776198934281,0.627461,0.778619,0,0,0,0,0.7546149072824158,-0.11928012966252202,-0.049982238010657196,0.627461,0.778619,0,0,0,0,0.7667219072824156,-0.127763129662522,0.05001776198934281,0.517258,0.8558,0,0,0,0,0.7667219072824156,-0.127763129662522,-0.049982238010657196,0.517258,0.8558,0,0,0,0,0.7796919072824156,-0.134452129662522,0.05001776198934281,0.397015,0.917783,0,0,0,0,0.7796919072824156,-0.134452129662522,-0.049982238010657196,0.397015,0.917783,0,0,0,0,0.7933599072824156,-0.13929312966252202,0.05001776198934281,0.26899,0.963134,0,0,0,0,0.7933599072824156,-0.13929312966252202,-0.049982238010657196,0.26899,0.963134,0,0,0,0,0.8075639072824154,-0.14223612966252203,0.05001776198934281,0.135716,0.990722,0,0,0,0,0.8075639072824154,-0.14223612966252203,-0.049982238010657196,0.135716,0.990722,0,0,0,0,0.8221389072824157,-0.14322812966252202,0.05001776198934281,0.026917,0.999634,0,0,0,0,0.8221389072824157,-0.14322812966252202,-0.049982238010657196,0.026917,0.999634,0,0,0,0,0.8283409072824157,-0.14314112966252202,0.05001776198934281,-0.031343,0.999481,0,0,0,0,0.8283409072824157,-0.14314112966252202,-0.049982238010657196,-0.031343,0.999481,0,0,0,0,0.8352959072824158,-0.142803129662522,0.05001776198934281,-0.069948,0.997528,0,0,0,0,0.8352959072824158,-0.142803129662522,-0.049982238010657196,-0.069948,0.997528,0,0,0,0,0.8429289072824155,-0.142102129662522,0.05001776198934281,-0.116337,0.993194,0,0,0,0,0.8429289072824155,-0.142102129662522,-0.049982238010657196,-0.116306,0.993194,0,0,0,0,0.8511679072824156,-0.14092712966252202,0.05001776198934281,-0.169164,0.985565,0,0,0,0,0.8511679072824156,-0.14092712966252202,-0.049982238010657196,-0.169164,0.985565,0,0,0,0,0.8599349072824158,-0.13916512966252204,0.05001776198934281,-0.227546,0.973754,0,0,0,0,0.8599349072824158,-0.13916512966252204,-0.049982238010657196,-0.227546,0.973754,0,0,0,0,0.8691569072824157,-0.13670412966252202,0.05001776198934281,-0.290353,0.956908,0,0,0,0,0.8691569072824157,-0.13670412966252202,-0.049982238010657196,-0.290384,0.956908,0,0,0,0,0.8787579072824157,-0.13343212966252202,0.05001776198934281,-0.356517,0.934263,0,0,0,0,0.8787579072824157,-0.13343212966252202,-0.049982238010657196,-0.356517,0.934263,0,0,0,0,0.8886649072824158,-0.12923612966252201,0.05001776198934281,-0.424604,0.905362,0,0,0,0,0.8886649072824158,-0.12923612966252201,-0.049982238010657196,-0.424604,0.905362,0,0,0,0,0.8988009072824155,-0.12400512966252202,0.05001776198934281,-0.493088,0.869961,0,0,0,0,0.8988009072824155,-0.12400512966252202,-0.049982238010657196,-0.493088,0.869961,0,0,0,0,0.9090929072824157,-0.11762612966252202,0.05001776198934281,-0.56035,0.828242,0,0,0,0,0.9090929072824157,-0.11762612966252202,-0.049982238010657196,-0.56035,0.828242,0,0,0,0,0.9194659072824156,-0.10998612966252203,0.05001776198934281,-0.624805,0.780755,0,0,0,0,0.9194659072824156,-0.10998612966252203,-0.049982238010657196,-0.624805,0.780755,0,0,0,0,0.9298439072824158,-0.10097512966252202,0.05001776198934281,0.001892,0.999969,0,0,0,0,0.9298439072824158,-0.10097512966252202,-0.049982238010657196,0.001892,0.999969,0,0,0,0,0.9762399072824155,-0.14157112966252203,0.05001776198934281,0.998718,0.050386,0,0,0,0,0.9762399072824155,-0.14157112966252203,-0.049982238010657196,0.998718,0.050386,0,0,0,0,0.9682889072824157,-0.15008812966252202,0.05001776198934281,0.709342,-0.704825,0,0,0,0,1.4153459072824157,-0.19376712966252202,0.05001776198934281,0.892666,-0.450667,0,0,0,0,1.4153459072824157,-0.19376712966252202,-0.049982238010657196,0.892666,-0.450667,0,0,0,0,1.2637299072824155,0.011700870337477992,-0.049982238010657196,0.999969,0.000885,0,0,0,0,1.3308389072824158,-0.19376712966252202,0.05001776198934281,-0.456648,-0.889615,0,0,0,0,1.3308389072824158,-0.19376712966252202,-0.049982238010657196,-0.456648,-0.889615,0,0,0,0,1.2214769072824159,-0.04132312966252202,0.05001776198934281,0,-1,0,0,0,0,1.2214769072824159,-0.04132312966252202,-0.049982238010657196,0,-1,0,0,0,0,1.1121149072824155,-0.19376712966252202,0.05001776198934281,0.456648,-0.889615,0,0,0,0,1.1121149072824155,-0.19376712966252202,-0.049982238010657196,0.456648,-0.889615,0,0,0,0,1.0276079072824156,-0.19376712966252202,0.05001776198934281,-0.893246,-0.449507,0,0,0,0,1.0276079072824156,-0.19376712966252202,-0.049982238010657196,-0.893246,-0.449507,0,0,0,0,1.1800519072824156,0.011700870337477992,0.05001776198934281,-0.999969,0.000702,0,0,0,0,1.1800519072824156,0.011700870337477992,-0.049982238010657196,-0.999969,0.000702,0,0,0,0,1.0458339072824154,0.19314287033747796,0.05001776198934281,-0.892941,0.450148,0,0,0,0,1.0458339072824154,0.19314287033747796,-0.049982238010657196,-0.892941,0.450148,0,0,0,0,1.1303419072824155,0.19314287033747796,0.05001776198934281,0.457564,0.889157,0,0,0,0,1.1303419072824155,0.19314287033747796,-0.049982238010657196,0.457564,0.889157,0,0,0,0,1.2214769072824159,0.065553870337478,0.05001776198934281,0,1,0,0,0,0,1.2214769072824159,0.065553870337478,-0.049982238010657196,0,1,0,0,0,0,1.3126119072824158,0.19314287033747796,0.05001776198934281,-0.457564,0.889157,0,0,0,0,1.3126119072824158,0.19314287033747796,-0.049982238010657196,-0.457564,0.889157,0,0,0,0,1.3971189072824157,0.19314287033747796,0.05001776198934281,0.89227,0.45146,0,0,0,0,1.3971189072824157,0.19314287033747796,-0.049982238010657196,0.89227,0.45146,0,0,0,0,1.2637299072824155,0.011700870337477992,0.05001776198934281,0.999969,0.000885,0,0,0,0],"ibuffer":[0,1,2,0,3,1,3,4,5,3,6,4,0,6,3,7,6,0,7,8,6,8,9,6,7,10,8,11,9,8,12,13,14,15,13,12,15,16,13,17,16,15,17,18,16,19,18,17,19,20,18,21,20,19,21,22,20,23,24,21,24,22,21,24,25,22,25,26,22,23,27,24,28,26,25,23,29,27,30,26,28,23,31,29,32,26,30,23,33,31,34,33,23,35,26,32,34,36,33,35,37,26,38,37,35,34,39,36,40,37,38,34,41,39,42,41,34,43,37,40,42,44,41,43,45,37,46,45,43,42,47,44,48,47,42,49,45,46,48,50,47,49,51,45,52,51,49,48,53,50,54,53,48,55,51,52,54,56,53,55,57,51,58,56,54,58,55,56,58,57,55,58,59,57,60,59,58,60,61,59,62,63,60,63,61,60,62,64,63,65,64,62,66,64,65,66,67,64,68,67,66,68,69,67,70,69,68,70,71,69,72,71,70,72,73,71,74,73,72,74,75,73,76,75,74,77,78,79,76,80,75,81,78,77,82,80,76,83,78,81,82,84,80,85,84,82,86,78,83,85,87,84,88,78,86,89,87,85,90,78,88,89,91,87,92,78,90,93,78,92,89,94,91,95,78,93,95,96,78,97,96,95,98,94,89,98,99,94,100,96,97,99,96,100,98,96,99,98,101,96,102,101,98,102,103,101,104,103,102,104,105,103,106,105,104,106,107,105,108,107,106,108,109,107,110,109,108,110,111,109,112,111,110,112,113,111,114,113,112,114,115,113,116,115,114,116,117,115,118,117,116,118,119,117,120,119,118,121,119,120,121,122,119,123,124,125,123,126,124,127,128,129,127,130,128,131,130,127,131,132,130,133,132,131,133,134,132,135,134,133,135,136,134,137,136,135,137,138,136,139,138,137,139,140,138,141,140,139,141,142,140,143,142,141,143,144,142,145,144,143,146,144,145,146,147,144,148,147,146,148,149,147,150,149,148,150,123,149,151,123,150,151,152,123,152,153,123,153,154,123,154,155,123,155,156,123,156,157,123,157,158,123,158,159,123,159,160,123,160,161,123,161,162,123,162,163,123,163,126,123,164,165,151,165,152,151,164,166,165,164,167,166,164,168,167,169,168,164,169,170,168,169,171,170,169,172,171,169,173,172,174,173,169,174,175,173,174,176,175,177,176,174,177,178,176,177,179,178,180,179,177,180,181,179,182,181,180,182,183,181,182,184,183,185,184,182,186,126,163,185,187,184,188,187,185,188,189,187,188,190,189,191,190,188,191,192,190,191,193,192,194,193,191,194,195,193,194,196,195,194,197,196,198,197,194,198,199,197,198,200,199,198,201,200,202,201,198,202,203,201,204,203,202,204,205,203,204,206,205,207,206,204,207,208,206,209,208,207,209,210,208,209,211,210,212,211,209,212,213,211,214,213,212,214,215,213,216,126,186,217,126,216,214,218,215,219,218,214,220,126,217,219,221,218,222,126,220,223,126,222,219,224,221,225,224,219,226,126,223,227,126,226,225,228,224,229,126,227,225,230,228,231,126,229,232,230,225,233,126,231,232,234,230,235,126,233,236,126,235,237,238,236,238,126,236,232,239,234,240,238,237,241,239,232,241,242,239,243,238,240,241,244,242,245,238,243,241,246,244,247,238,245,248,238,247,241,249,246,250,249,241,251,238,248,250,252,249,253,238,251,250,254,252,255,238,253,256,238,255,250,257,254,258,238,256,250,259,257,259,238,258,250,238,259,260,238,250,260,261,238,262,126,238,263,261,260,263,264,261,265,264,263,265,266,264,267,266,265,267,268,266,269,268,267,269,270,268,271,270,269,272,270,271,272,273,270,274,273,272,274,275,273,276,275,274,276,277,275,278,277,276,278,279,277,280,279,278,280,281,279,282,281,280,282,283,281,284,283,282,285,286,287,288,289,286,290,289,288,291,289,290,291,292,289,293,292,291,293,294,292,295,294,293,295,296,294,297,296,295,297,298,296,299,298,297,300,298,299,300,301,298,302,301,300,302,303,301,304,303,302,305,306,307,305,308,306,304,309,303,310,309,304,311,309,310,311,312,309,313,312,311,313,314,312,315,314,313,316,314,315,316,317,314,318,317,316,319,317,318,319,320,317,321,320,319,322,320,321,322,323,320,324,323,322,325,323,324,325,326,323,327,326,325,328,326,327,308,326,328,305,329,308,329,330,308,330,331,308,331,332,308,332,333,308,333,334,308,334,335,308,335,336,308,336,337,308,337,338,308,338,339,308,339,340,308,340,341,308,341,342,308,342,343,308,343,344,308,344,345,308,345,346,308,346,347,308,347,348,308,348,349,308,349,350,308,350,351,308,351,352,308,352,326,308,352,353,326,353,354,326,354,355,326,356,355,354,357,355,356,358,355,357,359,355,358,359,360,355,361,360,359,362,360,361,363,360,362,364,360,363,364,365,360,366,365,364,367,365,366,368,365,367,369,365,368,369,370,365,371,370,369,372,370,371,372,373,370,374,373,372,375,373,374,375,376,373,377,376,375,378,376,377,378,379,376,380,379,378,381,379,380,381,382,379,383,382,381,384,382,383,305,385,329,384,386,382,387,386,384,387,388,386,389,388,387,390,391,392,393,391,390,393,394,391,395,394,393,395,396,394,397,396,395,397,398,396,399,398,397,399,400,398,401,400,399,401,402,400,403,402,401,403,404,402,405,404,403,405,406,404,407,406,405,407,408,406,407,409,408,410,409,407,410,411,409,412,411,410,412,413,411,414,413,412,414,415,413,414,416,415,417,418,414,418,419,414,419,420,414,420,421,414,421,422,414,422,423,414,423,424,414,424,425,414,425,426,414,426,427,414,427,428,414,428,429,414,429,430,414,430,431,414,431,432,414,432,433,414,433,434,414,434,435,414,435,436,414,436,437,414,437,438,414,438,439,414,439,440,414,440,416,414,440,441,416,441,442,416,442,443,416,444,443,442,445,443,444,446,443,445,447,443,446,448,443,447,448,449,443,450,449,448,451,449,450,452,449,451,453,449,452,454,449,453,454,455,449,456,455,454,457,455,456,458,455,457,458,459,455,460,459,458,460,461,459,462,461,460,463,461,462,463,464,461,465,464,463,466,464,465,466,467,464,468,467,466,468,469,467,470,469,468,470,471,469,472,471,470,473,471,472,473,474,471,475,474,473,475,476,474,477,476,475,478,476,477,479,476,478,480,476,479,481,476,480,482,476,481,483,484,482,484,476,482,485,484,483,486,484,485,487,484,486,488,484,487,489,484,488,490,484,489,491,484,490,492,484,491,493,484,492,494,484,493,495,484,494,496,484,495,497,484,496,498,484,497,499,484,498,500,484,499,501,484,500,502,484,501,503,484,502,503,504,484,505,476,484,503,506,504,503,507,506,503,508,507,503,509,508,510,509,503,510,511,509,510,512,511,510,513,512,510,514,513,510,515,514,516,515,510,516,517,515,516,518,517,516,519,518,516,520,519,521,520,516,521,522,520,521,523,522,521,524,523,525,524,521,525,526,524,525,527,526,525,528,527,529,528,525,529,530,528,529,531,530,532,531,529,532,533,531,532,534,533,532,535,534,536,535,532,536,537,535,536,538,537,536,539,538,540,539,536,540,541,539,540,542,541,543,542,540,543,544,542,543,545,544,546,545,543,546,547,545,546,548,547,549,548,546,549,550,548,505,551,476,549,552,550,505,553,551,554,553,505,555,552,549,555,556,552,554,557,553,558,557,554,555,559,556,558,560,557,561,560,558,562,559,555,562,563,559,564,560,561,564,565,560,562,566,563,567,565,564,567,568,565,569,566,562,569,570,566,571,568,567,571,572,568,569,573,570,574,572,571,569,575,573,576,575,569,574,577,572,576,578,575,579,577,574,576,580,578,579,581,577,582,581,579,576,583,580,584,583,576,584,585,583,582,586,581,587,586,582,584,588,585,584,589,588,587,590,586,591,590,587,592,589,584,592,593,589,594,590,591,594,595,590,592,596,593,597,595,594,597,598,595,599,598,597,592,600,596,599,601,598,602,601,599,603,600,592,603,604,600,602,605,601,606,605,602,603,607,604,606,608,605,609,608,606,609,610,608,611,610,609,603,612,607,613,610,611,613,614,610,603,615,612,616,614,613,616,617,614,603,618,615,619,617,616,620,621,622,619,623,617,603,624,618,625,623,619,626,621,620,603,627,624,628,623,625,628,629,623,629,621,626,603,630,627,630,629,628,630,631,629,631,621,629,603,631,630,632,631,603,632,633,631,634,621,631,635,633,632,635,636,633,637,621,634,635,638,636,639,621,637,640,638,635,640,641,638,642,621,639,643,641,640,643,644,641,645,621,642,643,646,644,647,646,643,648,621,645,647,649,646,650,649,647,651,621,648,650,652,649,653,621,651,650,654,652,655,654,650,655,656,654,657,621,653,655,658,656,659,621,657,660,658,655,660,661,658,662,621,659,660,663,661,664,621,662,665,663,660,665,666,663,667,621,664,665,668,666,669,668,665,670,621,667,669,671,668,672,621,670,673,671,669,673,674,671,673,675,674,676,621,672,677,675,673,677,678,675,679,621,676,680,678,677,680,681,678,682,621,679,682,683,621,684,681,680,684,685,681,686,683,682,684,687,685,688,687,684,686,689,683,688,690,687,691,689,686,692,690,688,691,693,689,692,694,690,695,696,697,695,698,696,698,699,700,698,701,699,695,701,698,702,701,695,702,703,701,704,705,706,707,705,704,708,707,709,710,707,708,710,705,707,710,711,705,712,711,710,713,712,710,714,711,712,713,715,712,716,717,718,716,719,717,720,719,716,720,721,719,722,721,720,722,723,721,724,723,722,724,725,723,726,725,724,727,728,725,726,727,725,729,727,726,730,729,726,731,728,727,730,732,729,733,728,731,730,734,732,735,728,733,730,736,734,737,728,735,737,738,728,730,739,736,740,738,737,741,739,730,741,742,739,743,738,740,741,744,742,745,738,743,745,746,738,741,747,744,748,746,745,749,747,741,749,750,747,751,746,748,751,752,746,749,753,750,754,752,751,755,753,749,755,756,753,757,752,754,757,758,752,755,759,756,760,758,757,761,759,755,760,762,758,759,762,760,761,762,759,763,762,761,763,764,762,765,764,763,766,767,764,765,766,764,768,767,766,768,769,767,768,770,769,771,770,768,771,772,770,773,772,771,773,774,772,775,774,773,775,776,774,777,776,775,777,778,776,779,778,777,779,780,778,781,782,783,784,780,779,781,785,782,784,786,780,781,787,785,788,786,784,788,789,786,781,790,787,791,789,788,781,792,790,791,793,789,781,794,792,795,793,791,781,796,794,781,797,796,798,793,795,781,799,797,800,799,781,800,801,799,798,802,793,803,802,798,800,804,801,800,803,804,800,802,803,805,802,800,805,806,802,807,806,805,807,808,806,809,808,807,809,810,808,811,810,809,811,812,810,813,812,811,813,814,812,815,814,813,815,816,814,817,816,815,817,818,816,819,818,817,819,820,818,821,820,819,821,822,820,823,822,821,823,824,822,823,825,824,826,825,823,827,828,829,830,828,827,831,832,833,834,832,831,834,835,832,836,835,834,836,837,835,838,837,836,838,839,837,840,839,838,840,841,839,842,841,840,842,843,841,844,843,842,844,845,843,846,845,844,846,847,845,848,847,846,848,849,847,848,850,849,851,850,848,851,852,850,853,852,851,853,854,852,828,854,853,828,855,854,856,855,828,857,856,828,858,857,828,859,858,828,860,859,828,861,860,828,862,861,828,863,862,828,864,863,828,865,864,828,866,865,828,867,866,828,830,867,828,868,869,855,856,868,855,870,869,868,871,869,870,872,869,871,872,873,869,874,873,872,875,873,874,876,873,875,877,873,876,877,878,873,879,878,877,880,878,879,880,881,878,882,881,880,883,881,882,883,884,881,885,884,883,885,886,884,887,886,885,888,886,887,888,889,886,830,890,867,891,889,888,891,892,889,893,892,891,894,892,893,894,895,892,896,895,894,897,895,896,897,898,895,899,898,897,900,898,899,901,898,900,901,902,898,903,902,901,904,902,903,905,902,904,905,906,902,907,906,905,907,908,906,909,908,907,910,908,909,910,911,908,912,911,910,912,913,911,914,913,912,915,913,914,915,916,913,917,916,915,917,918,916,919,918,917,830,920,890,830,921,920,922,918,919,922,923,918,830,924,921,925,923,922,830,926,924,830,927,926,928,923,925,928,929,923,830,930,927,830,931,930,932,929,928,830,933,931,934,929,932,830,935,933,934,936,929,830,937,935,938,936,934,830,939,937,830,940,939,941,942,940,830,941,940,943,936,938,941,944,942,943,945,936,946,945,943,941,947,944,948,945,946,941,949,947,950,945,948,941,951,949,941,952,951,953,945,950,953,954,945,941,955,952,956,954,953,941,957,955,958,954,956,941,959,957,941,960,959,961,954,958,941,962,960,963,954,961,941,963,962,941,954,963,941,964,954,965,964,941,830,966,941,965,967,964,968,967,965,968,969,967,970,969,968,970,971,969,972,971,970,972,973,971,974,973,972,974,975,973,974,976,975,977,976,974,977,978,976,979,978,977,979,980,978,981,980,979,981,982,980,983,982,981,983,984,982,985,984,983,985,986,984,987,986,985,988,989,990,991,992,993,994,992,991,994,995,992,994,996,995,997,996,994,997,998,996,999,998,997,999,1000,998,1001,1000,999,1001,1002,1000,1003,1002,1001,1003,1004,1002,1003,1005,1004,1006,1005,1003,1006,1007,1005,1008,1007,1006,1008,1009,1007,1010,1011,1012,1013,1011,1010,1014,1009,1008,1014,1015,1009,1014,1016,1015,1017,1016,1014,1017,1018,1016,1019,1018,1017,1019,1020,1018,1019,1021,1020,1022,1021,1019,1022,1023,1021,1022,1024,1023,1025,1024,1022,1025,1026,1024,1025,1027,1026,1028,1027,1025,1028,1029,1027,1028,1030,1029,1031,1030,1028,1031,1032,1030,1031,1033,1032,1031,1013,1033,1034,1011,1013,1035,1034,1013,1036,1035,1013,1037,1036,1013,1038,1037,1013,1039,1038,1013,1040,1039,1013,1041,1040,1013,1042,1041,1013,1043,1042,1013,1044,1043,1013,1045,1044,1013,1046,1045,1013,1047,1046,1013,1048,1047,1013,1049,1048,1013,1050,1049,1013,1051,1050,1013,1052,1051,1013,1053,1052,1013,1054,1053,1013,1055,1054,1013,1056,1055,1013,1057,1056,1013,1031,1057,1013,1058,1057,1031,1059,1058,1031,1060,1059,1031,1060,1061,1059,1060,1062,1061,1060,1063,1062,1060,1064,1063,1065,1064,1060,1065,1066,1064,1065,1067,1066,1065,1068,1067,1065,1069,1068,1070,1069,1065,1070,1071,1069,1070,1072,1071,1070,1073,1072,1070,1074,1073,1075,1074,1070,1075,1076,1074,1075,1077,1076,1078,1077,1075,1078,1079,1077,1078,1080,1079,1081,1080,1078,1081,1082,1080,1081,1083,1082,1084,1083,1081,1084,1085,1083,1084,1086,1085,1087,1086,1084,1087,1088,1086,1087,1089,1088,1090,1011,1034,1091,1089,1087,1091,1092,1089,1093,1092,1091,1093,1094,1092,1095,1096,1097,1095,1098,1096,1099,1098,1095,1099,1100,1098,1101,1100,1099,1101,1102,1100,1103,1102,1101,1103,1104,1102,1105,1104,1103,1105,1106,1104,1107,1106,1105,1107,1108,1106,1109,1108,1107,1109,1110,1108,1111,1110,1109,1111,1112,1110,1113,1112,1111,1114,1112,1113,1114,1115,1112,1116,1115,1114,1116,1117,1115,1118,1117,1116,1118,1119,1117,1120,1119,1118,1121,1119,1120,1122,1123,1119,1124,1122,1119,1125,1124,1119,1126,1125,1119,1127,1126,1119,1128,1127,1119,1129,1128,1119,1130,1129,1119,1131,1130,1119,1132,1131,1119,1133,1132,1119,1134,1133,1119,1135,1134,1119,1136,1135,1119,1137,1136,1119,1138,1137,1119,1139,1138,1119,1140,1139,1119,1141,1140,1119,1142,1141,1119,1143,1142,1119,1144,1143,1119,1145,1144,1119,1121,1145,1119,1146,1145,1121,1147,1146,1121,1148,1147,1121,1148,1149,1147,1148,1150,1149,1148,1151,1150,1148,1152,1151,1148,1153,1152,1154,1153,1148,1154,1155,1153,1154,1156,1155,1154,1157,1156,1154,1158,1157,1154,1159,1158,1160,1159,1154,1160,1161,1159,1160,1162,1161,1160,1163,1162,1164,1163,1160,1164,1165,1163,1166,1165,1164,1166,1167,1165,1166,1168,1167,1169,1168,1166,1169,1170,1168,1169,1171,1170,1172,1171,1169,1172,1173,1171,1174,1173,1172,1174,1175,1173,1176,1175,1174,1176,1177,1175,1176,1178,1177,1179,1178,1176,1179,1180,1178,1181,1180,1179,1181,1182,1180,1181,1183,1182,1181,1184,1183,1181,1185,1184,1181,1186,1185,1181,1187,1186,1188,1189,1187,1181,1188,1187,1188,1190,1189,1188,1191,1190,1188,1192,1191,1188,1193,1192,1188,1194,1193,1188,1195,1194,1188,1196,1195,1188,1197,1196,1188,1198,1197,1188,1199,1198,1188,1200,1199,1188,1201,1200,1188,1202,1201,1188,1203,1202,1188,1204,1203,1188,1205,1204,1188,1206,1205,1188,1207,1206,1188,1208,1207,1209,1208,1188,1181,1210,1188,1211,1208,1209,1212,1208,1211,1213,1208,1212,1214,1208,1213,1214,1215,1208,1216,1215,1214,1217,1215,1216,1218,1215,1217,1219,1215,1218,1220,1215,1219,1220,1221,1215,1222,1221,1220,1223,1221,1222,1224,1221,1223,1225,1221,1224,1225,1226,1221,1227,1226,1225,1228,1226,1227,1229,1226,1228,1229,1230,1226,1231,1230,1229,1232,1230,1231,1233,1230,1232,1233,1234,1230,1235,1234,1233,1236,1234,1235,1236,1237,1234,1238,1237,1236,1239,1237,1238,1240,1237,1239,1240,1241,1237,1242,1241,1240,1243,1241,1242,1244,1241,1243,1244,1245,1241,1246,1245,1244,1247,1245,1246,1247,1248,1245,1249,1248,1247,1250,1248,1249,1250,1251,1248,1252,1251,1250,1253,1251,1252,1253,1254,1251,1255,1254,1253,1256,1210,1181,1257,1254,1255,1258,1210,1256,1258,1259,1210,1257,1260,1254,1261,1260,1257,1262,1259,1258,1262,1263,1259,1264,1260,1261,1265,1263,1262,1265,1266,1263,1264,1267,1260,1268,1267,1264,1265,1269,1266,1270,1269,1265,1271,1267,1268,1270,1272,1269,1273,1272,1270,1271,1274,1267,1275,1274,1271,1273,1276,1272,1277,1276,1273,1278,1274,1275,1277,1279,1276,1280,1274,1278,1280,1281,1274,1282,1279,1277,1283,1281,1280,1282,1284,1279,1285,1281,1283,1286,1284,1282,1286,1287,1284,1288,1281,1285,1288,1289,1281,1290,1289,1288,1291,1287,1286,1291,1292,1287,1293,1289,1290,1294,1289,1293,1295,1292,1291,1295,1296,1292,1294,1297,1289,1298,1297,1294,1295,1299,1296,1300,1299,1295,1301,1297,1298,1300,1302,1299,1303,1302,1300,1303,1304,1302,1305,1297,1301,1306,1304,1303,1306,1307,1304,1305,1308,1297,1309,1308,1305,1310,1307,1306,1310,1311,1307,1312,1308,1309,1313,1311,1310,1313,1314,1311,1315,1314,1313,1315,1316,1314,1317,1308,1312,1315,1318,1316,1319,1318,1315,1320,1308,1317,1319,1321,1318,1322,1321,1319,1323,1308,1320,1322,1324,1321,1325,1326,1327,1328,1324,1322,1329,1308,1323,1328,1330,1324,1325,1331,1326,1332,1308,1329,1328,1333,1330,1334,1333,1328,1325,1334,1331,1335,1308,1332,1334,1335,1333,1336,1335,1334,1325,1336,1334,1336,1308,1335,1336,1337,1308,1338,1337,1336,1325,1339,1336,1338,1340,1337,1341,1340,1338,1325,1342,1339,1343,1340,1341,1325,1344,1342,1343,1345,1340,1346,1345,1343,1325,1347,1344,1346,1348,1345,1349,1348,1346,1325,1350,1347,1351,1348,1349,1351,1352,1348,1325,1353,1350,1354,1352,1351,1354,1355,1352,1325,1356,1353,1357,1355,1354,1325,1358,1356,1359,1355,1357,1359,1360,1355,1361,1360,1359,1325,1362,1358,1363,1360,1361,1325,1364,1362,1363,1365,1360,1366,1365,1363,1325,1367,1364,1368,1365,1366,1325,1369,1367,1368,1370,1365,1371,1370,1368,1325,1372,1369,1373,1370,1371,1373,1374,1370,1325,1375,1372,1376,1374,1373,1325,1377,1375,1376,1378,1374,1379,1378,1376,1380,1378,1379,1325,1381,1377,1380,1382,1378,1383,1382,1380,1325,1384,1381,1383,1385,1382,1386,1385,1383,1325,1387,1384,1388,1387,1325,1386,1389,1385,1390,1389,1386,1388,1391,1387,1392,1389,1390,1392,1393,1389,1394,1391,1388,1395,1393,1392,1394,1396,1391,1395,1397,1393,1398,1396,1394,1399,1397,1395,1400,1401,1402,1403,1401,1400,1404,1403,1405,1406,1403,1404,1406,1401,1403,1406,1407,1401,1408,1407,1406,1409,1410,1411,1412,1413,1410,1414,1415,1413,1416,1417,1415,1418,1419,1417,1420,1421,1419,1422,1423,1421,1424,1425,1423,1426,1411,1425,1427,1428,1429,1430,1431,1428,1432,1433,1431,1434,1435,1433,1436,1437,1435,1438,1439,1437,1440,1441,1439,1442,1443,1441,1444,1445,1443,1446,1447,1445,1448,1449,1447,1450,1451,1449,1452,1453,1451,1454,1455,1453,1456,1457,1455,1458,1459,1457,1460,1461,1459,1462,1463,1461,1464,1465,1463,1466,1467,1465,1468,1469,1467,1470,1471,1469,1472,1473,1471,1474,1475,1473,1476,1477,1475,1478,1479,1477,1480,1481,1479,1482,1483,1481,1484,1485,1483,1486,1487,1485,1488,1489,1487,1490,1491,1489,1492,1493,1491,1494,1495,1493,1496,1497,1495,1498,1499,1497,1500,1501,1499,1502,1503,1501,1504,1505,1503,1506,1507,1505,1508,1509,1507,1510,1511,1509,1512,1513,1511,1514,1515,1513,1516,1517,1515,1518,1519,1517,1520,1521,1519,1522,1523,1521,1524,1525,1523,1526,1527,1525,1528,1529,1527,1530,1531,1529,1532,1533,1531,1534,1535,1533,1536,1537,1535,1538,1539,1537,1540,1541,1539,1542,1543,1541,1544,1545,1543,1546,1547,1545,1548,1549,1547,1550,1551,1549,1552,1553,1551,1554,1555,1553,1556,1557,1555,1558,1559,1557,1560,1561,1559,1562,1563,1561,1564,1565,1563,1566,1567,1565,1568,1569,1567,1570,1571,1569,1572,1573,1571,1574,1575,1573,1576,1577,1575,1578,1579,1577,1580,1581,1579,1582,1583,1581,1584,1585,1583,1586,1587,1585,1588,1589,1587,1590,1591,1589,1592,1593,1591,1594,1595,1593,1596,1597,1595,1598,1599,1597,1600,1601,1599,1602,1603,1601,1604,1605,1603,1606,1607,1605,1608,1609,1607,1610,1611,1609,1612,1613,1611,1614,1615,1613,1616,1617,1615,1618,1619,1617,1620,1621,1619,1622,1623,1621,1624,1625,1623,1626,1627,1625,1628,1629,1627,1630,1631,1629,1632,1633,1631,1634,1635,1633,1636,1637,1635,1638,1639,1637,1640,1641,1639,1642,1643,1641,1644,1645,1643,1646,1647,1645,1648,1649,1647,1650,1651,1649,1652,1653,1651,1654,1655,1653,1656,1657,1655,1658,1659,1657,1660,1661,1659,1662,1663,1661,1664,1665,1663,1666,1667,1665,1668,1669,1667,1670,1671,1669,1672,1673,1671,1674,1675,1673,1676,1677,1675,1678,1679,1677,1680,1681,1679,1682,1683,1681,1684,1685,1683,1686,1687,1685,1688,1689,1687,1690,1691,1689,1692,1693,1691,1694,1695,1693,1696,1697,1695,1698,1699,1697,1700,1701,1699,1702,1703,1701,1704,1705,1703,1706,1707,1705,1708,1709,1707,1710,1711,1709,1712,1713,1711,1714,1715,1713,1716,1717,1715,1718,1719,1717,1720,1721,1719,1722,1723,1721,1724,1725,1723,1726,1727,1725,1728,1729,1727,1730,1731,1729,1732,1733,1731,1734,1735,1733,1736,1737,1735,1738,1739,1737,1740,1741,1739,1742,1743,1741,1744,1745,1743,1746,1747,1745,1748,1749,1747,1750,1751,1749,1752,1753,1751,1754,1755,1753,1756,1757,1755,1758,1759,1757,1760,1761,1759,1762,1763,1761,1764,1765,1763,1766,1767,1765,1768,1769,1767,1770,1771,1769,1772,1773,1771,1774,1775,1773,1776,1777,1775,1778,1779,1777,1780,1781,1779,1782,1783,1781,1784,1785,1783,1786,1787,1785,1788,1789,1787,1790,1791,1789,1792,1793,1791,1794,1795,1793,1796,1797,1795,1798,1799,1797,1800,1801,1799,1802,1803,1801,1804,1805,1803,1806,1807,1805,1808,1809,1807,1810,1811,1809,1812,1813,1811,1814,1815,1813,1816,1817,1815,1818,1819,1817,1820,1821,1819,1822,1823,1821,1824,1825,1823,1826,1827,1825,1828,1829,1827,1830,1831,1829,1832,1833,1831,1834,1835,1833,1836,1837,1835,1838,1839,1837,1840,1841,1839,1842,1843,1841,1844,1845,1843,1846,1847,1845,1848,1849,1847,1850,1851,1849,1852,1853,1851,1854,1855,1853,1856,1857,1855,1858,1859,1857,1860,1861,1859,1862,1863,1861,1864,1865,1863,1866,1429,1865,1867,1868,1869,1870,1871,1868,1872,1873,1871,1874,1875,1873,1876,1877,1875,1878,1879,1877,1880,1881,1879,1882,1883,1881,1884,1885,1883,1886,1887,1885,1888,1889,1887,1890,1891,1889,1892,1893,1891,1894,1895,1893,1896,1897,1895,1898,1899,1897,1900,1901,1899,1902,1903,1901,1904,1905,1903,1906,1907,1905,1908,1909,1907,1910,1911,1909,1912,1913,1911,1914,1915,1913,1916,1917,1915,1918,1919,1917,1920,1921,1919,1922,1923,1921,1924,1925,1923,1926,1927,1925,1928,1929,1927,1930,1931,1929,1932,1933,1931,1934,1935,1933,1936,1937,1935,1938,1939,1937,1940,1941,1939,1942,1943,1941,1944,1945,1943,1946,1947,1945,1948,1949,1947,1950,1951,1949,1952,1953,1951,1954,1955,1953,1956,1957,1955,1958,1959,1957,1960,1961,1959,1962,1963,1961,1964,1965,1963,1966,1967,1965,1968,1969,1967,1970,1971,1969,1972,1973,1971,1974,1975,1973,1976,1977,1975,1978,1979,1977,1980,1981,1979,1982,1983,1981,1984,1985,1983,1986,1987,1985,1988,1989,1987,1990,1991,1989,1992,1993,1991,1994,1995,1993,1996,1997,1995,1998,1999,1997,2000,2001,1999,2002,2003,2001,2004,2005,2003,2006,2007,2005,2008,2009,2007,2010,2011,2009,2012,2013,2011,2014,2015,2013,2016,2017,2015,2018,2019,2017,2020,2021,2019,2022,2023,2021,2024,2025,2023,2026,2027,2025,2028,2029,2027,2030,2031,2029,2032,2033,2031,2034,2035,2033,2036,1869,2035,2037,2038,2039,2040,2041,2038,2042,2043,2041,2044,2045,2043,2046,2047,2045,2048,2049,2047,2050,2051,2049,2052,2053,2051,2054,2055,2053,2056,2057,2055,2058,2059,2057,2060,2061,2059,2062,2063,2061,2064,2065,2063,2066,2067,2065,2068,2069,2067,2070,2071,2069,2072,2073,2071,2074,2075,2073,2076,2077,2075,2078,2079,2077,2080,2081,2079,2082,2083,2081,2084,2085,2083,2086,2087,2085,2088,2089,2087,2090,2091,2089,2092,2093,2091,2094,2095,2093,2096,2097,2095,2098,2099,2097,2100,2101,2099,2102,2103,2101,2104,2105,2103,2106,2107,2105,2108,2109,2107,2110,2111,2109,2112,2113,2111,2114,2115,2113,2116,2117,2115,2118,2119,2117,2120,2121,2119,2122,2123,2121,2124,2125,2123,2126,2127,2125,2128,2129,2127,2130,2131,2129,2132,2133,2131,2134,2135,2133,2136,2137,2135,2138,2139,2137,2140,2141,2139,2142,2143,2141,2144,2145,2143,2146,2147,2145,2148,2149,2147,2150,2151,2149,2152,2153,2151,2154,2155,2153,2156,2157,2155,2158,2159,2157,2160,2161,2159,2162,2163,2161,2164,2165,2163,2166,2167,2165,2168,2169,2167,2170,2171,2169,2172,2173,2171,2174,2175,2173,2176,2177,2175,2178,2179,2177,2180,2181,2179,2182,2183,2181,2184,2185,2183,2186,2187,2185,2188,2189,2187,2190,2191,2189,2192,2193,2191,2194,2195,2193,2196,2197,2195,2198,2199,2197,2200,2201,2199,2202,2203,2201,2204,2205,2203,2206,2207,2205,2208,2209,2207,2210,2211,2209,2212,2213,2211,2214,2215,2213,2216,2217,2215,2218,2219,2217,2220,2221,2219,2222,2223,2221,2224,2225,2223,2226,2227,2225,2228,2229,2227,2230,2231,2229,2232,2233,2231,2234,2235,2233,2236,2237,2235,2238,2239,2237,2240,2241,2239,2242,2243,2241,2244,2039,2243,2245,2246,2247,2248,2249,2246,2250,2251,2249,2252,2253,2251,2254,2255,2253,2256,2257,2255,2258,2259,2257,2260,2261,2259,2262,2263,2261,2264,2265,2263,2266,2267,2265,2268,2269,2267,2270,2271,2269,2272,2273,2271,2274,2275,2273,2276,2277,2275,2278,2279,2277,2280,2281,2279,2282,2283,2281,2284,2285,2283,2286,2287,2285,2288,2289,2287,2290,2291,2289,2292,2293,2291,2294,2295,2293,2296,2297,2295,2298,2299,2297,2300,2301,2299,2302,2303,2301,2304,2305,2303,2306,2307,2305,2308,2309,2307,2310,2311,2309,2312,2313,2311,2314,2315,2313,2316,2317,2315,2318,2319,2317,2320,2321,2319,2322,2323,2321,2324,2325,2323,2326,2327,2325,2328,2329,2327,2330,2331,2329,2332,2333,2331,2334,2335,2333,2336,2337,2335,2338,2339,2337,2340,2341,2339,2342,2343,2341,2344,2345,2343,2346,2347,2345,2348,2349,2347,2350,2351,2349,2352,2353,2351,2354,2355,2353,2356,2357,2355,2358,2359,2357,2360,2361,2359,2362,2363,2361,2364,2365,2363,2366,2367,2365,2368,2369,2367,2370,2371,2369,2372,2373,2371,2374,2375,2373,2376,2377,2375,2378,2379,2377,2380,2381,2379,2382,2383,2381,2384,2385,2383,2386,2387,2385,2388,2389,2387,2390,2391,2389,2392,2393,2391,2394,2395,2393,2396,2397,2395,2398,2399,2397,2400,2401,2399,2402,2403,2401,2404,2405,2403,2406,2407,2405,2408,2409,2407,2410,2411,2409,2412,2413,2411,2414,2247,2413,2415,2416,2417,2418,2419,2416,2420,2421,2419,2422,2423,2421,2424,2425,2423,2426,2427,2425,2428,2429,2427,2430,2431,2429,2432,2433,2431,2434,2435,2433,2436,2437,2435,2438,2439,2437,2440,2441,2439,2442,2443,2441,2444,2445,2443,2446,2447,2445,2448,2449,2447,2450,2451,2449,2452,2453,2451,2454,2455,2453,2456,2457,2455,2458,2459,2457,2460,2461,2459,2462,2463,2461,2464,2465,2463,2466,2467,2465,2468,2469,2467,2470,2471,2469,2472,2473,2471,2474,2475,2473,2476,2477,2475,2478,2479,2477,2480,2481,2479,2482,2483,2481,2484,2485,2483,2486,2487,2485,2488,2489,2487,2490,2491,2489,2492,2493,2491,2494,2495,2493,2496,2497,2495,2498,2499,2497,2500,2501,2499,2502,2503,2501,2504,2505,2503,2506,2507,2505,2508,2509,2507,2510,2511,2509,2512,2513,2511,2514,2515,2513,2516,2517,2515,2518,2519,2517,2520,2521,2519,2522,2523,2521,2524,2525,2523,2526,2527,2525,2528,2529,2527,2530,2531,2529,2532,2533,2531,2534,2535,2533,2536,2537,2535,2538,2539,2537,2540,2541,2539,2542,2543,2541,2544,2545,2543,2546,2547,2545,2548,2549,2547,2550,2551,2549,2552,2553,2551,2554,2555,2553,2556,2557,2555,2558,2559,2557,2560,2561,2559,2562,2563,2561,2564,2565,2563,2566,2567,2565,2568,2417,2567,2569,2570,2571,2572,2573,2570,2574,2575,2573,2576,2577,2575,2578,2579,2577,2580,2581,2579,2582,2583,2581,2584,2585,2583,2586,2587,2585,2588,2589,2587,2590,2591,2589,2592,2593,2591,2594,2595,2593,2596,2597,2595,2598,2599,2597,2600,2601,2599,2602,2603,2601,2604,2605,2603,2606,2607,2605,2608,2609,2607,2610,2611,2609,2612,2613,2611,2614,2615,2613,2616,2617,2615,2618,2571,2617,2619,2620,2621,2622,2623,2620,2624,2625,2623,2626,2627,2625,2628,2629,2627,2630,2631,2629,2632,2633,2631,2634,2635,2633,2636,2637,2635,2638,2639,2637,2640,2641,2639,2642,2643,2641,2644,2645,2643,2646,2647,2645,2648,2649,2647,2650,2651,2649,2652,2653,2651,2654,2655,2653,2656,2657,2655,2658,2659,2657,2660,2661,2659,2662,2663,2661,2664,2665,2663,2666,2667,2665,2668,2669,2667,2670,2671,2669,2672,2673,2671,2674,2675,2673,2676,2677,2675,2678,2679,2677,2680,2681,2679,2682,2683,2681,2684,2685,2683,2686,2687,2685,2688,2689,2687,2690,2691,2689,2692,2693,2691,2694,2695,2693,2696,2697,2695,2698,2699,2697,2700,2701,2699,2702,2703,2701,2704,2705,2703,2706,2707,2705,2708,2709,2707,2710,2711,2709,2712,2713,2711,2714,2715,2713,2716,2717,2715,2718,2719,2717,2720,2721,2719,2722,2723,2721,2724,2725,2723,2726,2727,2725,2728,2729,2727,2730,2731,2729,2732,2733,2731,2734,2735,2733,2736,2737,2735,2738,2739,2737,2740,2741,2739,2742,2743,2741,2744,2745,2743,2746,2747,2745,2748,2749,2747,2750,2751,2749,2752,2753,2751,2754,2755,2753,2756,2757,2755,2758,2759,2757,2760,2761,2759,2762,2763,2761,2764,2765,2763,2766,2767,2765,2768,2769,2767,2770,2771,2769,2772,2773,2771,2774,2775,2773,2776,2777,2775,2778,2779,2777,2780,2781,2779,2782,2783,2781,2784,2785,2783,2786,2787,2785,2788,2789,2787,2790,2621,2789,2791,2792,2793,2794,2795,2792,2796,2797,2795,2798,2799,2797,2800,2801,2799,2802,2803,2801,2804,2805,2803,2806,2807,2805,2808,2809,2807,2810,2811,2809,2812,2813,2811,2814,2793,2813,1426,1409,1411,1409,1412,1410,1412,1414,1413,1414,1416,1415,1416,1418,1417,1418,1420,1419,1420,1422,1421,1422,1424,1423,1424,1426,1425,1866,1427,1429,1427,1430,1428,1430,1432,1431,1432,1434,1433,1434,1436,1435,1436,1438,1437,1438,1440,1439,1440,1442,1441,1442,1444,1443,1444,1446,1445,1446,1448,1447,1448,1450,1449,1450,1452,1451,1452,1454,1453,1454,1456,1455,1456,1458,1457,1458,1460,1459,1460,1462,1461,1462,1464,1463,1464,1466,1465,1466,1468,1467,1468,1470,1469,1470,1472,1471,1472,1474,1473,1474,1476,1475,1476,1478,1477,1478,1480,1479,1480,1482,1481,1482,1484,1483,1484,1486,1485,1486,1488,1487,1488,1490,1489,1490,1492,1491,1492,1494,1493,1494,1496,1495,1496,1498,1497,1498,1500,1499,1500,1502,1501,1502,1504,1503,1504,1506,1505,1506,1508,1507,1508,1510,1509,1510,1512,1511,1512,1514,1513,1514,1516,1515,1516,1518,1517,1518,1520,1519,1520,1522,1521,1522,1524,1523,1524,1526,1525,1526,1528,1527,1528,1530,1529,1530,1532,1531,1532,1534,1533,1534,1536,1535,1536,1538,1537,1538,1540,1539,1540,1542,1541,1542,1544,1543,1544,1546,1545,1546,1548,1547,1548,1550,1549,1550,1552,1551,1552,1554,1553,1554,1556,1555,1556,1558,1557,1558,1560,1559,1560,1562,1561,1562,1564,1563,1564,1566,1565,1566,1568,1567,1568,1570,1569,1570,1572,1571,1572,1574,1573,1574,1576,1575,1576,1578,1577,1578,1580,1579,1580,1582,1581,1582,1584,1583,1584,1586,1585,1586,1588,1587,1588,1590,1589,1590,1592,1591,1592,1594,1593,1594,1596,1595,1596,1598,1597,1598,1600,1599,1600,1602,1601,1602,1604,1603,1604,1606,1605,1606,1608,1607,1608,1610,1609,1610,1612,1611,1612,1614,1613,1614,1616,1615,1616,1618,1617,1618,1620,1619,1620,1622,1621,1622,1624,1623,1624,1626,1625,1626,1628,1627,1628,1630,1629,1630,1632,1631,1632,1634,1633,1634,1636,1635,1636,1638,1637,1638,1640,1639,1640,1642,1641,1642,1644,1643,1644,1646,1645,1646,1648,1647,1648,1650,1649,1650,1652,1651,1652,1654,1653,1654,1656,1655,1656,1658,1657,1658,1660,1659,1660,1662,1661,1662,1664,1663,1664,1666,1665,1666,1668,1667,1668,1670,1669,1670,1672,1671,1672,1674,1673,1674,1676,1675,1676,1678,1677,1678,1680,1679,1680,1682,1681,1682,1684,1683,1684,1686,1685,1686,1688,1687,1688,1690,1689,1690,1692,1691,1692,1694,1693,1694,1696,1695,1696,1698,1697,1698,1700,1699,1700,1702,1701,1702,1704,1703,1704,1706,1705,1706,1708,1707,1708,1710,1709,1710,1712,1711,1712,1714,1713,1714,1716,1715,1716,1718,1717,1718,1720,1719,1720,1722,1721,1722,1724,1723,1724,1726,1725,1726,1728,1727,1728,1730,1729,1730,1732,1731,1732,1734,1733,1734,1736,1735,1736,1738,1737,1738,1740,1739,1740,1742,1741,1742,1744,1743,1744,1746,1745,1746,1748,1747,1748,1750,1749,1750,1752,1751,1752,1754,1753,1754,1756,1755,1756,1758,1757,1758,1760,1759,1760,1762,1761,1762,1764,1763,1764,1766,1765,1766,1768,1767,1768,1770,1769,1770,1772,1771,1772,1774,1773,1774,1776,1775,1776,1778,1777,1778,1780,1779,1780,1782,1781,1782,1784,1783,1784,1786,1785,1786,1788,1787,1788,1790,1789,1790,1792,1791,1792,1794,1793,1794,1796,1795,1796,1798,1797,1798,1800,1799,1800,1802,1801,1802,1804,1803,1804,1806,1805,1806,1808,1807,1808,1810,1809,1810,1812,1811,1812,1814,1813,1814,1816,1815,1816,1818,1817,1818,1820,1819,1820,1822,1821,1822,1824,1823,1824,1826,1825,1826,1828,1827,1828,1830,1829,1830,1832,1831,1832,1834,1833,1834,1836,1835,1836,1838,1837,1838,1840,1839,1840,1842,1841,1842,1844,1843,1844,1846,1845,1846,1848,1847,1848,1850,1849,1850,1852,1851,1852,1854,1853,1854,1856,1855,1856,1858,1857,1858,1860,1859,1860,1862,1861,1862,1864,1863,1864,1866,1865,2036,1867,1869,1867,1870,1868,1870,1872,1871,1872,1874,1873,1874,1876,1875,1876,1878,1877,1878,1880,1879,1880,1882,1881,1882,1884,1883,1884,1886,1885,1886,1888,1887,1888,1890,1889,1890,1892,1891,1892,1894,1893,1894,1896,1895,1896,1898,1897,1898,1900,1899,1900,1902,1901,1902,1904,1903,1904,1906,1905,1906,1908,1907,1908,1910,1909,1910,1912,1911,1912,1914,1913,1914,1916,1915,1916,1918,1917,1918,1920,1919,1920,1922,1921,1922,1924,1923,1924,1926,1925,1926,1928,1927,1928,1930,1929,1930,1932,1931,1932,1934,1933,1934,1936,1935,1936,1938,1937,1938,1940,1939,1940,1942,1941,1942,1944,1943,1944,1946,1945,1946,1948,1947,1948,1950,1949,1950,1952,1951,1952,1954,1953,1954,1956,1955,1956,1958,1957,1958,1960,1959,1960,1962,1961,1962,1964,1963,1964,1966,1965,1966,1968,1967,1968,1970,1969,1970,1972,1971,1972,1974,1973,1974,1976,1975,1976,1978,1977,1978,1980,1979,1980,1982,1981,1982,1984,1983,1984,1986,1985,1986,1988,1987,1988,1990,1989,1990,1992,1991,1992,1994,1993,1994,1996,1995,1996,1998,1997,1998,2000,1999,2000,2002,2001,2002,2004,2003,2004,2006,2005,2006,2008,2007,2008,2010,2009,2010,2012,2011,2012,2014,2013,2014,2016,2015,2016,2018,2017,2018,2020,2019,2020,2022,2021,2022,2024,2023,2024,2026,2025,2026,2028,2027,2028,2030,2029,2030,2032,2031,2032,2034,2033,2034,2036,2035,2244,2037,2039,2037,2040,2038,2040,2042,2041,2042,2044,2043,2044,2046,2045,2046,2048,2047,2048,2050,2049,2050,2052,2051,2052,2054,2053,2054,2056,2055,2056,2058,2057,2058,2060,2059,2060,2062,2061,2062,2064,2063,2064,2066,2065,2066,2068,2067,2068,2070,2069,2070,2072,2071,2072,2074,2073,2074,2076,2075,2076,2078,2077,2078,2080,2079,2080,2082,2081,2082,2084,2083,2084,2086,2085,2086,2088,2087,2088,2090,2089,2090,2092,2091,2092,2094,2093,2094,2096,2095,2096,2098,2097,2098,2100,2099,2100,2102,2101,2102,2104,2103,2104,2106,2105,2106,2108,2107,2108,2110,2109,2110,2112,2111,2112,2114,2113,2114,2116,2115,2116,2118,2117,2118,2120,2119,2120,2122,2121,2122,2124,2123,2124,2126,2125,2126,2128,2127,2128,2130,2129,2130,2132,2131,2132,2134,2133,2134,2136,2135,2136,2138,2137,2138,2140,2139,2140,2142,2141,2142,2144,2143,2144,2146,2145,2146,2148,2147,2148,2150,2149,2150,2152,2151,2152,2154,2153,2154,2156,2155,2156,2158,2157,2158,2160,2159,2160,2162,2161,2162,2164,2163,2164,2166,2165,2166,2168,2167,2168,2170,2169,2170,2172,2171,2172,2174,2173,2174,2176,2175,2176,2178,2177,2178,2180,2179,2180,2182,2181,2182,2184,2183,2184,2186,2185,2186,2188,2187,2188,2190,2189,2190,2192,2191,2192,2194,2193,2194,2196,2195,2196,2198,2197,2198,2200,2199,2200,2202,2201,2202,2204,2203,2204,2206,2205,2206,2208,2207,2208,2210,2209,2210,2212,2211,2212,2214,2213,2214,2216,2215,2216,2218,2217,2218,2220,2219,2220,2222,2221,2222,2224,2223,2224,2226,2225,2226,2228,2227,2228,2230,2229,2230,2232,2231,2232,2234,2233,2234,2236,2235,2236,2238,2237,2238,2240,2239,2240,2242,2241,2242,2244,2243,2414,2245,2247,2245,2248,2246,2248,2250,2249,2250,2252,2251,2252,2254,2253,2254,2256,2255,2256,2258,2257,2258,2260,2259,2260,2262,2261,2262,2264,2263,2264,2266,2265,2266,2268,2267,2268,2270,2269,2270,2272,2271,2272,2274,2273,2274,2276,2275,2276,2278,2277,2278,2280,2279,2280,2282,2281,2282,2284,2283,2284,2286,2285,2286,2288,2287,2288,2290,2289,2290,2292,2291,2292,2294,2293,2294,2296,2295,2296,2298,2297,2298,2300,2299,2300,2302,2301,2302,2304,2303,2304,2306,2305,2306,2308,2307,2308,2310,2309,2310,2312,2311,2312,2314,2313,2314,2316,2315,2316,2318,2317,2318,2320,2319,2320,2322,2321,2322,2324,2323,2324,2326,2325,2326,2328,2327,2328,2330,2329,2330,2332,2331,2332,2334,2333,2334,2336,2335,2336,2338,2337,2338,2340,2339,2340,2342,2341,2342,2344,2343,2344,2346,2345,2346,2348,2347,2348,2350,2349,2350,2352,2351,2352,2354,2353,2354,2356,2355,2356,2358,2357,2358,2360,2359,2360,2362,2361,2362,2364,2363,2364,2366,2365,2366,2368,2367,2368,2370,2369,2370,2372,2371,2372,2374,2373,2374,2376,2375,2376,2378,2377,2378,2380,2379,2380,2382,2381,2382,2384,2383,2384,2386,2385,2386,2388,2387,2388,2390,2389,2390,2392,2391,2392,2394,2393,2394,2396,2395,2396,2398,2397,2398,2400,2399,2400,2402,2401,2402,2404,2403,2404,2406,2405,2406,2408,2407,2408,2410,2409,2410,2412,2411,2412,2414,2413,2568,2415,2417,2415,2418,2416,2418,2420,2419,2420,2422,2421,2422,2424,2423,2424,2426,2425,2426,2428,2427,2428,2430,2429,2430,2432,2431,2432,2434,2433,2434,2436,2435,2436,2438,2437,2438,2440,2439,2440,2442,2441,2442,2444,2443,2444,2446,2445,2446,2448,2447,2448,2450,2449,2450,2452,2451,2452,2454,2453,2454,2456,2455,2456,2458,2457,2458,2460,2459,2460,2462,2461,2462,2464,2463,2464,2466,2465,2466,2468,2467,2468,2470,2469,2470,2472,2471,2472,2474,2473,2474,2476,2475,2476,2478,2477,2478,2480,2479,2480,2482,2481,2482,2484,2483,2484,2486,2485,2486,2488,2487,2488,2490,2489,2490,2492,2491,2492,2494,2493,2494,2496,2495,2496,2498,2497,2498,2500,2499,2500,2502,2501,2502,2504,2503,2504,2506,2505,2506,2508,2507,2508,2510,2509,2510,2512,2511,2512,2514,2513,2514,2516,2515,2516,2518,2517,2518,2520,2519,2520,2522,2521,2522,2524,2523,2524,2526,2525,2526,2528,2527,2528,2530,2529,2530,2532,2531,2532,2534,2533,2534,2536,2535,2536,2538,2537,2538,2540,2539,2540,2542,2541,2542,2544,2543,2544,2546,2545,2546,2548,2547,2548,2550,2549,2550,2552,2551,2552,2554,2553,2554,2556,2555,2556,2558,2557,2558,2560,2559,2560,2562,2561,2562,2564,2563,2564,2566,2565,2566,2568,2567,2618,2569,2571,2569,2572,2570,2572,2574,2573,2574,2576,2575,2576,2578,2577,2578,2580,2579,2580,2582,2581,2582,2584,2583,2584,2586,2585,2586,2588,2587,2588,2590,2589,2590,2592,2591,2592,2594,2593,2594,2596,2595,2596,2598,2597,2598,2600,2599,2600,2602,2601,2602,2604,2603,2604,2606,2605,2606,2608,2607,2608,2610,2609,2610,2612,2611,2612,2614,2613,2614,2616,2615,2616,2618,2617,2790,2619,2621,2619,2622,2620,2622,2624,2623,2624,2626,2625,2626,2628,2627,2628,2630,2629,2630,2632,2631,2632,2634,2633,2634,2636,2635,2636,2638,2637,2638,2640,2639,2640,2642,2641,2642,2644,2643,2644,2646,2645,2646,2648,2647,2648,2650,2649,2650,2652,2651,2652,2654,2653,2654,2656,2655,2656,2658,2657,2658,2660,2659,2660,2662,2661,2662,2664,2663,2664,2666,2665,2666,2668,2667,2668,2670,2669,2670,2672,2671,2672,2674,2673,2674,2676,2675,2676,2678,2677,2678,2680,2679,2680,2682,2681,2682,2684,2683,2684,2686,2685,2686,2688,2687,2688,2690,2689,2690,2692,2691,2692,2694,2693,2694,2696,2695,2696,2698,2697,2698,2700,2699,2700,2702,2701,2702,2704,2703,2704,2706,2705,2706,2708,2707,2708,2710,2709,2710,2712,2711,2712,2714,2713,2714,2716,2715,2716,2718,2717,2718,2720,2719,2720,2722,2721,2722,2724,2723,2724,2726,2725,2726,2728,2727,2728,2730,2729,2730,2732,2731,2732,2734,2733,2734,2736,2735,2736,2738,2737,2738,2740,2739,2740,2742,2741,2742,2744,2743,2744,2746,2745,2746,2748,2747,2748,2750,2749,2750,2752,2751,2752,2754,2753,2754,2756,2755,2756,2758,2757,2758,2760,2759,2760,2762,2761,2762,2764,2763,2764,2766,2765,2766,2768,2767,2768,2770,2769,2770,2772,2771,2772,2774,2773,2774,2776,2775,2776,2778,2777,2778,2780,2779,2780,2782,2781,2782,2784,2783,2784,2786,2785,2786,2788,2787,2788,2790,2789,2814,2791,2793,2791,2794,2792,2794,2796,2795,2796,2798,2797,2798,2800,2799,2800,2802,2801,2802,2804,2803,2804,2806,2805,2806,2808,2807,2808,2810,2809,2810,2812,2811,2812,2814,2813]});
});
ym.modules.define('EXT_disjoint_timer_query.logo.vert',[],function (provide) {
provide("attribute vec3 vertexPosition;\nattribute vec3 vertexColor;\n\nvarying vec3 color;\n\nuniform mat4 mvp;\n\nvoid main(void) {\n    gl_Position = mvp * vec4(vertexPosition, 1);\n    color = vertexColor;\n}\n");
});
ym.modules.define('GpuCpuTimeBar', [
    'MedianFilter',
    'util.defineClass'
], function (provide, MedianFilter, defineClass) {
    function GpuCpuTimeBar (canvas, scale, order) {
        this._scale = scale;
        this._order = order;
        this._scaledTime = {gpu: 0, cpu: 0};
        this._filter = {
            gpu: new MedianFilter({windowSize: 25}),
            cpu: new MedianFilter({windowSize: 25})
        };
        this._w = canvas.width;
        this._h = canvas.height;
        this._ctx = canvas.getContext('2d');
    }

    var GPU_TIME = GpuCpuTimeBar.GPU_TIME = 'gpu',
        CPU_TIME = GpuCpuTimeBar.CPU_TIME = 'cpu',
        GPU_CPU_ORDER = GpuCpuTimeBar.GPU_CPU_ORDER = [GPU_TIME, CPU_TIME],
        CPU_GPU_ORDER = GpuCpuTimeBar.CPU_GPU_ORDER = [CPU_TIME, GPU_TIME],

        COLORS = {gpu: 'blue', cpu: 'green'};

    provide(defineClass(GpuCpuTimeBar, {
        setTime: function (time, kind) {
            this._scaledTime[kind] =
                this._h * this._filter[kind].filter(time) / this._scale;
        },

        draw: function (gpuTime, cpuTime) {
            var order = this._order;
            this._ctx.clearRect(0, 0, this._w, this._h);
            this._drawBar(order[0]);
            this._drawBar(order[1]);
        },

        _drawBar: function (kind) {
            var ctx = this._ctx,
                scaledTime = this._scaledTime[kind];

            ctx.fillStyle = COLORS[kind];
            ctx.fillRect(
                0, this._h - scaledTime,
                this._w, scaledTime
            );
        }
    }));
});

ym.modules.define('many_instances.instancing.frag',[],function (provide) {
provide("#ifdef GL_FRAGMENT_PRECISION_HIGH\n    precision highp float;\n#else\n    precision mediump float;\n#endif\n\nvarying vec3 color;\n\nvoid main(void) {\n    gl_FragColor = vec4(color, 1);\n}\n");
});
ym.modules.define('many_instances.instancing.vert',[],function (provide) {
provide("attribute vec3 vertexPosition;\nattribute vec3 instancePosition;\nattribute vec3 instanceColor;\n\nuniform mat4 perspective;\nuniform mat4 rotationScale;\n\nvarying vec3 color;\n\nvoid main(void) {\n    vec4 position = rotationScale * vec4(vertexPosition, 1);\n    position.xyz += instancePosition;\n    gl_Position = perspective * position;\n    color = instanceColor;\n}\n");
});
ym.modules.define('many_instances.naive.frag',[],function (provide) {
provide("#ifdef GL_FRAGMENT_PRECISION_HIGH\n    precision highp float;\n#else\n    precision mediump float;\n#endif\n\nuniform vec3 color;\n\nvoid main(void) {\n    gl_FragColor = vec4(color, 1);\n}\n");
});
ym.modules.define('many_instances.naive.vert',[],function (provide) {
provide("attribute vec3 vertexPosition;\n\nuniform mat4 mvp;\n\nvoid main(void) {\n    gl_Position = mvp * vec4(vertexPosition, 1);\n}\n");
});
ym.modules.define('MedianFilter', [
    'debounce',
    'util.defineClass'
], function (provide, debounce, defineClass) {
    var DEFAULT_WINDOW_SIZE = 3,
        DEFAULT_BUFFER_WIPE_TIMEOUT = 300; // ms

    function numericLess(a, b) {
        return a - b;
    }

    /**
     * @ignore
     * @class
     * @name MedianFilter
     * @param {Object} [options]
     * @param {Number} [options.windowSize = 3]
     * @param {Number} [options.bufferWipeTimeout = 300]
     */
    function MedianFilter (options) {
        options = options || {};
        this._wipeBufferDebounced = debounce(
            options.bufferWipeTimeout || DEFAULT_BUFFER_WIPE_TIMEOUT,
            this._wipeBuffer
        );
        this._windowSize = options.windowSize || DEFAULT_WINDOW_SIZE;
        this._buffer = [];
    }

    provide(defineClass(
        MedianFilter,
        /** @lends MedianFilter.prototype */
        {
            /**
             * @param {Number} value
             * @returns {Number}
             */
            filter: function (value) {
                var buffer = this._buffer,
                    windowSize = this._windowSize;
                buffer.shift();
                while (buffer.length < windowSize) {
                    buffer.push(value);
                }
                this._wipeBufferDebounced();
                return buffer.slice().sort(numericLess)[0.5 * windowSize | 0];
            },

            _wipeBuffer: function () {
                this._buffer.length = 0;
            }
        }
    ));
});

/**
 * @fileOverview
 * Wrapper around WebGL shader program objects.
 */
ym.modules.define('Program', [
    'Uniform',
    'util.defineClass'
], function (provide, Uniform, defineClass) {
    /**
     * Создает шейдер данного типа из исходного кода.
     *
     * @ignore
     * @function
     * @static
     * @name createShader
     * @param {WebGLRenderingContext} gl
     * @param {GLenum} type
     * @param {String} source
     * @returns {WebGLShader}
     */
    function createShader(gl, type, source) {
        var shader = gl.createShader(type);

        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (ym.env.debug) {
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                throw new Error('Shader failed to compile. Log:\n' +
                    gl.getShaderInfoLog(shader));
            }
        }

        return shader;
    }

    /**
     * @ignore
     * @class Helper class for working with shader programs.
     * @name Program
     * @param {WebGLRenderingContext} gl WebGL context for which shader
     *      will be created.
     * @param {String} vertexShaderCode
     * @param {String} fragmentShaderCode
     */
    function Program (gl, vertexShaderCode, fragmentShaderCode) {
        this._gl = gl;

        var handler = this._glHandler = gl.createProgram(),
            vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderCode),
            fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderCode);

        gl.attachShader(handler, vertexShader);
        gl.attachShader(handler, fragmentShader);

        gl.linkProgram(handler);

        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);

        if (ym.env.debug) {
            if (!this.isLinked()) {
                throw new Error('Failed to link program. Log:\n' +
                    gl.getProgramInfoLog(handler));
            }
        }
    }

    provide(defineClass(
        Program,
        /** @lends Program.prototype */
        {
            /**
             * @returns {Boolean} `true' if program was successfully linked and `false'
             *      otherwise.
             */
            isLinked: function () {
                var gl = this._gl;
                return gl.getProgramParameter(this._glHandler, gl.LINK_STATUS);
            },

            /**
             * @returns {Boolean} `true' if program was successfully validated and `false'
             *      otherwise.
             */
            isValid: function () {
                var gl = this._gl;
                return gl.getProgramParameter(this._glHandler, gl.VALIDATE_STATUS);
            },

            /**
             * Use program in the context.
             */
            use: function () {
                var gl = this._gl,
                    handler = this._glHandler;

                if (ym.env.debug) {
                    gl.validateProgram(handler);
                    if (!this.isValid()) {
                        throw new Error('Program is invalid. Log:\n' +
                            gl.getProgramInfoLog(handler));
                    }
                }

                gl.useProgram(handler);
            },

            /**
             * @returns {Boolean} `true' if program is currently in use and `false'
             *      otherwise.
             */
            isBeingUsed: function () {
                var gl = this._gl;
                return gl.getParameter(gl.CURRENT_PROGRAM) == this._glHandler;
            },

            /**
             * Get uniform parameter handler.
             *
             * @param {String} name Parameter name.
             * @returns {Uniform} Parameter location.
             */
            getUniform: function (name) {
                var gl = this._gl,
                    handler = this._glHandler;
                return new Uniform(gl, gl.getUniformLocation(handler, name), handler);
            },

            /**
             * Get vertex attribute location.
             *
             * @param {String} name Attribute name.
             * @returns {GLint} Attribute location.
             */
            getAttributeIdx: function (name) {
                return this._gl.getAttribLocation(this._glHandler, name);
            },

            destroy: function () {
                this._gl.deleteProgram(this._glHandler);
            }
        }
    ));
});

/**
 * @fileOverview
 * 3D transforms helpers: matrix generators, multiplication, etc.
 * All function return matrices in the column-major order, i.e. in this format:
 *
 *  [
 *      m11, m21, m31, m41,
 *      m12, m22, m32, m42,
 *      m13, m23, m33, m43,
 *      m14, m24, m34, m44
 *  ],
 *
 * where mij - matrix element in the i-th row and j-th column.
 */
ym.modules.define('transform', [], function (provide) {
    provide({
        /**
         * Rotation about X-axis.
         *
         * @ignore
         * @function
         * @static
         * @name transform.rotateX
         * @param {Number} angle Angle of rotation.
         * @returns {Number[]} Rotation matrix in the column-major order.
         */
        rotateX: function (angle) {
            var angleSin = Math.sin(angle);
            var angleCos = Math.cos(angle);

            return [
                1,       0,          0, 0,
                0, angleCos, -angleSin, 0,
                0, angleSin,  angleCos, 0,
                0,       0,          0, 1
            ];
        },

        /**
         * Rotation about Y-axis.
         *
         * @ignore
         * @function
         * @static
         * @name trasnform.rotateY
         * @param {Number} angle Angle of rotation.
         * @returns {Number[]} Rotation matrix in the column-major order.
         */
        rotateY: function (angle) {
            var angleSin = Math.sin(angle);
            var angleCos = Math.cos(angle);

            return [
                angleCos, 0, -angleSin, 0,
                       0, 1,         0, 0,
                angleSin, 0,  angleCos, 0,
                       0, 0,         0, 1
            ];
        },

        /**
         * Translation by (x, y, z) vector.
         *
         * @ignore
         * @function
         * @static
         * @name panorama.math.tranform.translate
         * @param {Number} x x-component of translation vector.
         * @param {Number} y y-component of translation vector.
         * @param {Number} z z-component of translation vector.
         * @returns {Number[]} Translation matrix in the column-major order.
         */
        translate: function (x, y, z) {
            return [
                1, 0, 0, 0,
                0, 1, 0, 0,
                0, 0, 1, 0,
                x, y, z, 1
            ];
        },

        /**
         * Scaling by s factor.
         *
         * @ignore
         * @function
         * @static
         * @name transform.isotropicScale
         * @param {Number} s
         * @returns {Number[]} Scaling matrix in the column-major order.
         */
        isotropicScale: function (s) {
            return [
                s, 0, 0, 0,
                0, s, 0, 0,
                0, 0, s, 0,
                0, 0, 0, 1
            ];
        },

        /**
         * Scaling by (x, y, z) factors.
         *
         * @ignore
         * @function
         * @static
         * @name transform.anisotropicScale
         * @param {Number} x
         * @param {Number} y
         * @param {Number} z
         * @returns {Number[]} Scaling matrix in the column-major order.
         */
        anisotropicScale: function (x, y, z) {
            return [
                x, 0, 0, 0,
                0, y, 0, 0,
                0, 0, z, 0,
                0, 0, 0, 1
            ];
        },

        /**
         * Calculates perspective projection matrix.
         *
         * @ignore
         * @function
         * @static
         * @name trasnform.perspective
         * @param {Number} fov Vertical field-of-view angle.
         * @param {Number} aspectRatio Screen width to height ratio.
         * @param {Number} zNear Z-coordinate of near clipping plane.
         *      All geometry closer than near plane will be clipped off.
         * @param {Number} zFar Z-coordinate of far clipping plane.
         *      All geometry father than far plane will be clipped off.
         * @returns {Number[]} Projection matrix in the column-major order.
         *      Notice that after applying the matrix to a vector it
         *      should be normalized, i.e. all its components should be
         *      divided by `w` component.
         */
        perspective: function (fov, aspectRatio, zNear, zFar) {
            var f = 1 / Math.tan(0.5 * fov);

            var m11 = f / aspectRatio;
            var m33 = (zNear + zFar) / (zNear - zFar);
            var m34 = 2 * zNear * zFar / (zNear - zFar);

            return [
                m11,   0,   0,  0,
                  0,   f,   0,  0,
                  0,   0, m33, -1,
                  0,   0, m34,  0
            ];
        },

        /**
         * Multiply several matrices.
         *
         * @ignore
         * @function
         * @static
         * @name transform.multiplyMatrices
         * @param {...Number[]} matrix 4x4 matrix.
         * @returns {Number[]} Result of multiplication.
         */
        multiplyMatrices: function () {
            var result = arguments[arguments.length - 1].slice(),
                r1i, r2i, r3i, r4i,
                matrix;

            for (var m = arguments.length - 1; m--;) {
                matrix = arguments[m];

                for (var offset = 0; offset < 16; offset += 4) {
                    r1i = result[offset];
                    r2i = result[offset + 1];
                    r3i = result[offset + 2];
                    r4i = result[offset + 3];

                    for (var i = 0; i < 4; ++i) {
                        result[offset + i] = r1i * matrix[i] +
                            r2i * matrix[4 + i] +
                            r3i * matrix[8 + i] +
                            r4i * matrix[12 + i];
                    }
                }
            }

            return result;
        },

        /**
         * Transform vertices by matrix.
         *
         * @ignore
         * @function
         * @static
         * @name transform.applyToVertices
         * @param {Number[]} m 4x4 tranform matrix.
         * @param {Number[]} sourceVertices Plain array of 3D vertices transform
         *      matrix will be applied to.
         * @param {Number[]} destVertices Plain array where transformed vertices
         *      will be stored. Note, that it's guaranteed to perform properly when
         *      `destVertices` and `sourceVertices` are the very same array.
         * @param {Number[]} destVertices.
         */
        applyToVertices: function (m, sourceVertices, destVertices) {
            var sx, sy, sz, w;

            for (var i = 0, il = sourceVertices.length; i !== il; i += 3) {
                sx = sourceVertices[i];
                sy = sourceVertices[i + 1];
                sz = sourceVertices[i + 2];

                w = m[3] * sx + m[7] * sy + m[11] * sz + m[15];
                for (var j = 0; j < 3; ++j) {
                    destVertices[i + j] = (m[j] * sx + m[4 + j] * sy + m[8 + j]  * sz + m[12 + j]) / w;
                }
            }

            return destVertices;
        }
    });
});

/**
 * @fileOverview
 * Helper for working with shader uniform parameters.
 */
ym.modules.define('Uniform', [
    'util.defineClass'
], function (provide, defineClass) {
    /**
     * Constructs wrapper for a handler.
     *
     * @ignore
     * @class Uniform
     * @name Uniform
     * @param {WebGLRenreringContext} gl Shader program WebGL context.
     * @param {WebGLUniformLocation} handler Uniform parameter location.
     * @param {WebGLProgram} programHandler Program uniform belongs to.
     */
    function Uniform (gl, handler, programHandler) {
        if (ym.env.debug) {
            if (!handler) {
                throw new Error('Uniform location must be not-null');
            }
        }
        this._gl = gl;
        this._glHandler = handler;
        this._program = programHandler;
    }

    provide(defineClass(
        Uniform,
        /** @lends Uniform.prototype */
        {
            /**
             * @returns {*} Current uniform value.
             */
            getValue: function () {
                return this._gl.getUniform(this._program, this._glHandler);
            },

            /**
             * Set a 4 by 4 matrix as a value of the parameter.
             *
             * @param {Number} matrix The matrix.
             */
            setMatrix4: function (matrix) {
                this._gl.uniformMatrix4fv(this._glHandler, false, matrix);
            },

            /**
             * Set a texture unit to the parameter.
             *
             * @param {GLenum} unit The texture unit.
             */
            setTexture: function (unit) {
                this.setInt(unit - this._gl.TEXTURE0);
            },

            /**
             * Set integer value to the uniform.
             *
             * @param {Number} i Value.
             */
            setInt: function (i) {
                this._gl.uniform1i(this._glHandler, i);
            },

            setFloat: function (f) {
                this._gl.uniform1f(this._glHandler, f);
            },

            setFloat2Array: function (data) {
                this._gl.uniform2fv(this._glHandler, data);
            },

            setFloat3: function (v0, v1, v2) {
                this._gl.uniform3f(this._glHandler, v0, v1, v2);
            }
        }
    ));
});

ym.modules.define('EXT_disjoint_timer_query', [
    'Buffer',
    'GpuCpuTimeBar',
    'Program',
    'transform',

    'EXT_disjoint_timer_query.logo.json',
    'EXT_disjoint_timer_query.logo.vert',
    'EXT_disjoint_timer_query.logo.frag'
], function (provide, Buffer, GpuCpuTimeBar, Program, transform, logoGeometry, vsSrc, fsSrc) {
    var gl = document.querySelector('#gl').getContext('webgl'),
        glW = gl.drawingBufferWidth,
        glH = gl.drawingBufferHeight,
        glAspect = glW / glH,

        timerExt = gl.getExtension('EXT_disjoint_timer_query'),
        queries = [],
        timeBar = new GpuCpuTimeBar(
            document.querySelector('#timeBar'),
            200, // µs
            GpuCpuTimeBar.GPU_CPU_ORDER
        );

    if (!timerExt) {
        throw new Error('This demo relies upon EXT_disjoint_timer_query and can\'t run w/o it')
    }

    gl.clearColor(1, 1, 1, 1);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);

    gl.viewport(0, 0, glW, glH);

    var vertexBuffer = new Buffer(gl, gl.ARRAY_BUFFER),
        indexBuffer = new Buffer(gl, gl.ELEMENT_ARRAY_BUFFER),
        program = new Program(gl, vsSrc, fsSrc),
        vertexPositionAttr = program.getAttributeIdx('vertexPosition'),
        vertexColorAttr = program.getAttributeIdx('vertexColor'),
        mvpUniform = program.getUniform('mvp');

    vertexBuffer.setData(new Float32Array(logoGeometry.vbuffer), gl.STATIC_DRAW);
    indexBuffer.setData(new Uint16Array(logoGeometry.ibuffer), gl.STATIC_DRAW);

    var VERTEX_SIZE = 36,
        VERTEX_POSITION_OFFSET = 0,
        VERTEX_COLOR_OFFSET = 24;

    gl.enableVertexAttribArray(vertexPositionAttr);
    gl.vertexAttribPointer(
        vertexPositionAttr,
        3,
        gl.FLOAT,
        false,
        VERTEX_SIZE,
        VERTEX_POSITION_OFFSET
    );

    gl.enableVertexAttribArray(vertexColorAttr);
    gl.vertexAttribPointer(
        vertexColorAttr,
        3,
        gl.FLOAT,
        false,
        VERTEX_SIZE,
        VERTEX_COLOR_OFFSET
    );

    program.use();

    function render (t) {
        var query;

        if (!gl.getParameter(timerExt.GPU_DISJOINT_EXT)) {
            if (
                queries.length &&
                timerExt.getQueryObjectEXT(
                    queries[0],
                    timerExt.QUERY_RESULT_AVAILABLE_EXT
                )
            ) {
                query = queries.shift();
                timeBar.setTime(
                    timerExt.getQueryObjectEXT(
                        query,
                        timerExt.QUERY_RESULT_EXT
                    ) * 1e-3,
                    GpuCpuTimeBar.GPU_TIME
                );
                timerExt.deleteQueryEXT(query);
            }
        } else {
            while ((query = queries.shift())) {
                timerExt.deleteQueryEXT(query);
            }
        }

        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        mvpUniform.setMatrix4(transform.multiplyMatrices(
            transform.perspective(0.5 * Math.PI, glAspect, 0.1, 2),
            transform.translate(0, 0, -1),
            transform.rotateY(3e-3 * t),
            transform.isotropicScale(0.5)
        ));

        query = timerExt.createQueryEXT();
        timerExt.beginQueryEXT(timerExt.TIME_ELAPSED_EXT, query);
        var cpuTimeStart = performance.now();
        gl.drawElements(
            gl.TRIANGLES,
            logoGeometry.ibuffer.length,
            gl.UNSIGNED_SHORT,
            0
        );
        timeBar.setTime((performance.now() - cpuTimeStart) * 1e3, GpuCpuTimeBar.CPU_TIME);
        timerExt.endQueryEXT(timerExt.TIME_ELAPSED_EXT);

        queries.push(query);

        timeBar.draw();

        requestAnimationFrame(render);
    }

    requestAnimationFrame(render);

    provide();
});

ym.modules.define('many_instances.instancing', [
    'Buffer',
    'GpuCpuTimeBar',
    'Program',
    'transform',

    'many_instances.instancing.vert',
    'many_instances.instancing.frag'
], function (provide, Buffer, GpuCpuTimeBar, Program, transform, vsSrc, fsSrc) {
    var gl = document.querySelector('#gl').getContext('webgl'),
        glW = gl.drawingBufferWidth,
        glH = gl.drawingBufferHeight,

        glAspect = glW / glH,

        instancingExt = gl.getExtension('ANGLE_instanced_arrays'),
        timerExt = gl.getExtension('EXT_disjoint_timer_query'),
        queries = [],
        timeBar = new GpuCpuTimeBar(
            document.querySelector('#timeBar'),
            2000, // µs
            GpuCpuTimeBar.GPU_CPU_ORDER
        );

    if (!instancingExt) {
        throw new Error('This demo relies upon ANGLE_instanced_arrays and can\'t run w/o it')
    }

    if (!timerExt) {
        throw new Error('This demo relies upon EXT_disjoint_timer_query and can\'t run w/o it')
    }

    gl.clearColor(1, 1, 1, 1);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);

    gl.viewport(0, 0, glW, glH);

    var dataBuffer = new Buffer(gl, gl.ARRAY_BUFFER),
        program = new Program(gl, vsSrc, fsSrc),
        vertexPositionAttr = program.getAttributeIdx('vertexPosition'),
        instancePositionAttr = program.getAttributeIdx('instancePosition'),
        instanceColorAttr = program.getAttributeIdx('instanceColor'),
        perspectiveUniform = program.getUniform('perspective'),
        rotationScaleUniform = program.getUniform('rotationScale'),
        instancesNum = 64000,
        instances = new Array(6 * instancesNum);

    for (var x = 0, i = 0; x < 40; ++x) {
        for (var y = 0; y < 40; ++y) {
            for (var z = 0; z < 40; ++z, i += 6) {
                instances[i]     = -10 + 0.5 * x;
                instances[i + 1] = -10 + 0.5 * y;
                instances[i + 2] = -10 + 0.5 * z;
                instances[i + 3] = Math.random();
                instances[i + 4] = Math.random();
                instances[i + 5] = Math.random();
            }
        }
    }

    dataBuffer.setData(new Float32Array([
        -1, -1, 0,
        -1,  1, 0,
         1, -1, 0,
         1, -1, 0,
         1,  1, 0,
        -1,  1, 0
    ].concat(instances)), gl.STATIC_DRAW);

    instances = null;

    var INSTANCE_SIZE = 24,
        INSTANCE_POSITION_OFFSET = 72,
        INSTANCE_COLOR_OFFSET = 84;

    gl.enableVertexAttribArray(instancePositionAttr);
    gl.vertexAttribPointer(
        instancePositionAttr,
        3,
        gl.FLOAT,
        false,
        INSTANCE_SIZE,
        INSTANCE_POSITION_OFFSET
    );
    instancingExt.vertexAttribDivisorANGLE(
        instancePositionAttr,
        1
    );

    gl.enableVertexAttribArray(instanceColorAttr);
    gl.vertexAttribPointer(
        instanceColorAttr,
        3,
        gl.FLOAT,
        false,
        INSTANCE_SIZE,
        INSTANCE_COLOR_OFFSET
    );
    instancingExt.vertexAttribDivisorANGLE(
        instanceColorAttr,
        1
    );

    gl.enableVertexAttribArray(vertexPositionAttr);
    gl.vertexAttribPointer(
        vertexPositionAttr,
        3,
        gl.FLOAT,
        false,
        0,
        0
    );

    program.use();

    perspectiveUniform.setMatrix4(
        transform.perspective(0.5 * Math.PI, glAspect, 0.1, 5)
    );

    var scaleMatrix = transform.isotropicScale(0.1);
    function render (t) {
        var query;

        if (!gl.getParameter(timerExt.GPU_DISJOINT_EXT)) {
            if (
                queries.length &&
                timerExt.getQueryObjectEXT(
                    queries[0],
                    timerExt.QUERY_RESULT_AVAILABLE_EXT
                )
            ) {
                query = queries.shift();
                timeBar.setTime(
                    timerExt.getQueryObjectEXT(
                        query,
                        timerExt.QUERY_RESULT_EXT
                    ) * 1e-3,
                    GpuCpuTimeBar.GPU_TIME
                );
                timerExt.deleteQueryEXT(query);
            }
        } else {
            while ((query = queries.shift())) {
                timerExt.deleteQueryEXT(query);
            }
        }

        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        var rotationMatrix = transform.rotateY(3e-3 * t);

        query = timerExt.createQueryEXT();
        timerExt.beginQueryEXT(timerExt.TIME_ELAPSED_EXT, query);
        var cpuTimeStart = performance.now();

        rotationScaleUniform.setMatrix4(transform.multiplyMatrices(
            transform.rotateY(3e-3 * t),
            scaleMatrix
        ));

        instancingExt.drawArraysInstancedANGLE(
            gl.TRIANGLES,
            0,
            6,
            instancesNum
        );

        timeBar.setTime((performance.now() - cpuTimeStart) * 1e3, GpuCpuTimeBar.CPU_TIME);
        timerExt.endQueryEXT(timerExt.TIME_ELAPSED_EXT);

        queries.push(query);

        timeBar.draw();

        requestAnimationFrame(render);
    }

    requestAnimationFrame(render);

    provide();
});

ym.modules.define('many_instances.naive', [
    'Buffer',
    'GpuCpuTimeBar',
    'Program',
    'transform',

    'many_instances.naive.vert',
    'many_instances.naive.frag'
], function (provide, Buffer, GpuCpuTimeBar, Program, transform, vsSrc, fsSrc) {
    var gl = document.querySelector('#gl').getContext('webgl'),
        glW = gl.drawingBufferWidth,
        glH = gl.drawingBufferHeight,

        glAspect = glW / glH,

        timerExt = gl.getExtension('EXT_disjoint_timer_query'),
        queries = [],
        timeBar = new GpuCpuTimeBar(
            document.querySelector('#timeBar'),
            2e5, // µs
            GpuCpuTimeBar.CPU_GPU_ORDER
        );

    if (!timerExt) {
        throw new Error('This demo relies upon EXT_disjoint_timer_query and can\'t run w/o it')
    }

    gl.clearColor(1, 1, 1, 1);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);

    gl.viewport(0, 0, glW, glH);

    var dataBuffer = new Buffer(gl, gl.ARRAY_BUFFER),
        program = new Program(gl, vsSrc, fsSrc),
        vertexPositionAttr = program.getAttributeIdx('vertexPosition'),
        mvpUniform = program.getUniform('mvp'),
        colorUniform = program.getUniform('color'),
        instancesNum = 64000,
        instances = new Array(6 * instancesNum);

    for (var x = 0, i = 0; x < 40; ++x) {
        for (var y = 0; y < 40; ++y) {
            for (var z = 0; z < 40; ++z, i += 6) {
                instances[i]     = -10 + 0.5 * x;
                instances[i + 1] = -10 + 0.5 * y;
                instances[i + 2] = -10 + 0.5 * z;
                instances[i + 3] = Math.random();
                instances[i + 4] = Math.random();
                instances[i + 5] = Math.random();
            }
        }
    }

    dataBuffer.setData(new Float32Array([
        -1, -1, 0,
        -1,  1, 0,
         1, -1, 0,
         1, -1, 0,
         1,  1, 0,
        -1,  1, 0
    ]), gl.STATIC_DRAW);

    gl.enableVertexAttribArray(vertexPositionAttr);
    gl.vertexAttribPointer(
        vertexPositionAttr,
        3,
        gl.FLOAT,
        false,
        0,
        0
    );

    program.use();

    var perspectiveMatrix = transform.perspective(0.5 * Math.PI, glAspect, 0.1, 5),
        scaleMatrix = transform.isotropicScale(0.1);

    function render (t) {
        var query;

        if (!gl.getParameter(timerExt.GPU_DISJOINT_EXT)) {
            if (
                queries.length &&
                timerExt.getQueryObjectEXT(
                    queries[0],
                    timerExt.QUERY_RESULT_AVAILABLE_EXT
                )
            ) {
                query = queries.shift();
                timeBar.setTime(
                    timerExt.getQueryObjectEXT(
                        query,
                        timerExt.QUERY_RESULT_EXT
                    ) * 1e-3,
                    GpuCpuTimeBar.GPU_TIME
                );
                timerExt.deleteQueryEXT(query);
            }
        } else {
            while ((query = queries.shift())) {
                timerExt.deleteQueryEXT(query);
            }
        }

        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        var rotationMatrix = transform.rotateY(3e-3 * t);

        query = timerExt.createQueryEXT();
        timerExt.beginQueryEXT(timerExt.TIME_ELAPSED_EXT, query);
        var cpuTimeStart = performance.now();

        for (var i = 0; i < instances.length; i += 6) {
            mvpUniform.setMatrix4(transform.multiplyMatrices(
                perspectiveMatrix,
                transform.translate(
                    instances[i],
                    instances[i + 1],
                    instances[i + 2]
                ),
                rotationMatrix,
                scaleMatrix
            ));
            colorUniform.setFloat3(
                instances[i + 3],
                instances[i + 4],
                instances[i + 5]
            );

            gl.drawArrays(gl.TRIANGLES, 0, 6);
        }

        timeBar.setTime((performance.now() - cpuTimeStart) * 1e3, GpuCpuTimeBar.CPU_TIME);
        timerExt.endQueryEXT(timerExt.TIME_ELAPSED_EXT);

        queries.push(query);

        timeBar.draw();

        requestAnimationFrame(render);
    }

    requestAnimationFrame(render);

    provide();
});

ym.modules.define('system.createNs', [], function (provide) {
    provide(function (parentNs, path, data) {
        if (path) {
            var subObj = parentNs;
            path = path.split('.');
            var i = 0, l = path.length - 1, name;
            for (; i < l; i++) {
                if (path[i]) {
                    subObj = subObj[name = path[i]] || (subObj[name] = {});
                }
            }
            subObj[path[l]] = data;
            return subObj[path[l]];
        } else {
            return data;
        }
    });
});
// TODO refactoring

ym.modules.define('system.mergeImports', [], function (provide) {
    function createNS (parentNs, path, data) {
        if (path) {
            var subObj = parentNs;
            path = path.split('.');
            var i = 0, l = path.length - 1, name;
            for (; i < l; i++) {
                if (path[i]) {//в начале может быть точка
                    subObj = subObj[name = path[i]] || (subObj[name] = {});
                }
            }
            subObj[path[l]] = data;
            return subObj[path[l]];
        } else {
            return data;
        }
    }


    function depsSort (a, b) {
        return a[2] - b[2];
    }

    function _isPackage (name) {
        return name.indexOf('package.') === 0;
    }

    function packageExtend (imports, ns) {
        for (var i in ns) {
            if (ns.hasOwnProperty(i)) {
                if (imports.hasOwnProperty(i)) {
                    //console.log('deep', i, typeof imports[i], typeof ns[i], ns[i] === imports[i]);
                    if (typeof imports[i] == 'object') {
                        packageExtend(imports[i], ns[i]);
                    }
                } else {
                    imports[i] = ns[i];
                }
            }
        }
    }

    function joinPackage (imports, deps, args) {
        var modules = [],
            checkList = {};
        for (var i = 0, l = deps.length; i < l; ++i) {
            var packageInfo = args[i].__package;
            if (!packageInfo) {
                createNS(imports, deps[i], args[i]);
                if (!checkList[deps[i]]) {
                    modules.push([deps[i], args[i]]);
                    checkList[deps[i]] = 1;
                }
            } else {
                for (var j = 0; j < packageInfo.length; ++j) {
                    if (!checkList[packageInfo[j][0]]) {
                        createNS(imports, packageInfo[j][0], packageInfo[j][1]);
                        modules.push([packageInfo[j][0], packageInfo[j][1]]);
                        checkList[packageInfo[j][0]] = 1;
                    }
                }
            }
        }
        imports.__package = modules;
        return imports;
    }

    function joinImports (thisName, imports, deps, args) {
        var ordered = [];
        var iAmPackage = _isPackage(thisName);
        if (iAmPackage) {
            return joinPackage(imports, deps, args);
        } else {
            for (var i = 0, l = deps.length; i < l; ++i) {
                ordered.push([deps[i], i, deps[i].length]);
            }
            ordered.sort(depsSort);
            for (var i = 0, l = ordered.length; i < l; ++i) {
                var order = ordered[i][1],
                    depName = deps[order];
                if (_isPackage(depName)) {
                    var packageInfo = args[order].__package;
                    for (var j = 0; j < packageInfo.length; ++j) {
                        createNS(imports, packageInfo[j][0], packageInfo[j][1]);
                    }
                    //console.error(thisName, 'loads', depName, '(its not good idea to load package from module)');
                    //depName = '';
                    //packageExtend(imports, args[order]);
                } else {
                    createNS(imports, depName, args[order]);
                }
            }
        }
        return imports;
    }

    provide({
        isPackage: _isPackage,
        joinImports: joinImports,
        createNS: createNS
    });
});
/**
 * @fileOverview
 * Парсер шаблонов.
 */
ym.modules.define("template.Parser", [
    "util.id"
], function (provide, utilId) {

    // TODO хорошо бы перенести в отдельный модуль. 
    // Главное не забыть в билдере подключить файл.
    // TODO util.string
    var trimRegExp = /^\s+|\s+$/g,
        nativeTrim = typeof String.prototype.trim == 'function';

    function trim (str) {
        return nativeTrim ? str.trim() : str.replace(trimRegExp, '');
    }

    function escape (str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/'/g, '&#39;')
            .replace(/"/g, '&quot;');
    }

    function getKeyValuePairs (str) {
        var pairs = [],
            parts = trim(str).replace(/\s*=\s*/g, '=').replace(/\s+/g, ' ').split(' ');

        for (var i = 0, l = parts.length; i < l; i++) {
            pairs.push(parts[i].split('=', 2));
        }

        return pairs;
    }

    function removeQuotes (string) {
        var firstSymbol = string.charAt(0);
        if (firstSymbol == "'" || firstSymbol == '"') {
            return string.slice(1, string.length - 1);
        }
        return string;
    }

    function parseExpression (expression) {
        var parenthesesRegExp = /'|"/g,
            l = 0,
            tokens = [],
            match;

        while (match = parenthesesRegExp.exec(expression)) {
            var pos = match.index;

            if (pos >= l) {
                var endPos = expression.indexOf(match[0], pos + 1);
                if (l != pos) {
                    parseExpressionSubstitutes(tokens, expression.slice(l, pos));
                }
                tokens.push(expression.slice(pos, endPos + 1));
                l = endPos + 1;
            }
        }

        if (l < expression.length) {
            parseExpressionSubstitutes(tokens, expression.slice(l));
        }

        return tokens.join('');
    }

    var DataLogger = function (dataManager) {
        this._dataManager = dataManager;
        this._renderedValues = {};
        this._contexts = {};
    };

    DataLogger.prototype.get = function (key) {
        if (this._renderedValues.hasOwnProperty(key)) {
            return this._renderedValues[key].value;
        }

        var dotIndex = key.indexOf('.'),
            keyPart = (dotIndex > -1) ? trim(key.substring(0, dotIndex)) : trim(key);
        if (this._contexts.hasOwnProperty(keyPart)) {
            key = key.replace(keyPart, this._contexts[keyPart]);
        }

        var value = this._dataManager.get(key);
        this.set(key, value);
        return value;
    };

    DataLogger.prototype.setContext = function (key1, key2) {
        this._contexts[key1] = key2;
    };

    DataLogger.prototype.set = function (key, value) {
        // http://jsperf.com/split-vs-indexof
        if (key.indexOf('.') > -1) {
            var parts = key.split('.'),
                currentKey = "";
            // Записываем все промежуточные значения. 
            for (var i = 0, l = parts.length - 1; i < l; i++) {
                currentKey += ((i === 0) ? "" : ".") + parts[i];
                this._renderedValues[currentKey] = { value: this._dataManager.get(currentKey) };
            }
        }
        this._renderedValues[key] = { value: value };
    };

    DataLogger.prototype.getRenderedValues = function () {
        return this._renderedValues;
    };

    var stopWords = {
        'true': true,
        'false': true,
        'undefined': true,
        'null': true,
        'typeof': true
    };

    function parseExpressionSubstitutes (tokens, expression) {
        var variablesRegExp = /(^|[^\w\$])([A-Za-z_\$][\w\$\.]*)(?:[^\w\d_\$]|$)/g,
            l = 0,
            match;

        while (match = variablesRegExp.exec(expression)) {
            var pos = match.index + match[1].length,
                key = match[2],
                endPos = pos + key.length;

            if (pos > l) {
                tokens.push(expression.slice(l, pos));
            }

            if (stopWords[key]) {
                tokens.push(key);
            } else {
                tokens.push('data.get("' + key + '")');
            }

            l = endPos;
        }

        if (l < expression.length) {
            tokens.push(expression.slice(l));
        }
    }

    function evaluateExpression (expression, data) {
        var result;
        eval('result = ' + expression);
        return result;
    }

    // Токен контента
    var CONTENT = 0,
        startTokenRegExp = new RegExp([
            '\\$\\[\\[', '\\$\\[(?!\\])', '\\[if',
            '\\[else\\]', '\\[endif\\]', '\\{\\{', '\\{%'].join('|'), 'g');

    /**
     * @ignore
     * @class Парсер шаблонов.
     */
    var Parser = function (filtersStorage) {
        this.filtersStorage = filtersStorage;
    };

    /**
     * @ignore
     * @class Парсер шаблонов.
     */

    Parser.prototype.scanners = {};
    Parser.prototype.builders = {};

    Parser.prototype.parse = function (text) {
        var tokens = [],
            pos = 0, startTokenPos, endTokenPos, contentPos,
            match;

        startTokenRegExp.lastIndex = 0;

        while (match = startTokenRegExp.exec(text)) {
            if (match.index >= pos) {
                startTokenPos = match.index;
                contentPos = startTokenPos + match[0].length;

                if (pos != startTokenPos) {
                    tokens.push(CONTENT, text.slice(pos, startTokenPos));
                }

                var scanner = this.scanners[match[0]];

                if (scanner.token) {
                    tokens.push(scanner.token, null);
                    pos = contentPos;
                } else {
                    endTokenPos = text.indexOf(scanner.stopToken, contentPos);
                    scanner.scan(tokens, text.slice(contentPos, endTokenPos));
                    pos = endTokenPos + scanner.stopToken.length;
                }
            }
        }

        if (pos < text.length) {
            tokens.push(CONTENT, text.slice(pos));
        }

        return tokens;
    };

    Parser.prototype.build = function (tree, data) {
        var result = {
            nodes: tree,
            left: 0,
            right: tree.length,
            empty: true,
            subnodes: [],
            sublayouts: [],
            strings: [],
            data: new DataLogger(data)
        };
        this._buildTree(result);
        result.renderedValues = result.data.getRenderedValues();
        return result;
    };

    Parser.prototype._buildTree = function (tree) {
        var nodes = tree.nodes,
            strings = tree.strings;
        while (tree.left < tree.right) {
            var node = nodes[tree.left];
            if (node == CONTENT) {
                strings.push(nodes[tree.left + 1]);
                tree.empty = false;
                tree.left += 2;
            } else {
                this.builders[node](tree, this);
            }
        }
    };

    // Токены старого синтаксиса
    var OLD_SUBSTITUTE = 1001,
        OLD_SUBLAYOUT = 1002,
        OLD_IF = 1003,
        OLD_ELSE = 1004,
        OLD_ENDIF = 1005;

    Parser.prototype.scanners['$[['] = {
        stopToken: ']]',
        scan: function (tokens, text) {
            var parts = text.match(/^(\S+)\s*(\S.*)?$/);
            tokens.push(OLD_SUBLAYOUT, [parts[1], parts[2] ? getKeyValuePairs(parts[2]) : []]);
        }
    };

    Parser.prototype.scanners['$['] = {
        stopToken: ']',
        scan: function (tokens, text) {
            var parts = text.split('|', 2);
            tokens.push(OLD_SUBSTITUTE, parts);
        }
    };

    Parser.prototype.scanners['[if'] = {
        stopToken: ']',
        scan: function (tokens, text) {
            var parts = text.match(/^(def)? (.+)$/),
                substitutes = parseExpression(parts[2]);

            tokens.push(OLD_IF, [parts[1], substitutes]);
        }
    };

    Parser.prototype.scanners['[else]'] = {
        token: OLD_ELSE
    };

    Parser.prototype.scanners['[endif]'] = {
        token: OLD_ENDIF
    };

    Parser.prototype.builders[OLD_SUBSTITUTE] = function (tree, parser) {
        var key = tree.nodes[tree.left + 1][0],
            value = tree.data.get(key);

        if (typeof value == 'undefined') {
            value = tree.nodes[tree.left + 1][1];
        }

        tree.strings.push(value);
        tree.left += 2;
        tree.empty = tree.empty && !value;
    };

    Parser.prototype.builders[OLD_SUBLAYOUT] = function (tree, parser) {
        var id = utilId.prefix() + utilId.gen(),
            key = tree.nodes[tree.left + 1][0];

        tree.strings.push('<ymaps id="' + id + '"></ymaps>');

        var sublayoutInfo = {
                id: id,
                key: key,
                value: tree.data.get(key) || key
            },
            monitorValues = [],
            splitDefault = [];

        var params = tree.nodes[tree.left + 1][1];

        for (var i = 0, l = params.length; i < l; i++) {
            var pair = params[i],
                k = pair[0],
                v = pair[1] || "true",
                end = v.length - 1,
                val;

            // если значение в кавычках, парсим как строку
            if (
                (v.charAt(0) == '"' && v.charAt(end) == '"') ||
                    (v.charAt(0) == '\'' && v.charAt(end) == '\'')
                ) {
                val = v.substring(1, end);

                // если цифра или true|false - как есть
            } else if (!isNaN(Number(v))) {
                val = v;

            } else if (v == "true") {
                val = true;

            } else if (v == "false") {
                val = false;

                // иначе - ищем в данных
            } else {
                splitDefault = v.split('|');
                val = tree.data.get(splitDefault[0], splitDefault[1]);
                monitorValues.push(splitDefault[0]);
            }

            sublayoutInfo[k] = val;
        }

        sublayoutInfo.monitorValues = monitorValues;

        tree.sublayouts.push(sublayoutInfo);
        tree.left += 2;
    };

    Parser.prototype.builders[OLD_IF] = function (tree, parser) {
        var nodes = tree.nodes,
            left = tree.left,
            ifdef = nodes[left + 1][0],
            expression = nodes[left + 1][1],
            result = evaluateExpression(expression, tree.data),
            isTrue = ifdef ? typeof result != "undefined" : !!result,
            l,
            i = tree.left + 2,
            r = tree.right,
            counter = 1,
            elsePosition,
            endIfPosition;

        while (i < r) {
            if (nodes[i] == OLD_IF) {
                counter++;
            } else if (nodes[i] == OLD_ELSE) {
                if (counter == 1) {
                    elsePosition = i;
                }
            } else if (nodes[i] == OLD_ENDIF) {
                if (!--counter) {
                    endIfPosition = i;
                }
            }
            if (endIfPosition) {
                break;
            }
            i += 2;
        }

        if (isTrue) {
            l = tree.left + 2;
            r = elsePosition ? elsePosition : endIfPosition;
        } else {
            l = elsePosition ? elsePosition + 2 : endIfPosition;
            r = endIfPosition;
        }

        if (l != r) {
            var oldRight = tree.right,
                oldEmpty = tree.empty;

            tree.left = l;
            tree.right = r;

            parser._buildTree(tree);

            tree.empty = tree.empty && oldEmpty;
            tree.right = oldRight;
        }

        tree.left = endIfPosition + 2;
    };

    // Токены нового синтаксиса
    var SUBSTITUTE = 2001,
        INCLUDE = 2002,
        IF = 2003,
        ELSE = 2004,
        ENDIF = 2005,
        FOR = 2006,
        ENDFOR = 2007,
        ELSEIF = 2008;

    Parser.prototype.scanners['{{'] = {
        stopToken: '}}',
        scan: function (tokens, text) {
            var parts = text.split('|'),
                filters = [];
            for (var i = 1, l = parts.length; i < l; i++) {
                var match = parts[i].split(':', 2),
                    filter = trim(match[0]),
                    filterValue = match[1];//null;

                if (match[1]) {
                    if (filter != 'default') {
                        filterValue = parseExpression(removeQuotes(match[1]));
                    } else {
                        filterValue = trim(match[1]);
                    }
                }
                filters.push([filter, filterValue]);
            }
            tokens.push(SUBSTITUTE, [trim(parts[0]), filters]);
        }
    };

    Parser.prototype.scanners['{%'] = {
        stopToken: '%}',
        scan: function (tokens, text) {
            var match = trim(text).match(/^([A-Za-z]+)(\s+\S.*)?$/),
                operator = match[1],
                expression = match[2] ? trim(match[2]) : null;

            switch (operator) {
                case 'if':
                    tokens.push(IF, parseExpression(expression));
                    break;
                case 'else':
                    tokens.push(ELSE, null);
                    break;
                case 'elseif':
                    tokens.push(ELSEIF, parseExpression(expression));
                    break;
                case 'endif':
                    tokens.push(ENDIF, null);
                    break;
                case 'include':
                    var conditions = getKeyValuePairs(expression);
                    tokens.push(INCLUDE, [removeQuotes(conditions[0][0]), conditions.slice(1)]);
                    break;
                case 'for':
                    tokens.push(FOR, expression);
                    break;
                case 'endfor':
                    tokens.push(ENDFOR, null);
                    break;
            }
        }
    };

    Parser.prototype.builders[SUBSTITUTE] = function (tree, parser) {
        // Для ключей вида object[0], object["test"][0] и т.д.
        var keyWithSquareBracketsRegExp = /\[\s*(\d+|\'[^\']+\'|\"[^\"]+\")\s*\]/g,
            treeValue = tree.nodes[tree.left + 1],
            key = treeValue[0],
            value,
            needEscape = true,
            filters = treeValue[1],
            i,
            l;

        if (!keyWithSquareBracketsRegExp.test(key)) {
            value = tree.data.get(key);
        } else {
            var path = key.match(keyWithSquareBracketsRegExp),
                residue = key.split(path[0]),
                query;

            l = path.length;
            key = residue[0];

            query = key + '.' + removeQuotes(trim(path[0].replace('[', '').replace(']', '')));
            residue = residue[1];

            if (l > 1) {
                for (i = 1; i < l; i++) {
                    var segment = path[i];

                    residue = residue.split(segment);

                    segment = trim(segment.replace('[', '').replace(']', ''));
                    segment = removeQuotes(segment);

                    if (residue[0].length) {
                        query += residue[0];
                    }
                    query += '.' + segment;
                    residue = residue[1];
                }
            } else {
                query += residue;
            }

            value = tree.data.get(query);
        }

        for (i = 0, l = filters.length; i < l; i++) {
            var filter = filters[i],
                filterHandler;

            if (parser.filtersStorage && (filterHandler = parser.filtersStorage.get(filter[0]))) {
                value = filterHandler(tree.data, value, filter[1]);
            } else if (filter[0] == 'raw') {
                needEscape = false;
            }
        }

        if (needEscape && typeof value == 'string') {
            value = escape(value);
        }

        tree.strings.push(value);
        tree.left += 2;
        tree.empty = tree.empty && !value;
    };

    Parser.prototype.builders[INCLUDE] = Parser.prototype.builders[OLD_SUBLAYOUT];

    Parser.prototype.builders[FOR] = function (tree, parser) {
        var nodes = tree.nodes,
            i = tree.left + 2,
            left,
            right = tree.right,
            counter = 1,
            endForPosition;

        // Определяем область действия for.
        while (i < right) {
            if (nodes[i] == FOR) {
                counter++;
            } else if (nodes[i] == ENDFOR) {
                if (!--counter) {
                    endForPosition = i;
                }
            }
            if (endForPosition) {
                break;
            }
            i += 2;
        }

        left = tree.left + 2;
        right = endForPosition;

        if (left != right) {
            var expressionParts = nodes[tree.left + 1].split(/\sin\s/),
                beforeIn = trim(expressionParts[0]),
                afterIn = trim(expressionParts[1]),
                list = tree.data.get(afterIn),
                params = beforeIn.split(','),
                paramsLength = params.length;

            // Создаем временное дерево для обработки блока. 
            var originRight = tree.right,
                originEmpty = tree.empty,
                originLogger = tree.data,
                tmpDataLogger = new DataLogger(originLogger);

            tree.data = tmpDataLogger;

            for (var property in list) {
                tree.left = left;
                tree.right = right;

                if (list.hasOwnProperty(property)) {
                    if (paramsLength == 1) {
                        tmpDataLogger.setContext(beforeIn, afterIn + "." + property);
                    } else {
                        tmpDataLogger.set(trim(params[0]), property);
                        tmpDataLogger.setContext(trim(params[1]), afterIn + "." + property);
                    }
                    parser._buildTree(tree);
                }
            }

            // Восстанавливаем состоянение оригинального блока с учетом данных временного дерева.
            tree.empty = tree.empty && originEmpty;
            tree.right = originRight;
            tree.data = originLogger;
        }

        tree.left = endForPosition + 2;
    };

    Parser.prototype.builders[IF] =
        Parser.prototype.builders[ELSEIF] = function (tree, parser) {
            var nodes = tree.nodes,
                left = tree.left,
                expression = nodes[left + 1],
                result = evaluateExpression(expression, tree.data),
                isTrue = !!result,
                l,
                i = tree.left + 2,
                r = tree.right,
                depth = 1,
                elsePosition,
                elseIfPosition,
                endIfPosition,
                node;

            while (i < r) {
                node = nodes[i];
                if (node == IF) {
                    depth++;
                } else if (node == ELSEIF) {
                    if (depth == 1 && !elseIfPosition) {
                        elseIfPosition = i;
                    }
                } else if (node == ELSE) {
                    if (depth == 1) {
                        elsePosition = i;
                    }
                } else if (node == ENDIF) {
                    if (!--depth) {
                        endIfPosition = i;
                    }
                }
                if (endIfPosition) {
                    break;
                }
                i += 2;
            }

            if (isTrue) {
                l = tree.left + 2;
                r = elseIfPosition || elsePosition || endIfPosition;
            } else {
                if (elseIfPosition) {
                    l = elseIfPosition;
                    r = endIfPosition + 1;
                } else {
                    l = elsePosition ? elsePosition + 2 : endIfPosition;
                    r = endIfPosition;
                }
            }

            if (l != r) {
                var oldRight = tree.right,
                    oldEmpty = tree.empty;

                tree.left = l;
                tree.right = r;

                parser._buildTree(tree);

                tree.empty = tree.empty && oldEmpty;
                tree.right = oldRight;
            }

            tree.left = endIfPosition + 2;
        };

    provide(Parser);
});

ym.modules.define('util.defineClass', ['util.extend'], function (provide, extend) {
    function augment (childClass, parentClass, override) {
        childClass.prototype = (Object.create || function (obj) {
            function F () {}

            F.prototype = obj;
            return new F();
        })(parentClass.prototype);

        childClass.prototype.constructor = childClass;
        childClass.superclass = parentClass.prototype;
        childClass.superclass.constructor = parentClass;

        if (override) {
            extend(childClass.prototype, override);
        }

        return childClass.prototype;
    }

    function createClass (childClass, parentClass, override) {
        var baseClassProvided = typeof parentClass == 'function';

        if (baseClassProvided) {
            augment(childClass, parentClass);
        }

        for (var i = baseClassProvided ? 2 : 1, l = arguments.length; i < l; i++) {
            extend(childClass.prototype, arguments[i]);
        }

        return childClass;
    }

    provide(createClass);
});
ym.modules.define("util.extend", [
    "util.objectKeys"
], function (provide, objectKeys) {
    /**
     * Функция, копирующая свойства из одного или нескольких
     * JavaScript-объектов в другой JavaScript-объект.
     * @param {Object} target Целевой JavaScript-объект. Будет модифицирован
     * в результате работы функции.
     * @param {Object} source JavaScript-объект - источник. Все его свойства
     * будут скопированы. Источников может быть несколько (функция может иметь
     * произвольное число параметров), данные копируются справа налево (последний
     * аргумент имеет наивысший приоритет при копировании).
     * @name util.extend
     * @function
     * @static
     *
     * @example
     * var options = ymaps.util.extend({
     *      prop1: 'a',
     *      prop2: 'b'
     * }, {
     *      prop2: 'c',
     *      prop3: 'd'
     * }, {
     *      prop3: 'e'
     * });
     * // Получим в итоге: {
     * //     prop1: 'a',
     * //     prop2: 'c',
     * //     prop3: 'e'
     * // }
     */

    function extend (target) {
        if (ym.env.debug) {
            if (!target) {
                throw new Error("util.extend: не передан параметр target");
            }
        }
        for (var i = 1, l = arguments.length; i < l; i++) {
            var arg = arguments[i];
            if (arg) {
                for (var prop in arg) {
                    if (arg.hasOwnProperty(prop)) {
                        target[prop] = arg[prop];
                    }
                }
            }
        }
        return target;
    }

    // этот вариант функции использует Object.keys для обхода обьектов
    function nativeExtend (target) {
        if (ym.env.debug) {
            if (!target) {
                throw new Error("util.extend: не передан параметр target");
            }
        }
        for (var i = 1, l = arguments.length; i < l; i++) {
            var arg = arguments[i];
            if (arg) {
                var keys = objectKeys(arg);
                for (var j = 0, k = keys.length; j < k; j++) {
                    target[keys[j]] = arg[keys[j]];
                }
            }
        }
        return target;
    }

    provide((typeof Object.keys == "function") ? nativeExtend : extend);
});
ym.modules.define("util.id", [], function (provide) {
    /**
     * @ignore
     * @name util.id
     */

    var id = new function () {
        /* Префикс, имеет три применения:
         * как префикс при генерации уникальных id, он призван давать уникальность при каждом запуске страницы
         * как имя свойства в котором хранятся id выданный объекту
         * как id для window
         */
        // http://jsperf.com/new-date-vs-date-now-vs-performance-now/6
        var prefix = ('id_' + (+(new Date())) + Math.round(Math.random() * 10000)).toString(),
            counterId = Math.round(Math.random() * 10000);

        function gen () {
            return (++counterId).toString();
        }

        /**
         * @ignore
         * Возвращает префикс, который используется как имя поля.
         * @return {String}
         */
        this.prefix = function () {
            return prefix;
        };

        /**
         * @ignore
         * Генерирует случайный ID. Возвращает результат в виде строки символов.
         * @returns {String} ID
         * @example
         * util.id.gen(); // -> '45654654654654'
         */
        this.gen = gen;

        /**
         * @ignore
         * Генерирует id и присваивает его свойству id переданного объекта. Если свойство id объекта существует,
         * то значение этого свойства не изменяется. Возвращает значение id в виде строки.
         * @param {Object} object Объект
         * @returns {String} ID
         */
        this.get = function (object) {
            return object === window ? prefix : object[prefix] || (object[prefix] = gen());
        };
    };

    provide(id);
});
ym.modules.define("util.jsonp", [
    "util.id",
    "util.querystring",
    "util.script"
], function (provide, utilId, querystring, utilScript) {
    var exceededError = { message: 'timeoutExceeded' },
        scriptError = { message: 'scriptError' },
        undefFunc = function () {};

    /**
     * @ignore
     * @function
     * @name util.jsonp Загружает скрипт по указанному url и подает ответ на вход функции-обработчика.
     * @param {Object} options Опции.
     * @param {String} options.url Адрес загрузки скрипта.
     * @param {String} [options.paramName = 'callback'] Название параметра для функции-обработчика.
     * @param {String} [options.padding] Имя функции-обработчика.
     * @param {Boolean} [options.noCache] Флаг, запрещающий кэширование скрипта. Добавляет случайное число
     * как параметр.
     * @param {Number} [options.timeout = 30000] Количество миллисекунд, в течение которых должен быть загружен скрипт.
     * Иначе удалять скрипт по истечении этого времени.
     * @param {Object} [options.requestParams] Параметры GET запроса.
     * @param {Boolean} [options.checkResponse = true] Флаг, определяющий нужно ли проверять ответ от сервера.
     * Если true, то при отсутствии поля error в ответе или равного null, promise будет зарезолвен
     * со значением res.response или res (если поле response отсутствует), где res - ответ сервера.
     * Иначе promise будет отклонен со значением res.error.
     * @param {String} [options.responseFieldName = 'response'] Имя поля ответа сервера, содержащее
     * данные.
     * @returns {vow.Promise} Объект-promise.
     */
    function jsonp (options) {
        if (jsonp.handler) {
            return jsonp.handler(options, makeRequest);
        }

        return makeRequest(options);
    }

    function makeRequest (options) {
        var callbackName,
            tag,
            checkResponse = typeof options.checkResponse == 'undefined' ?
                true : options.checkResponse,
            responseFieldName = options.responseFieldName || 'response',
            requestParamsStr = options.requestParams ?
                '&' + querystring.stringify(options.requestParams) :
                '',
            deferred = ym.vow.defer(),
            promise = deferred.promise(),
            timeout = options.timeout || 30000,
            exceededTimeout = setTimeout(function () {
                deferred.reject(exceededError);
            }, timeout),
            clearRequest = function () {
                clear(tag, callbackName);
                clearTimeout(exceededTimeout);
                exceededTimeout = null;
            };

        if (!options.padding) {
            callbackName = utilId.prefix() + utilId.gen();
            window[callbackName] = function (res) {
                if (checkResponse) {
                    var error = !res || res.error ||
                        (res[responseFieldName] && res[responseFieldName].error);
                    if (error) {
                        deferred.reject(error);
                    } else {
                        deferred.resolve(res && res[responseFieldName] || res);
                    }
                } else {
                    deferred.resolve(res);
                }
            };
        }

        tag = utilScript.create(
            options.url +
                (/\?/.test(options.url) ? "&" : "?") + (options.paramName || 'callback') + '=' + (options.padding || callbackName) +
                (options.noCache ? '&_=' + Math.floor(Math.random() * 10000000) : '') + requestParamsStr
        );

        tag.onerror = function () {
            deferred.reject(scriptError);
        };

        promise.then(clearRequest, clearRequest);

        return promise;
    }

    /**
     * @ignore
     * Удаляет тэг script.
     */
    function clear (tag, callbackName) {
        if (callbackName) {
            removeCallback(callbackName);
        }
        // Удаляем тег по таймауту, чтобы не нарваться на синхронную обработку,
        // в странных разных браузерах (IE, Опера старая, Сафари, Хром, ФФ4 ),
        // когда содержимое запрошенного скрипта исполняется прямо на строчке head.appendChild(tag)
        // и соответственно, при попытке удалить тэг кидается исключение.
        setTimeout(function () {
            if (tag && tag.parentNode) {
                tag.parentNode.removeChild(tag);
            }
        }, 0);
    }

    /**
     * @ignore
     * удаляем функцию-обработчик
     */
    function removeCallback (callbackName) {
        // Удаляем jsonp-функцию
        window[callbackName] = undefFunc;
        // удаляем функцию через большой интервал, т.к. содержимое удаленного тэга script может попытаться обратится
        // к этой функции, для этого и делаем заглушку undefFunc
        setTimeout(function () {
            // IE не дает делать delete объектов window
            window[callbackName] = undefined;
            try {
                delete window[callbackName];
            } catch (e) {
            }
        }, 500);
    }

    provide(jsonp);
});

ym.modules.define('system.nextTick', [], function (provide) {
    var nextTick = (function() {
        var fns = [],
            enqueueFn = function(fn) {
                return fns.push(fn) === 1;
            },
            callFns = function() {
                var fnsToCall = fns, i = 0, len = fns.length;
                fns = [];
                while(i < len) {
                    fnsToCall[i++]();
                }
            };

        if(typeof process === 'object' && process.nextTick) { // nodejs
            return function(fn) {
                enqueueFn(fn) && process.nextTick(callFns);
            };
        }

        if(global.setImmediate) { // ie10
            return function(fn) {
                enqueueFn(fn) && global.setImmediate(callFns);
            };
        }

        if(global.postMessage && !global.opera) { // modern browsers
            var isPostMessageAsync = true;
            if(global.attachEvent) {
                var checkAsync = function() {
                    isPostMessageAsync = false;
                };
                global.attachEvent('onmessage', checkAsync);
                global.postMessage('__checkAsync', '*');
                global.detachEvent('onmessage', checkAsync);
            }

            if(isPostMessageAsync) {
                var msg = '__ym' + (+new Date()),
                    onMessage = function(e) {
                        if(e.data === msg) {
                            e.stopPropagation && e.stopPropagation();
                            callFns();
                        }
                    };

                global.addEventListener?
                    global.addEventListener('message', onMessage, true) :
                    global.attachEvent('onmessage', onMessage);

                return function(fn) {
                    enqueueFn(fn) && global.postMessage(msg, '*');
                };
            }
        }

        var doc = global.document;
        if('onreadystatechange' in doc.createElement('script')) { // ie6-ie8
            var head = doc.getElementsByTagName('head')[0],
                createScript = function() {
                    var script = doc.createElement('script');
                    script.onreadystatechange = function() {
                        script.parentNode.removeChild(script);
                        script = script.onreadystatechange = null;
                        callFns();
                    };
                    head.appendChild(script);
                };

            return function(fn) {
                enqueueFn(fn) && createScript();
            };
        }

        return function(fn) { // old browsers
            enqueueFn(fn) && setTimeout(callFns, 0);
        };
    })();

    provide(nextTick);
});
ym.modules.define("util.objectKeys", [], function (provide) {
    var objectKeys = (typeof Object.keys == 'function') ? Object.keys : function (object) {
        var keys = [];
        for (var name in object) {
            if (object.hasOwnProperty(name)) {
                keys.push(name);
            }
        }
        return keys;
    };
    provide(function (object) {
        var typeofObject = typeof object,
            result;
        if (typeofObject == 'object' || typeofObject == 'function') {
            result = objectKeys(object);
        } else {
            throw new TypeError('Object.keys called on non-object');
        }
        return result;
    });
});
ym.modules.define('util.providePackage', ['system.mergeImports'], function (provide, mergeImports) {
    provide(function (srcPackage, packageArgs) {
        var packageProvide = packageArgs[0],
            packageModules = Array.prototype.slice.call(packageArgs, 1),
            ns = mergeImports.joinImports(srcPackage.name, {}, srcPackage.deps, packageModules);

        packageProvide(ns);
    });
});
/**
 * @fileOverview
 * Query string library. Original code by Azat Razetdinov <razetdinov@ya.ru>.
 */
ym.modules.define('util.querystring', [], function (provide) {
    function isArray (x) {
        return Object.prototype.toString.call(x) === '[object Array]';
    }

    provide({
        /**
         * Parse query string.
         *
         * @function
         * @static
         * @name util.querystring.parse
         * @param {String} string Query string.
         * @param {String} [sep = '&'] Param-param delimiter.
         * @param {String} [eq = '='] Name-value delimiter.
         * @param {Object} [options] Options.
         * @param {Function} [options.decodeURIComponent = decodeURIComponent] Unescape function.
         * @returns {Object} Query params.
         */
        parse: function (string, sep, eq, options) {
            sep = sep || '&';
            eq = eq || '=';
            options = options || {};
            var unescape = options.decodeURIComponent || decodeURIComponent,
                result = {},
                stringTokens = string.split(sep),
                param, name, value;

            for (var i = 0; i < stringTokens.length; ++i) {
                param = stringTokens[i].split(eq);
                name = unescape(param[0]);
                value = unescape(param.slice(1).join(eq));

                if (isArray(result[name])) {
                    result[name].push(value);
                } else if (result.hasOwnProperty(name)) {
                    result[name] = [result[name], value];
                } else {
                    result[name] = value;
                }
            }

            return result;
        },

        /**
         * Stringify query params.
         *
         * @ignore
         * @function
         * @static
         * @name util.queryString.stringify
         * @param {Object} params Query params.
         * @param {String} [sep = '&'] Param-param delimiter.
         * @param {String} [eq = '='] Name-value delimiter.
         * @param {Object} [options] Options.
         * @param {Function} [options.encodeURIComponent = encodeURIComponent] Escape function.
         * @returns {String} Query string.
         */
        stringify: function (params, sep, eq, options) {
            sep = sep || '&';
            eq = eq || '=';
            options = options || {};
            var escape = options.encodeURIComponent || encodeURIComponent,
                result = [],
                name, value;

            for (name in params) {
                if (params.hasOwnProperty(name)) {
                    value = params[name];
                    if (isArray(value)) {
                        for (var i = 0; i < value.length; ++i) {
                            if (typeof value != 'undefined') {
                                result.push(escape(name) + eq + escape(value));
                            }
                        }
                    } else {
                        if (typeof value != 'undefined') {
                            result.push(escape(name) + eq + escape(value));
                        }
                    }
                }
            }

            return result.join(sep);
        }
    });
});

ym.modules.define("util.script", [], function (provide) {
    var head = document.getElementsByTagName("head")[0];
    provide({
        create: function (url, charset) {
            var tag = document.createElement('script');
            // кодировку выставляем прежде src, дабы если файл берется из кеша, он брался не в кодировке страницы
            // эта подобная проблема наблюдалась во всех IE до текущей (восьмой)
            tag.charset = charset || 'utf-8';
            tag.src = url;
            // т.к. head на данный момент может быть не закрыт, добавляем через insertBefore.
            // так как файл может быть взят из кеша и выполнение начнется в тот же момент - timeout
            setTimeout(function () {
                head.insertBefore(tag, head.firstChild);
            }, 0);
            return tag;
        }
    });
});

})(this);