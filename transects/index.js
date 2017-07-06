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

const average = values => values
    .reduce((total, val) => total + val, 0) / values.length;

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
        }).map(parseRowWith(header))
        //don't care about deeper than 800m
        .filter(point => point.depth <= 801);
    }).then(points => {
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
            .reduce(entriesToMap, {})
    });

const byField = field => (a, b) =>
    a[field] - b[field];

const byFieldDesc = field => (a, b) =>
    b[field] - a[field];

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
        .map(parseRowWith(header))
        .sort(byField("dist.km"));
});

const stationP = Promise.join(
    readStations([59, 60, 61]),
    readStationInfo()
).then(([stations, info]) =>
    Object.entries(stations)
        .map(([key, station]) => [
            key, {
                temps: station,
                dist: info[key]
            }
        ]).reduce(entriesToMap, {}));

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

Promise.join(transectP, stationP).then(([transects, stations]) => {
    const stationPositions = Object.keys(stations).sort();

    let transectPos = 0;
    for(const [key, station] of Object.entries(stations)) {
        // console.log(`\nProcessing station ${key} at position ${station.dist}`);
        do {
            var a = transects[transectPos];
            var b = transects[transectPos + 1];

            transectPos++;
        } while(b["dist.km"] < station.dist);

        // console.log(`At position range [${a["dist.km"]}, ${b["dist.km"]}]`);

        if(a["dist.km"] == station.dist || b["dist.km"] == station.dist)
            continue;

        const estimatedDepth = Math.floor(interpolateDist(a, b)(station.dist));

        // console.log(`Interpolated depth of ${estimatedDepth} at ${station.dist}`);
        transects.splice(transectPos, 0, {
            "dist.km": station.dist,
            depth: estimatedDepth
        });
    }
    return { transects, stations };

    // console.log(Object.keys(transects)
    //     .map(key => [
    //         transects[key]["dist.km"],
    //         transects[key].depth]));
}).then(({ transects, stations }) => {
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


    //put the stations into x order
    const orderedStations = Object.entries(stations)
        .map(([name, { dist, temps }]) => [dist, {
            name,
            temps }])
        .sort(byField("dist"));
        // .reduce(entriesToMap, {});

    const bandSize = 2;
    const bands = orderedStations
        //group station temperatures into bands
        .map(([dist, { name, temps }]) => ({
                dist,
                bands: Object.entries(temps)
                    .reduce((agg, [depth, temp]) => {
                        const closest = Math.floor(temp / bandSize) * bandSize;

                        if((agg[closest] || 0) < depth)
                            agg[closest] = depth;

                        return agg;
                    }, {})
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

        let bandInterpolators = Object.entries(bands)
            .filter(([band, points]) =>
                Object.keys(points).length >= 2)
            .map(makeInterpolators)
            .reduce(entriesToMap, {});

        //interpolate bands that are missing station points
        Object.entries(bands)
            //order by temperature
            .sort(byFieldDesc(0))
            .filter(([band, points]) =>
                //get the ones that need interpolating
                Object.keys(points).length < orderedStations.length)
            .reduce((agg, [band, points]) => {
                //get the band interpolator or reuse previous one
                if(bandInterpolators[band])
                    agg.interpolate = Object.entries(bandInterpolators[band].lines)
                        .sort(byField(0))[0][1];

                //find the stations that need interpolation
                const pointsToInterpolate = [];
                let firstKnownPoint;
                for(const [dist, { name, temps }] of orderedStations.sort(byField(0))) {
                    //once we reach the first station with data, we're done
                    if(points[dist]) {
                        firstKnownPoint = {
                            dist,
                            depth: points[dist]
                        };
                        break;
                    }

                    pointsToInterpolate.push(dist);
                }

                pointsToInterpolate
                    .forEach(point => {
                        points[point] = Math.round(agg.interpolate(point, firstKnownPoint));
                    });

                return agg;
            }, {});

            //regen interpolators to make things easier, dont wanna think too hard
            bandInterpolators = Object.entries(bands)
                .map(makeInterpolators)
                .reduce(entriesToMap, {});

            //get a nice clean floor series
            const transectSeries = transects
                .map(({ "dist.km": dist, depth }) =>
                    [dist.toFixed(2), -depth])
                .reduce(entriesToMap, {});


            // interpolate between stations now
            Object.entries(bands)
                //order by temperature
                .sort(byFieldDesc(0))
                .forEach(([band, points]) => {
                    Object.entries(transectSeries).reduce((agg, [dist], i) => {
                        const isLast = i == Object.keys(transectSeries).length - 1;

                        //if this is the end of a range, or the final element
                        if(!points[dist] || isLast) {
                            agg.pointsToInterpolate.push(dist);

                            if(!isLast)
                                return agg;
                        }

                        if(!isLast)
                            agg.lastKnownPoint = {
                                dist,
                                depth: points[dist]
                            };

                        //get the correct interpolator
                        const interpolaterCandidates = Object.entries(bandInterpolators[band].lines)
                            .filter(([startPoint, interpolater]) =>
                                startPoint < dist)
                            .sort(byField(0));

                        //get the last one in the range
                        const interpolater = interpolaterCandidates[interpolaterCandidates.length - 1][1];

                        //fuckn do it
                        agg.pointsToInterpolate
                            .forEach(point => {
                                points[point] = Math.round(interpolater(point, agg.lastKnownPoint));
                            });
                        //then clear out the range
                        agg.pointsToInterpolate = [];

                        return agg;
                    }, {
                        pointsToInterpolate: []
                    });
                }, {});

            console.log("Interpolated temperature bands:");
            console.log(bands);

            console.log(`\nOcean floor:`);
            console.log(transectSeries);
});

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
        })

    return [
        band,
        { points, lines }
    ];
};

//TODO: banding
