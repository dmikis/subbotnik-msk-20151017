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
