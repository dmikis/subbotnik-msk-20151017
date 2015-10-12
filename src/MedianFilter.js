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
