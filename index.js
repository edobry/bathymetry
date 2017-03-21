const fs = require("fs"),
    path = require("path");

const fileS = fs.createReadStream(path.join(__dirname, "new.txt"), "UTF-8");

var data = "";
const handleChunk = chunk => {
    data += chunk;
};

const onReadDone = () => {
    const rows = data.split('\n')
        .map(row => row.split(" ")
            .filter(col => col.length != 0)
            .map(col => parseFloat(col)))
        .filter(cols => cols.length > 1);

    const rowSize = rows[0].length;
    if(!rows.every(row => row.length == rowSize))
        throw new Error("Rows not evenly sized!");

    console.log(`Total rows: ${rows.length}`);
    console.log(`Row size: ${rowSize}`);

    const testData = rows.slice(0, 68)
        .map(row => row.slice(0, 1000));

    fs.writeFile("testData.json", JSON.stringify(testData), err => {
        if(err)
            throw new Error(err);

        console.log("Wrote test data");
    });
}

fileS.on("data", handleChunk);
fileS.on("end", onReadDone);
