const util = {};

util.entriesToMap = (map, [key, value]) => {
    map[key] = value;
    return map;
};

util.byField = field => (a, b) =>
    parseFloat(a[field]) - parseFloat(b[field]);

util.byFieldDesc = field => (a, b) =>
    parseFloat(b[field]) - parseFloat(a[field]);

util.interpolate = xField => (a, b) => {
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
util.interpolateDist = util.interpolate("dist.km");

util.parseRowWith = header => row =>
    row.reduce((data, col, i) => {
        data[header[i]] = parseFloat(col);
        return data;
    }, {});

util.collectQueries = queries =>
    Promise.all(queries
        .map(([ key, promise ]) =>
            promise.then(response =>
                [key, response]))
    ).then(responses =>
        responses.reduce(util.entriesToMap, {}));

util.collectQueriesFromObj = queries =>
    util.collectQueries(Object.keys(queries)
        .map(key => [key, queries[key]])
        .map(([key, query]) => [key, query()]));

util.average = values => values
    .reduce((total, val) => total + val, 0) / values.length;

module.exports = util;
