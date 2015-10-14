attribute vec3 vertexPosition;

uniform mat4 mvp;

void main(void) {
    gl_Position = mvp * vec4(vertexPosition, 1);
}
