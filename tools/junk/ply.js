var fs = require('fs');

var inputFile = process.argv[2],
    outputFile = process.argv[3];

console.assert(inputFile && outputFile);

var plyTokens = fs.readFileSync(inputFile).toString()
    .trim()
    .split('\n')
    .map(function (line) {
        return line.trim().split(/\s+/);
    });

function indexOfFirstPredicate(arr, predicate) {
    for (var i = 0; i < arr.length; ++i) {
        if (predicate(arr[i], i, arr)) return i;
    }
    return -1;
}

function find(arr, predicate) {
    return arr[indexOfFirstPredicate(arr, predicate)];
}

var verticesNum = parseInt(find(plyTokens, function (line) {
        return line[0] == 'element' && line[1] == 'vertex';
    })[2], 10),
    facesNum = parseInt(find(plyTokens, function (line) {
        return line[0] == 'element' && line[1] == 'face';
    })[2], 10),
    headerEndIndex = indexOfFirstPredicate(plyTokens, function (line) {
        return line[0] == 'end_header';
    }) + 1,
    vertexBuffer = plyTokens.slice(headerEndIndex, headerEndIndex + verticesNum)
        .reduce(function (buffer, line) {
            return buffer.concat(line.map(parseFloat));
        }, []),
    indexBuffer = plyTokens.slice(
        headerEndIndex + verticesNum,
        headerEndIndex + verticesNum + facesNum
    )
        .reduce(function (buffer, line) {
            return buffer.concat(line.slice(1).map(function (token) {
                return parseInt(token, 10);
            }));
        }, []);

var gCenterX = 0, gCenterY = 0, gCenterZ = 0;

console.log(vertexBuffer.length);

function pad(x) {
    x = String(x);
    for (var i = 0; i < x.length - 6; ++i) {
        x = ' ' + x;
    }
    return x;
}

for (var offset = 0; offset < vertexBuffer.length; offset += 9) {
    process.stdout.write(pad(offset));
    gCenterX += vertexBuffer[offset];
    gCenterY += vertexBuffer[offset + 1];
    gCenterZ += vertexBuffer[offset + 2];
    process.stdout.write('\b\b\b\b\b\b');
}

gCenterX /= verticesNum;
gCenterY /= verticesNum;
gCenterZ /= verticesNum;

for (var offset = 0; offset < vertexBuffer.length; offset += 9) {
    process.stdout.write(pad(offset));
    vertexBuffer[offset]     -= gCenterX;
    vertexBuffer[offset + 1] -= gCenterY;
    vertexBuffer[offset + 2] -= gCenterZ;

    vertexBuffer[offset + 6] /= 255;
    vertexBuffer[offset + 7] /= 255;
    vertexBuffer[offset + 8] /= 255;
    process.stdout.write('\b\b\b\b\b\b');
}

fs.writeFileSync(
    outputFile,
    JSON.stringify({
        vbuffer: vertexBuffer,
        ibuffer: indexBuffer
    })
);
