const fs = require("fs"),
    path = require("path");

const fileS = fs.createReadStream(path.join(__dirname, "new.txt"), "UTF-8");

var lines = 0;
const handleRow = chunk => {
    lines++;

    chunk.split()
};

fileS.on("data", );
fileS.on("end", () => console.log(`Total lines: ${lines}`));
