attribute vec3 vertexPosition;
attribute vec3 vertexColor;

varying vec3 color;

uniform mat4 mvp;

void main(void) {
    gl_Position = mvp * vec4(vertexPosition, 1);
    color = vertexColor;
}
