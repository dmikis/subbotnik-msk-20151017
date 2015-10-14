ym.modules.define('many_instances.naive', [
    'Buffer',
    'Program',
    'transform',

    'many_instances.naive.vert',
    'many_instances.naive.frag'
], function (provide, Buffer, Program, transform, vsSrc, fsSrc) {
    var gl = document.querySelector('#gl').getContext('webgl'),
        glW = gl.drawingBufferWidth,
        glH = gl.drawingBufferHeight,

        glAspect = glW / glH;

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
                instances[i + 3] = x / 40,
                instances[i + 4] = y / 40,
                instances[i + 5] = z / 40
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
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        var rotationMatrix = transform.rotateY(3e-3 * t);

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

        requestAnimationFrame(render);
    }

    requestAnimationFrame(render);

    provide();
});
