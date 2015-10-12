ym.modules.define('main', [
    'Buffer',
    'MedianFilter',
    'Program',
    'transform',

    'logo.json',
    'logo.vert',
    'logo.frag'
], function (provide, Buffer, MedianFilter, Program, transform, logoGeometry, vsSrc, fsSrc) {
    var CW = 800,
        CH = 600,

        gl = document.createElement('canvas').getContext('webgl'),
        timerExt = gl.getExtension('EXT_disjoint_timer_query'),
        queries = [],
        filter = new MedianFilter(),
        drawCallDurationGauge = document.createElement('input');

    if (!timerExt) {
        throw new Error('This demo relies upon EXT_disjoint_timer_query and can\'t run w/o it')
    }

    gl.canvas.width = CW;
    gl.canvas.height = CH;

    gl.canvas.style.border = '1px solid black';
    document.body.appendChild(gl.canvas);
    document.body.appendChild(drawCallDurationGauge);

    gl.clearColor(1, 1, 1, 1);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);

    gl.viewport(0, 0, CW, CH);

    var vertexBuffer = new Buffer(gl, gl.ARRAY_BUFFER),
        indexBuffer = new Buffer(gl, gl.ELEMENT_ARRAY_BUFFER),
        program = new Program(gl, vsSrc, fsSrc),
        vertexPositionAttr = program.getAttributeIdx('vertexPosition'),
        vertexNormalAttr = program.getAttributeIdx('vertexNormal'),
        vertexColorAttr = program.getAttributeIdx('vertexColor'),
        mvpUniform = program.getUniform('mvp');

    vertexBuffer.setData(new Float32Array(logoGeometry.vbuffer), gl.STATIC_DRAW);
    indexBuffer.setData(new Uint16Array(logoGeometry.ibuffer), gl.STATIC_DRAW);

    var VERTEX_SIZE = 36,
        VERTEX_POSITION_OFFSET = 0,
        VERTEX_NORMAL_OFFSET = 12,
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

    gl.enableVertexAttribArray(vertexNormalAttr);
    gl.vertexAttribPointer(
        vertexNormalAttr,
        3,
        gl.FLOAT,
        false,
        VERTEX_SIZE,
        VERTEX_NORMAL_OFFSET
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

        if (
            queries.length &&
            timerExt.getQueryObjectEXT(queries[0], timerExt.QUERY_RESULT_AVAILABLE_EXT) &&
            !gl.getParameter(timerExt.GPU_DISJOINT_EXT)
        ) {
            query = queries.shift();
            drawCallDurationGauge.value =
                filter.filter(timerExt.getQueryObjectEXT(query, timerExt.QUERY_RESULT_EXT));
            timerExt.deleteQueryEXT(query);
        }

        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        mvpUniform.setMatrix4(transform.multiplyMatrices(
            transform.perspective(0.5 * Math.PI, CW / CH, 0.5, 5),
            transform.translate(0, 0, -1),
            transform.rotateY(3e-3 * t),
            transform.isotropicScale(0.3)
        ));

        query = timerExt.createQueryEXT();
        timerExt.beginQueryEXT(timerExt.TIME_ELAPSED_EXT, query);
        gl.drawElements(gl.TRIANGLES, logoGeometry.ibuffer.length, gl.UNSIGNED_SHORT, 0);
        timerExt.endQueryEXT(timerExt.TIME_ELAPSED_EXT);

        queries.push(query);

        requestAnimationFrame(render);
    }

    requestAnimationFrame(render);

    provide();
});
