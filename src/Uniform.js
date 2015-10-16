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
