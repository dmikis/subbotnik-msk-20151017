attribute vec3 vertexPosition;
attribute vec3 instancePosition;
attribute vec3 instanceColor;

uniform mat4 perspective;
uniform mat4 rotationScale;

varying vec3 color;

void main(void) {
    vec4 position = rotationScale * vec4(vertexPosition, 1);
    position.xyz += instancePosition;
    gl_Position = perspective * position;
    color = instanceColor;
}
