const
    fs = require("fs"),

    Promise = require("bluebird");

fsP = Promise.promisifyAll(fs);

const printStation = ([station, points]) => {
    console.log(`\nStation ${station} temperatures:`);

    const { temp: maxTemp, depth: maxDepth } = points.reduce((agg, { temp, depth }) => {
        if(temp > agg.temp)
            agg.temp = temp;
        if(depth > agg.depth)
            agg.depth = depth;

        return agg;
    }, {
        temp: 0,
        depth: 0
    });

    console.log(`Max Temp: ${maxTemp}`);
    console.log(`Max Depth: ${maxDepth}`);

    // points.forEach(({ temp, depth }) => {
    //     console.log(`Depth: ${depth}, Temp: ${temp}`);
    // });
};

const parseRowWith = header => row =>
    row.reduce((data, col, i) => {
        data[header[i]] = parseFloat(col);
        return data;
    }, {});

const cnvSeperator = "    ";

const collectQueries = queries =>
    Promise.all(queries
        .map(([ key, promise ]) =>
            promise.then(response =>
                [key, response]))
    ).then(responses =>
        responses.reduce((result, [key, response]) => {
            result[key] = response;
            return result;
        }, {}));

const collectQueriesFromObj = queries =>
    collectQueries(Object.keys(queries)
        .map(key => [key, queries[key]])
        .map(key => [key, query()]));

const readStations = stations =>
    collectQueries(stations
        .map(station =>
            [station, readStation(station)]))

const readStation = station =>
    fsP.readFileAsync(`./NF1703_0${station}fix.cnv`, "UTF-8").then(contents => {
        const rows = contents.split("\n");

        const header = rows[0].split("\t").slice(1).map(colName =>
            colName.replace(/\r/, ""));

        return rows.slice(1, rows.length - 1).map(row => {
            const cols = row
                //normalize uneven column spacing
                .replace(/      /g, cnvSeperator)
                .replace(/     /g, cnvSeperator)
                .replace(/   /g, cnvSeperator)
                //break into cols and drop empty first
                .split(cnvSeperator).slice(1);

            if(typeof cols[1] == "undefined")
                console.log("Undefined:", cols);

            //filter out scientific notation at end
            cols[1] = cols[1].split("  ")[0];

            return cols;
        }).map(parseRowWith(header));
    });

fsP.readFileAsync("./transect_1.csv", "UTF-8").then(contents => {
    const rows = contents.split("\n")
        .map(row =>
            row.split("\t"));

    const header = rows[0].map(colName => colName
        //strip out quotes
        .replace(/"/g, "")
        //strip EOL marker
        .replace(/\r/g, ""));

    return rows.slice(1, rows.length - 1)
        .map(parseRowWith(header));
}).then(points => {
    // console.log("Transect depths:");

    points.forEach(({ lat, lon, depth }) => {
        // console.log(`Point (${lat.toFixed(4)}, ${lon.toFixed(4)}): Depth ${depth}`);
    });
})
.then(() =>
    readStations([59, 60, 61]))
.then(stations => {
    console.log("Stations:");

    Object.keys(stations)
        .map(key => [key, stations[key]])
        .map(printStation);
})
