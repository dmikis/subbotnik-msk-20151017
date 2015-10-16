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
