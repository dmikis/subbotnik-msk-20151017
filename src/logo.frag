#ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
#else
    precision mediump float;
#endif

varying vec3 normal;
varying vec3 color;

void main(void) {
    gl_FragColor = vec4(vec3(.5, .5, .5) + .5 * normal, 1);
    gl_FragColor = vec4(color, 1);
}
