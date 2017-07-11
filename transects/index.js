const
    fs = require("fs"),
    path = require("path"),

    Promise = require("bluebird");

fsP = Promise.promisifyAll(fs);

const maxDepth = 400;

const interpolate = xField => (a, b) => {
    const aX = a[xField];
    const aY = a.depth;

    const bX = b[xField];
    const bY = b.depth;

    const slope = (bY - aY) / (bX - aX);

    return (pos, interceptPoint = a) => {
        const iX = interceptPoint[xField];
        const iY = interceptPoint.depth;

        const intercept = iY - (iX * slope);
        return pos * slope + intercept;
    };
};
const interpolateDist = interpolate("dist.km");

const entriesToMap = (map, [key, value]) => {
    map[key] = value;
    return map;
};

const readStationInfo = transect => {
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
        }).reduce(entriesToMap, {});
    });
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
        responses.reduce(entriesToMap, {}));

const collectQueriesFromObj = queries =>
    collectQueries(Object.keys(queries)
        .map(key => [key, queries[key]])
        .map(key => [key, query()]));

const average = values => values
    .reduce((total, val) => total + val, 0) / values.length;

const readStations = (transect, stations) =>
    collectQueries(stations
        .map(station =>
            [station, readStation(transect, station)]));

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
    }).map(parseRowWith(["temp", "depth"]));

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
    }).map(parseRowWith(["depth", "temp"]));

const readStation = (transect, station) => {
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

                return parser(rows)
                    //don't care about deeper than 800m
                    .filter(point => point.depth <= maxDepth + 1);
            }))
        .then(points => {
            //group points into integral depth group
            const depthRanges = points
                .sort(byField("depth"))
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
                    [range, average(temps)])
                .reduce(entriesToMap, {});
        });
};

const byField = field => (a, b) =>
    parseFloat(a[field]) - parseFloat(b[field]);

const byFieldDesc = field => (a, b) =>
    parseFloat(b[field]) - parseFloat(a[field]);

const processTransect = transect => {
    console.log(`Processing transect ${transect}...`);

    const bathymetryPath = `./data/transect${transect}/transect_${transect}.csv`;
    console.log(`Transect ${transect}: reading bathymetry...`);
    const transectP = fsP.readFileAsync(bathymetryPath, "UTF-8").then(contents => {
        console.log(`Transect ${transect}: processing bathymetry...`);

        const rows = contents.split("\n")
            .map(row =>
                row.split("\t"));

        const header = rows[0].map(colName => colName
            //strip out quotes
            .replace(/"/g, "")
            //strip EOL marker
            .replace(/\r/g, ""));

        return rows.slice(1, rows.length - 1)
            .map(parseRowWith(header))
            .sort(byField("dist.km"));
    }).catch(() => {
        throw new Error(`bathymetry for transect ${transect} not found!`);
    });

    const stationP = readStationInfo(transect)
        .then(info =>
            readStations(transect, Object.keys(info))
                .then(stations =>
                    Object.entries(stations)
                        .map(([key, station]) => [
                            key, {
                                temps: station,
                                dist: info[key]
                            }
                        ]).reduce(entriesToMap, {})));

    return Promise.join(transectP, stationP).then(([transects, stations]) => {
        //do the banding now
        //what is banding? group station temps by degree range, mb just 10C for now?
        //what data do we want to get out of this?
        //transect depths, and then several temp series, one per temp range
        //each has one point per station? do we interpolate? no point (ha)
        //what to do about temp ranges that are not present in every station? like cold temps at depths.
        //stations near shore will not have those. seems like we might have to interpolate a gradient for those mb?
        //i guess we can interpolate temp point for every transect point. lots of data, might be redundant?
        //cant think of another way to handle low temps. lets try it i guess.

        //ok so, banding. go in station order? interpolating between each one? mb.

        console.log(`Transect ${transect}: processing station data...`);

        //put the stations into x order |
        const orderedStations = Object.entries(stations)
            .map(([name, { dist, temps }]) => [dist, {
                name,
                temps }])
            .sort(byField("dist"));

        const bands = orderedStations
            //group station temperatures into bands
            .map(([dist, { name, temps }]) => ({
                dist,
                bands: Object.entries(temps)
                    .reduce((agg, [depth, temp]) => {
                        // if(temp < 18)
                        //     agg.bandSize = 2;

                        //find the band this should belong to
                        const closest = Math.floor(temp / agg.bandSize) * agg.bandSize;

                        if(!agg.bands[closest] || agg.bands[closest] > parseInt(depth))
                            agg.bands[closest] = parseInt(depth);

                        return agg;
                    }, {
                        bandSize: 1,
                        bands: {}
                    }).bands
            }))
            //invert to band-series
            .reduce((bands, station, i) => {
                Object.entries(station.bands)
                    .forEach(([temp, depth]) => {
                        if(typeof bands[temp] != "object")
                            bands[temp] = {};

                        bands[temp][station.dist] = depth;
                    });

                return bands;
            }, {});

        // let bandInterpolators = Object.entries(bands)
        //     .filter(([band, points]) =>
        //         Object.keys(points).length >= 2)
        //     .map(makeInterpolators)
        //     .reduce(entriesToMap, {});

        //fake horizontal interpolators
        let bandInterpolators = Object.entries(bands)
            .map(([band, points]) => {
                const { lines } = Object.entries(points)
                    .map(([dist, depth]) => ({
                        dist,
                        depth }))
                    .sort(byField("dist"))
                    .reduce((agg, point) => {
                        agg.lines[point] = interpolateD({
                            dist: point.dist - 1,
                            depth: point.depth
                        }, point);

                        return agg;
                    }, {
                        lines: {},
                    });

                return [
                    band,
                    { points, lines }
                ];
            })
            .reduce(entriesToMap, {});

        // console.log(bandInterpolators);

        //interpolate bands that are missing station points
        const orderedBands = Object.entries(bands)
            //order by temperature
            .sort(byFieldDesc(0))
            .filter(([band, points]) =>
                //get the ones that need interpolating
                Object.keys(points).length < orderedStations.length);

        orderedBands.reduce((agg, [bandName, points], i) => {
            //get the band interpolator or reuse previous one
            // if(bandInterpolators[bandName]) {
            const interpolate = Object.entries(bandInterpolators[bandName].lines)
                    .sort(byField(0))[0][1];
            // }
            // else if(bandName == 27)
            //     agg.interpolate = Object.entries(bandInterpolators[orderedBands[1][0]].lines)
            //         .sort(byField(0))[0][1];

            // if(Object.keys(points).length == orderedStations.length)
            //     return agg;

            //find the stations that need interpolation
            const pointsToInterpolate = [];
            let firstKnownPoint;
            for(const [dist, { name, temps }] of orderedStations.sort(byFieldDesc(0))) {
                //once we reach the first station with data, we're done
                if(points[dist]) {
                    firstKnownPoint = {
                        dist,
                        depth: points[dist]
                    };
                    continue;
                }

                pointsToInterpolate.push(dist);
            }

            pointsToInterpolate
                .forEach(point => {
                    points[point] = Math.round(interpolate(point, firstKnownPoint));
                });

            return agg;
        }, {});

        console.log(`Transect ${transect}`);
        console.log(bands);

        //convert to band stacks
        Object.entries(bands)
            .sort(byField(0))
            .reduce((agg, [band, points], i) => {
                if(i == 0)
                    agg.prev = Object.keys(points)
                        .map(dist => [dist, 0])
                        .reduce(entriesToMap, {});

                const newPoints = Object.entries(points)
                    .map(([dist, depth]) =>
                        [dist, (maxDepth - depth) - agg.prev[dist]])
                    .forEach(([dist, depth]) =>
                        agg.prev[dist] += points[dist] = depth);

                return agg;
            }, {});

        //regen interpolators to make things easier, dont wanna think too hard
        // bandInterpolators = Object.entries(bands)
        //     .map(makeInterpolators)
        //     .reduce(entriesToMap, {});

        //get a nice clean floor series
        const floor = transects
            .map(({ "dist.km": dist, depth }) =>
                [dist.toFixed(2), -depth])
            .reduce(entriesToMap, {});

        const floorEntries = Object.entries(floor);
        const xPositions = Object.keys(floor);

        console.log(`Transect ${transect}: writing file...`);
        return fsP.writeFileAsync(`./data/transect${transect}/out.json`, JSON.stringify({
            bands, floor, maxDepth
        })).then(() =>
            console.log(`Transect ${transect}: done!`));
    });
};

console.log("Reading data directory...");
fsP.readdirAsync("./data").then(dirs =>
    dirs.map(transectDir =>
        processTransect(transectDir.replace("transect", ""))));

const interpolateD = interpolate("dist");

const makeInterpolators = ([band, points]) => {
    const { lines } = Object.entries(points)
        .map(([dist, depth]) => ({
            dist,
            depth }))
        .sort(byField("dist"))
        .reduce((agg, point) => {
            const isFirst = !agg.prevPoint;

            if(!isFirst)
                agg.lines[agg.prevPoint.dist] = interpolateD(agg.prevPoint, point);

            agg.prevPoint = point;

            return agg;
        }, {
            lines: {},
        });

    return [
        band,
        { points, lines }
    ];
};
