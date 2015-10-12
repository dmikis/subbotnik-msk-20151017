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
