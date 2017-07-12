const
    fs = require("fs"),

    Promise = require("bluebird"),

    util = require("./util"),
    Bathymetry = require("./bathymetry"),
    Station = require("./station");

const fsP = Promise.promisifyAll(fs);

const maxDepth = 400;
const bandSize = 1;

const processTransect = transect => {
    console.log(`Processing transect ${transect}...`);

    return Promise.join(
        Bathymetry.load(transect),
        Station.loadStations(transect))
    .then(([bathymetry, stations]) => {
        console.log(`Transect ${transect}: processing transect data...`);

        //get a nice clean floor series
        const floor = bathymetry
            .map(({ "dist.km": dist, depth }) =>
                [dist.toFixed(2), -depth])
            .reduce(util.entriesToMap, {});

        //process and sort the stations
        const orderedStations = Object.entries(stations)
            .map(([, { dist, temps }]) => [dist, {
                temps: Object.entries(temps)
                    //don't care about deeper than maxDepth
                    .filter(([ depth ]) =>
                        parseInt(depth) <= maxDepth + 1)
                    .filter(([, temp]) =>
                        temp < 27)
                    //enforce monotonicity because fuck you
                    .reduce((agg, [depth, temp], i) => {
                        if(i > 0)
                            agg.temperatures.push([depth,
                                temp >= agg.prevTemp
                                    ? temp
                                    : agg.prevTemp]);

                        agg.prevTemp = temp;

                        return agg;
                    }, {
                        temperatures: []
                    }).temperatures
                    .reduce(util.entriesToMap, {})
            }]).sort(util.byField(0));

        const bands = orderedStations
            //group station temperatures into bands
            .map(([dist, { temps }]) => {
                return {
                    dist,
                    bands: Object.entries(temps)
                        .sort(util.byField(0))
                        .reduce((agg, [depth, temp], i) => {
                            //find the band this should belong to
                            const closest = Math.floor(temp / bandSize) * bandSize;

                            //if we just entered a new band
                            if(agg.currBand != closest) {
                                //record it
                                agg.bands[closest] = i == 0
                                    //if its the first entry, use 0
                                    ? 0
                                    : parseInt(depth);

                                agg.currBand = closest;
                            }

                            return agg;
                        }, {
                            bands: {}
                        }).bands
                };
            })
            //invert to band-series
            .reduce((bands, station) => {
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
        //     .reduce(util.entriesToMap, {});

        //fake horizontal interpolators
        const bandInterpolators = Object.entries(bands)
            .map(([band, points]) => {
                const { lines } = Object.entries(points)
                    .map(([dist, depth]) => ({
                        dist,
                        depth }))
                    .sort(util.byField("dist"))
                    .reduce((agg, point) => {
                        agg.lines[point] = interpolateD({
                            dist: point.dist - 1,
                            depth: point.depth
                        }, point);

                        return agg;
                    }, {
                        lines: {}
                    });

                return [
                    band,
                    { points, lines }
                ];
            })
            .reduce(util.entriesToMap, {});

        // console.log(bandInterpolators);

        //interpolate bands that are missing station points
        const orderedBands = Object.entries(bands)
            //order by temperature
            .sort(util.byFieldDesc(0))
            .filter(([, points]) =>
                //get the ones that need interpolating
                Object.keys(points).length < orderedStations.length);

        orderedBands.reduce((agg, [bandName, points]) => {
            //get the band interpolator
            // if(bandInterpolators[bandName]) {
            const interpolate = Object.entries(bandInterpolators[bandName].lines)
                    .sort(util.byField(0))[0][1];
            // }
            // else if(bandName == 27)
            //     agg.interpolate = Object.entries(bandInterpolators[orderedBands[1][0]].lines)
            //         .sort(util.byField(0))[0][1];

            // if(Object.keys(points).length == orderedStations.length)
            //     return agg;

            //find the stations that need interpolation
            const pointsToInterpolate = [];
            let firstKnownPoint;
            for(const [dist, { name, temps }] of orderedStations.sort(util.byFieldDesc(0))) {
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

        console.log(Object.entries(bands).sort(util.byFieldDesc(0)));

        // console.log(`Transect ${transect}`);
        // console.log(bands);

        const numBands = Object.keys(bands).length;

        const calcStack = (current, prevPoints, prevBand, stacks) =>
            Object.entries(current)
                .map(([dist, depth]) =>
                    [dist, depth - prevPoints[dist]])
                .forEach(([dist, newDepth]) => {
                    if(!stacks[prevBand])
                        stacks[prevBand] = {};

                    stacks[prevBand][dist] = newDepth;
                });

        //convert to band stacks
        const { stacks } = Object.entries(bands)
            .sort(util.byFieldDesc(0))
            .reduce((agg, [band, points], i) => {
                // console.log(`Stacking band ${band} ${i} prev ${agg.prev}`);
                // console.log(points);
                if(i != 0)
                    calcStack(points, agg.prevPoints, agg.prevBand, agg.stacks);

                agg.prevPoints = Object.entries(points)
                    .reduce(util.entriesToMap, {});
                agg.prevBand = band;

                if(i == numBands - 1)
                    calcStack(
                        Object.entries(points)
                            .map(([dist]) => [dist, maxDepth])
                            .reduce(util.entriesToMap, {}),
                        points, band, agg.stacks);

                return agg;
            }, {
                stacks: {}
            });

        console.log(Object.entries(stacks).sort(util.byFieldDesc(0)));


        //regen interpolators to make things easier, dont wanna think too hard
        // bandInterpolators = Object.entries(bands)
        //     .map(makeInterpolators)
        //     .reduce(util.entriesToMap, {});

        console.log(`Transect ${transect}: writing file...`);
        return fsP.writeFileAsync(`./data/transect${transect}/out.json`, JSON.stringify({
            bands: stacks, floor, maxDepth
        })).then(() =>
            console.log(`Transect ${transect}: done!`));
    });
};

console.log("Reading data directory...");
fsP.readdirAsync("./data").then(dirs =>
    dirs.map(transectDir =>
        processTransect(transectDir.replace("transect", ""))));

const interpolateD = util.interpolate("dist");

const makeInterpolators = ([band, points]) => {
    const { lines } = Object.entries(points)
        .map(([dist, depth]) => ({
            dist,
            depth }))
        .sort(util.byField("dist"))
        .reduce((agg, point) => {
            const isFirst = !agg.prevPoint;

            if(!isFirst)
                agg.lines[agg.prevPoint.dist] = interpolateD(agg.prevPoint, point);

            agg.prevPoint = point;

            return agg;
        }, {
            lines: {}
        });

    return [
        band,
        { points, lines }
    ];
};
