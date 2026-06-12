var http = require('http');
var express = require('express');
const path = require('path');
var ShareDB = require('sharedb');
var ShareDBMongo = require('sharedb-mongo');
var richText = require('rich-text');
var WebSocket = require('ws');
var WebSocketJSONStream = require('@teamwork/websocket-json-stream');
var bodyParser = require('body-parser');
var { createClient } = require('redis');
var RedisPubSub = require('sharedb-redis-pubsub');
require('dotenv').config(); 
const cors = require('cors');

// Register the rich text type with ShareDB
ShareDB.types.register(richText.type);

// MongoDB connection URL
var mongoUrl = process.env.MONGO_URL;
var mongoDB = new ShareDBMongo(mongoUrl);

// Redis configuration
const redisHost = process.env.REDIS_HOST || 'redis';
const redisPort = process.env.REDIS_PORT || 6379;
const redisPassword = process.env.REDIS_PASSWORD || 'root';

// Create Redis clients only once
let redisClient = null;
let redisObserver = null;

async function initializeRedisClients() {
    if (!redisClient) {
        redisClient = createClient({
            socket: {
                host: redisHost,
                port: redisPort,
            },
            password: redisPassword,
        });

        redisClient.on('error', (err) => {
            console.error("Redis client error:", err);
        });

        await redisClient.connect();
        console.log("redisClient connected successfully.");
    } else {
        console.log("redisClient is already initialized.");
    }

    if (!redisObserver) {
        redisObserver = createClient({
            socket: {
                host: redisHost,
                port: redisPort,
            },
            password: redisPassword,
        });

        redisObserver.on('error', (err) => {
            console.error("Redis observer error:", err);
        });

        await redisObserver.connect();
        console.log("redisObserver connected successfully.");
    } else {
        console.log("redisObserver is already initialized.");
    }
}

// Initialize the Redis clients before using them
initializeRedisClients().catch((err) => {
    console.error("Error initializing Redis clients:", err);
});


// Set up Redis Pub/Sub for ShareDB
var pubsub = new RedisPubSub({
    client: redisClient,
    observer: redisObserver
});

// Initialize ShareDB with MongoDB and Redis Pub/Sub
var backend = new ShareDB({
    db: mongoDB,
    pubsub: pubsub,
    presence: true,
    doNotForwardSendPresenceErrorsToClient: true
});

// Function to ensure a document exists
function ensureDocExists(padId, callback) {
    var connection = backend.connect();
    var doc = connection.get('examples', padId);

    doc.fetch(function (err) {
        if (err) {
            console.error(`Error fetching document ${padId}:`, err);
            return callback(err);
        }

        if (doc.type === null) {
            console.log(`Document ${padId} not found. Creating a new one.`);
            doc.create([{ insert: '\n' }], 'rich-text', function (err) {
                if (err) {
                    console.error(`Error creating document ${padId}:`, err);
                    return callback(err);
                }
                console.log(`Document ${padId} created successfully.`);
                callback(null);
            });
        } else {
            console.log(`Document ${padId} already exists.`);
            callback(null);
        }
    });
}

function startServer() {
    var app = express();

    app.use(cors());

    app.use('/express_server', express.static(path.join(__dirname)));

    app.use(bodyParser.json());

    app.post('/create-pad', (req, res) => {
        const { padId } = req.body;
        if (!padId) {
            return res.status(400).json({ error: "Pad ID is required." });
        }

        ensureDocExists(padId, function (err) {
            if (err) {
                return res.status(500).json({ error: "Failed to create or fetch pad." });
            }
            res.status(200).json({ message: "Pad is ready.", padId });
        });
    });

    var server = http.createServer(app);
    var wss = new WebSocket.Server({ server: server });
    wss.on('connection', function (ws, req) {
        const urlParams = new URLSearchParams(req.url.split('?')[1]);
        const padId = urlParams.get('padId');

        if (!padId) {
            console.error("WebSocket connection missing padId.");
            ws.close();
            return;
        }

        ensureDocExists(padId, function (err) {
            if (err) {
                console.error(`Error ensuring document ${padId} exists:`, err);
                ws.close();
                return;
            }

            console.log(`WebSocket connected for padId: ${padId}`);
            var stream = new WebSocketJSONStream(ws);
            backend.listen(stream);
        });
    });

    server.listen(8081); 
    console.log('ShareDB server listening on '+process.env.EXPRESS_BASE_URL);
}

startServer();
