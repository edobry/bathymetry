const
    http = require("http"),
    static = require("node-static"),

    loadData = require("./loadData");

const PORT = 8081;

const file = new static.Server(".");

const handleDataRequest = (req, res) => {
    const resource = decodeURIComponent(req.url.split('/').slice(2));
    console.log(`Serving resource ${resource}`);

    loadData(resource, res);
};

const routes = {
    data: handleDataRequest
};

const serveStatic = (req, res) => file.serve(req, res);

const server = http.createServer((req, res) => {
    console.log(req.url);
    req.addListener("end", () => {
        const path = req.url.split('/');
        const handler = routes[path[1]] || serveStatic;
        handler(req, res);
    }).resume();
}).listen(PORT);

server.on("listening", () => {
    console.log(`Started server on port ${PORT}`);
});
