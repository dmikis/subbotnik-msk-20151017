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
