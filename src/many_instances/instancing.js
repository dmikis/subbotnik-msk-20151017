ym.modules.define('many_instances.instancing', [
    'Buffer',
    'Program',
    'transform',

    'many_instances.instancing.vert',
    'many_instances.instancing.frag'
], function (provide, Buffer, Program, transform, vsSrc, fsSrc) {
    var gl = document.querySelector('#gl').getContext('webgl'),
        glW = gl.drawingBufferWidth,
        glH = gl.drawingBufferHeight,
        glAspect = glW / glH,
        instancingExt = gl.getExtension('ANGLE_instanced_arrays');

    if (!instancingExt) {
        throw new Error('This demo relies upon ANGLE_instanced_arrays and can\'t run w/o it')
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
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        var rotationMatrix = transform.rotateY(3e-3 * t);

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

        requestAnimationFrame(render);
    }

    requestAnimationFrame(render);

    provide();
});
