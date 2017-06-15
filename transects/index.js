const
    fs = require("fs"),

    Promise = require("bluebird");

fsP = Promise.promisifyAll(fs);

fsP.readFileAsync("./transect_1.csv", "UTF-8").then(contents => {
    const rows = contents.split("\n")
        .map(row =>
            row.split("\t"));

    const header = rows[0].map(colName => colName
        .replace(/"/g, "")
        .replace(/\r/g, ""));

    return rows.slice(1, rows.length - 1).map(row =>
        row.reduce((data, col, i) => {
            data[header[i]] = parseFloat(col);
            return data;
        }, {}));
}).then(points => {
    console.log("Transect depths:");

    points.forEach(({ lat, lon, depth }) => {
        console.log(`Point (${lat.toFixed(4)}, ${lon.toFixed(4)}): Depth ${depth}`);
    });
}).then(() => {
    fsP.readFileAsync("./NF1703_059fix.cnv", "UTF-8").then(contents => {
        const rows = contents.split("\n");

        const header = rows[0].split("\t").slice(1).map(colName =>
            colName.replace(/\r/, ""));

        return rows.slice(1, rows.length - 1).map(row => {
            const cols = row.split("    ").slice(1);

            cols[1] = cols[1].split(" ")[0];

            return cols;
        }).map(row =>
            row.reduce((data, col, i) => {
                data[header[i]] = parseFloat(col);
                return data;
            }, {}));
    }).then(points => {
        console.log("Station 59 temperatures:");

        points.forEach(({ temp, depth }) => {
            console.log(`Depth: ${depth}, Temp: ${temp}`);
        });
    });
});
