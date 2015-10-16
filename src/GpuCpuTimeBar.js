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
