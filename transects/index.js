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

const entriesToMap = (map, [key, value]) => {
    map[key] = value;
    return map;
};

const readStationInfo = () =>
    fsP.readFileAsync("./stations1.txt", "UTF-8").then(contents => {
        const sections = contents.split("\r\n\r\n");
        const stations = sections.slice(0, sections.length - 1);

        return stations.map(section => {
            const [number, coords, distance] = section.split("\r\n");

            return [
                parseInt(number.split(" ")[0]),
                parseFloat(distance.split("=")[1].split(" "))
            ];
        }).reduce(entriesToMap, {});
    });

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
        responses.reduce(entriesToMap, {}));

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

const transectP = fsP.readFileAsync("./transect_1.csv", "UTF-8").then(contents => {
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

    return points
        .sort((a, b) => a["dist.km"] - b["dist.km"]);
})

const stationP = Promise.join(
    readStations([59, 60, 61]),
    readStationInfo()
).then(([stations, info]) =>
    Object.keys(stations).map(key => [key, stations[key]])
        .map(([key, station]) => [
            key, {
                temps: station,
                dist: info[key]
            }
        ]).reduce(entriesToMap, {}));

const interpolate = ({ "dist.km": distA, depth: depthA }, { "dist.km": distB, depth: depthB }) => {
    const slope = (depthB - depthA) / (distB - distA);
    const intercept = depthA - (distA * slope);

    return pos => pos * slope + intercept;
};

Promise.join(transectP, stationP).then(([transects, stations]) => {
    const stationPositions = Object.keys(stations).sort();

    let transectPos = 0;
    for(const [key, station] of Object.keys(stations).map(key => [key, stations[key]])) {
        console.log(`\nProcessing station ${key} at position ${station.dist}`);
        do {
            var a = transects[transectPos];
            var b = transects[transectPos + 1];

            transectPos++;
        } while(b["dist.km"] < station.dist);

        console.log(`At position range [${a["dist.km"]}, ${b["dist.km"]}]`);

        if(a["dist.km"] == station.dist || b["dist.km"] == station.dist)
            continue;

        const estimatedDepth = Math.floor(interpolate(a, b)(station.dist));

        console.log(`Interpolated depth of ${estimatedDepth} at ${station.dist}`);
        transects.splice(transectPos, 0, {
            "dist.km": station.dist,
            depth: estimatedDepth
        });
    }

    console.log(Object.keys(transects)
        .map(key => [
            transects[key]["dist.km"],
            transects[key].depth]));
});
