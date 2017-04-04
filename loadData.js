const fs = require("fs"),
    path = require("path");

const HEADER_SIZE = 6;
const WIDTH = 1000;
const HEIGHT = 1000;

const loadFile = (name, response) => {
    const fileS = fs.createReadStream(path.join(__dirname, name), "UTF-8");

    var data = "";
    const handleChunk = chunk => {
        data += chunk;
    };

    fileS.on("data", handleChunk);
    fileS.on("end", () => onReadDone(data, response));
};

const onReadDone = (data, response) => {
    console.log(`Loaded file`);
    const rows = data.split('\n')
        .slice(HEADER_SIZE)
        .map(row => row.split(" ")
            .filter(col => col.length != 0)
            .map(col => parseFloat(col)))
        .filter(cols => cols.length > 1);

    const rowSize = rows[0].length;
    if(!rows.every(row => row.length == rowSize)) {
        var thing = {};
        rows.map(row => row.length).forEach(x => {
            if(!thing[x])
                thing[x] = 1;
            else
                thing[x]++;
        });
        console.log(JSON.stringify(thing));
        throw new Error("Rows not evenly sized!");
    }

    console.log(`Total rows: ${rows.length}`);
    console.log(`Row size: ${rowSize}`);

    const parsedData = rows.slice(0, HEIGHT)
        .map(row => row.slice(0, WIDTH));

    const maxDepth = -Math.min(...[].concat(...parsedData));

    const resource = {
        data: parsedData,
        dimensions: {
            x: WIDTH,
            y: HEIGHT
        },
        maxDepth
    };

    response.end(JSON.stringify(resource));
};

module.exports = loadFile;
