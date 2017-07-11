const
    fs = require("fs"),
    path = require("path"),

    Promise = require("bluebird"),

    util = require("./util");

const fsP = Promise.promisifyAll(fs);

const Station = {};

Station.readStationInfo = transect => {
    console.log(`Transect ${transect}: reading station info...`);

    return fsP.readFileAsync(`./data/transect${transect}/stations${transect}.txt`, "UTF-8").then(contents => {
        console.log(`Transect ${transect}: processing station info....`);

        const stations = contents.split("\r\n\r\n");

        return stations.map(station => {
            const [number, type, coords, distance] = station.split("\r\n");

            return [
                parseInt(number.split(" ")[0]),
                parseFloat(distance.split("=")[1].split(" "))
            ];
        }).reduce(util.entriesToMap, {});
    });
};

Station.readStations = (transect, stations) =>
    util.collectQueries(stations
        .map(station =>
            [station, Station.readStation(transect, station)]));

const cnvSeperator = "    ";

const csvStationParser = rows =>
    rows.slice(1, rows.length - 1).map(row => {
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
    }).map(util.parseRowWith(["temp", "depth"]));

const txtStationParser = rows =>
    rows.slice(35, rows.length - 1).map(row => {
        const cols = row
            //normalize uneven column spacing
            .replace(/\s+/g, cnvSeperator)
            .replace(/\t\s+/g, cnvSeperator)
            //break into cols and drop empty first
            .split(cnvSeperator).slice(1);

        if(typeof cols[1] == "undefined")
            console.log("Undefined:", cols);

        return cols.slice(0, cols.length - 1);
    }).map(util.parseRowWith(["depth", "temp"]));

Station.readStation = (transect, station) => {
    console.log(`Transect ${transect}: reading station ${station}...`);

    const prefix = `./data/transect${transect}`;

    const csvPath = path.join(prefix, `${station}.csv`);
    const txtPath = path.join(prefix, `0${station}.txt`);

    return fsP.statAsync(csvPath)
        .then(() => ({
            stationPath: csvPath,
            parser: csvStationParser
        })).catch(() => ({
            stationPath: txtPath,
            parser: txtStationParser
        }))
        .then(({ stationPath, parser }) =>
            fsP.readFileAsync(stationPath, "UTF-8").then(contents => {
                console.log(`Transect ${transect}: parsing station ${station}`);

                const rows = contents.split("\n");

                return parser(rows);
            }))
        .then(points => {
            //group points into integral depth group
            const depthRanges = points
                .sort(util.byField("depth"))
                .reduce((depthRanges, point) => {
                    const { depth, temp } = point;

                    const normDepth = Math.floor(depth);

                    if(!depthRanges[normDepth])
                        depthRanges[normDepth] = [];

                    depthRanges[normDepth].push(temp);

                    return depthRanges;
                }, {});

            //average them
            return Object.entries(depthRanges)
                .map(([range, temps]) =>
                    [range, +util.average(temps).toFixed(2)])
                .reduce(util.entriesToMap, {});
        });
};

Station.loadStations = transect =>
    Station.readStationInfo(transect)
        .then(info =>
            Station.readStations(transect, Object.keys(info))
                .then(stations =>
                    Object.entries(stations)
                        .map(([key, station]) => [
                            key, {
                                temps: station,
                                dist: info[key]
                            }
                        ]).reduce(util.entriesToMap, {})));

module.exports = Station;
