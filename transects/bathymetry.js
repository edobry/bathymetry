const
    fs = require("fs"),

    Promise = require("bluebird"),

    util = require("./util");

const fsP = Promise.promisifyAll(fs);

const Bathymetry = {};

Bathymetry.load = transect => {
    console.log(`Transect ${transect}: reading bathymetry...`);

    const bathymetryPath = `./data/transect${transect}/transect_${transect}.csv`;
    return fsP.readFileAsync(bathymetryPath, "UTF-8").then(contents => {
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
            .map(util.parseRowWith(header))
            .sort(util.byField("dist.km"));
    }).catch(() => {
        throw new Error(`bathymetry for transect ${transect} not found!`);
    });
};

module.exports = Bathymetry;
