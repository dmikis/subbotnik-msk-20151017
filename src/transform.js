/**
 * @fileOverview
 * 3D transforms helpers: matrix generators, multiplication, etc.
 * All function return matrices in the column-major order, i.e. in this format:
 *
 *  [
 *      m11, m21, m31, m41,
 *      m12, m22, m32, m42,
 *      m13, m23, m33, m43,
 *      m14, m24, m34, m44
 *  ],
 *
 * where mij - matrix element in the i-th row and j-th column.
 */
ym.modules.define('transform', [], function (provide) {
    provide({
        /**
         * Rotation about X-axis.
         *
         * @ignore
         * @function
         * @static
         * @name transform.rotateX
         * @param {Number} angle Angle of rotation.
         * @returns {Number[]} Rotation matrix in the column-major order.
         */
        rotateX: function (angle) {
            var angleSin = Math.sin(angle);
            var angleCos = Math.cos(angle);

            return [
                1,       0,          0, 0,
                0, angleCos, -angleSin, 0,
                0, angleSin,  angleCos, 0,
                0,       0,          0, 1
            ];
        },

        /**
         * Rotation about Y-axis.
         *
         * @ignore
         * @function
         * @static
         * @name trasnform.rotateY
         * @param {Number} angle Angle of rotation.
         * @returns {Number[]} Rotation matrix in the column-major order.
         */
        rotateY: function (angle) {
            var angleSin = Math.sin(angle);
            var angleCos = Math.cos(angle);

            return [
                angleCos, 0, -angleSin, 0,
                       0, 1,         0, 0,
                angleSin, 0,  angleCos, 0,
                       0, 0,         0, 1
            ];
        },

        /**
         * Translation by (x, y, z) vector.
         *
         * @ignore
         * @function
         * @static
         * @name panorama.math.tranform.translate
         * @param {Number} x x-component of translation vector.
         * @param {Number} y y-component of translation vector.
         * @param {Number} z z-component of translation vector.
         * @returns {Number[]} Translation matrix in the column-major order.
         */
        translate: function (x, y, z) {
            return [
                1, 0, 0, 0,
                0, 1, 0, 0,
                0, 0, 1, 0,
                x, y, z, 1
            ];
        },

        /**
         * Scaling by s factor.
         *
         * @ignore
         * @function
         * @static
         * @name transform.isotropicScale
         * @param {Number} s
         * @returns {Number[]} Scaling matrix in the column-major order.
         */
        isotropicScale: function (s) {
            return [
                s, 0, 0, 0,
                0, s, 0, 0,
                0, 0, s, 0,
                0, 0, 0, 1
            ];
        },

        /**
         * Scaling by (x, y, z) factors.
         *
         * @ignore
         * @function
         * @static
         * @name transform.anisotropicScale
         * @param {Number} x
         * @param {Number} y
         * @param {Number} z
         * @returns {Number[]} Scaling matrix in the column-major order.
         */
        anisotropicScale: function (x, y, z) {
            return [
                x, 0, 0, 0,
                0, y, 0, 0,
                0, 0, z, 0,
                0, 0, 0, 1
            ];
        },

        /**
         * Calculates perspective projection matrix.
         *
         * @ignore
         * @function
         * @static
         * @name trasnform.perspective
         * @param {Number} fov Vertical field-of-view angle.
         * @param {Number} aspectRatio Screen width to height ratio.
         * @param {Number} zNear Z-coordinate of near clipping plane.
         *      All geometry closer than near plane will be clipped off.
         * @param {Number} zFar Z-coordinate of far clipping plane.
         *      All geometry father than far plane will be clipped off.
         * @returns {Number[]} Projection matrix in the column-major order.
         *      Notice that after applying the matrix to a vector it
         *      should be normalized, i.e. all its components should be
         *      divided by `w` component.
         */
        perspective: function (fov, aspectRatio, zNear, zFar) {
            var f = 1 / Math.tan(0.5 * fov);

            var m11 = f / aspectRatio;
            var m33 = (zNear + zFar) / (zNear - zFar);
            var m34 = 2 * zNear * zFar / (zNear - zFar);

            return [
                m11,   0,   0,  0,
                  0,   f,   0,  0,
                  0,   0, m33, -1,
                  0,   0, m34,  0
            ];
        },

        /**
         * Multiply several matrices.
         *
         * @ignore
         * @function
         * @static
         * @name transform.multiplyMatrices
         * @param {...Number[]} matrix 4x4 matrix.
         * @returns {Number[]} Result of multiplication.
         */
        multiplyMatrices: function () {
            var result = arguments[arguments.length - 1].slice(),
                r1i, r2i, r3i, r4i,
                matrix;

            for (var m = arguments.length - 1; m--;) {
                matrix = arguments[m];

                for (var offset = 0; offset < 16; offset += 4) {
                    r1i = result[offset];
                    r2i = result[offset + 1];
                    r3i = result[offset + 2];
                    r4i = result[offset + 3];

                    for (var i = 0; i < 4; ++i) {
                        result[offset + i] = r1i * matrix[i] +
                            r2i * matrix[4 + i] +
                            r3i * matrix[8 + i] +
                            r4i * matrix[12 + i];
                    }
                }
            }

            return result;
        },

        /**
         * Transform vertices by matrix.
         *
         * @ignore
         * @function
         * @static
         * @name transform.applyToVertices
         * @param {Number[]} m 4x4 tranform matrix.
         * @param {Number[]} sourceVertices Plain array of 3D vertices transform
         *      matrix will be applied to.
         * @param {Number[]} destVertices Plain array where transformed vertices
         *      will be stored. Note, that it's guaranteed to perform properly when
         *      `destVertices` and `sourceVertices` are the very same array.
         * @param {Number[]} destVertices.
         */
        applyToVertices: function (m, sourceVertices, destVertices) {
            var sx, sy, sz, w;

            for (var i = 0, il = sourceVertices.length; i !== il; i += 3) {
                sx = sourceVertices[i];
                sy = sourceVertices[i + 1];
                sz = sourceVertices[i + 2];

                w = m[3] * sx + m[7] * sy + m[11] * sz + m[15];
                for (var j = 0; j < 3; ++j) {
                    destVertices[i + j] = (m[j] * sx + m[4 + j] * sy + m[8 + j]  * sz + m[12 + j]) / w;
                }
            }

            return destVertices;
        }
    });
});
