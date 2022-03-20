"use strict"

/**
 * Dependencies:
 */
const WebSocket = require('ws')
const uuid = require('uuid')
const EventEmitter = require('events')

/**
 * Append zero to length.
 * @param {string} value Value to append zero.
 * @param {number} length Needed length.
 * @returns {string} String with appended zeros id need it.
 */
function appendZeroToLength(value, length) {
    return `${value}`.padStart(length, '0');
}

/**
 * Get date as text.
 * @returns {string} Date as text. Sample: "2018.12.03, 07:32:13.0162 UTC".
 */
function getDateAsText() {
    const now = new Date();
    const nowText = appendZeroToLength(now.getUTCFullYear(), 4) + '.'
        + appendZeroToLength(now.getUTCMonth() + 1, 2) + '.'
        + appendZeroToLength(now.getUTCDate(), 2) + ', '
        + appendZeroToLength(now.getUTCHours(), 2) + ':'
        + appendZeroToLength(now.getUTCMinutes(), 2) + ':'
        + appendZeroToLength(now.getUTCSeconds(), 2) + '.'
        + appendZeroToLength(now.getUTCMilliseconds(), 4) + ' UTC';
    return nowText;
}

/**
 * TiingoStream
 *
 * this class takes the url, tickers and threshold level and connects
 * to Tiingo WebSocket API server and provides real time data
 *
 * Also, if provided additional parameters the class will handle reconnection
 * and "ensure" data continuity
 */
class TiingoStream extends EventEmitter {

    WEBSOCKET_ENDPOINTS = [
        "wss://api.tiingo.com/fx",
        "wss://api.tiingo.com/crypto",
        "wss://api.tiingo.com/iex"
    ]

    constructor(url, token, thresholdLevel, tickers, {
        verbose = false,
        dataFormat = "json",
        reconnect = true,
        minimumReconnectionDelay = 1000,
        reconnectionAttempts = 100
    } = {
            verbose: false,
            dataFormat: "json",
            reconnect: true,
            minimumReconnectionDelay: 1000,
            reconnectionAttempts: 100
        }) {
        super()

        if (url !== undefined && (typeof url === "string" || url instanceof String)) {
            if (this.WEBSOCKET_ENDPOINTS.includes(url)) {
                this.url = url
                if (typeof token === "string" || token instanceof String) {
                    this.token = token
                } else {
                    throw new Error("token is not a valid string")
                }
                if (typeof thresholdLevel === "number" || thresholdLevel instanceof Number) {
                    this.thresholdLevel = thresholdLevel
                } else {
                    throw new Error("thresholdLevel is not a valid number")
                }
                if (Array.isArray(tickers)) {
                    this.tickers = tickers
                } else {
                    throw new Error("tickers is not a valid array")
                }
                if (typeof verbose === "boolean" || verbose instanceof Boolean) {
                    this.verbose = verbose
                } else {
                    throw new Error("verbose is not a valid boolean value")
                }
                if (typeof dataFormat === "string" || dataFormat instanceof String) {
                    if (["csv", "json"].includes(dataFormat)) {
                        this.dataFormat = dataFormat
                    } else {
                        throw new Error("dataFormat does not match any valid option")
                    }
                } else {
                    throw new Error("dataFormat is not a valid string")
                }
                if (typeof reconnect === "boolean" || reconnect instanceof Boolean) {
                    this.reconnect = reconnect
                } else {
                    throw new Error("reconnect is not a valid boolean value")
                }
                if (typeof minimumReconnectionDelay === "number" || minimumReconnectionDelay instanceof Number) {
                    this.minimumReconnectionDelay = minimumReconnectionDelay
                } else {
                    throw new Error("minimumReconnectionDelay is not a valid number")
                }
                if (typeof reconnectionAttempts === "number" || reconnectionAttempts instanceof Number) {
                    this.reconnectionAttempts = reconnectionAttempts
                } else {
                    throw new Error("reconnectionAttempts is not a valid number")
                }
                this.connected = false
                this.activeConnectionAttempt = false
                this.connectionTimestamp = 0
                this.lastHeartbeat = 0
            } else {
                throw new Error("url does not match any valid websocket endpoint")
            }
        } else {
            throw new Error("url is not a valid string")
        }
    }

    connect() {
        let connectionAttempt = new Promise((resolve, reject) => {
            if (!this.connected) {
                if (!this.activeConnectionAttempt) {
                    this.activeConnectionAttempt = true
                    this.socket = new WebSocket(this.url)
                    this.socket.on("open", () => {
                        this.socket.send(JSON.stringify({
                            eventName: "subscribe",
                            authorization: this.token,
                            dataFormat: this.dataFormat,
                            eventData: {
                                thresholdLevel: this.thresholdLevel,
                                tickers: this.tickers
                            }
                        }))
                    })
                    this.socket.on("message", packet => {
                        packet = JSON.parse(packet)
                        if (packet.messageType === "I") {
                            if (packet.response.code === 200) {
                                this.connected = true
                                this.activeConnectionAttempt = false
                                this.connectionTimestamp = new Date().getTime()
                                this.streamId = uuid.v4()
                                this.socket.removeAllListeners("message")
                                this._initHealthCheck(this.streamId)
                                this._onClose()
                                this._onError()
                                if (this.verbose) {
                                    console.log(`${getDateAsText()} -> [${this.streamId}] [MESSAGE] Socket connected successfully`)
                                }
                                resolve(null)
                            } else {
                                reject(`${getDateAsText()} -> [${this.streamId}] [ERR] ${packet.response.message}`)
                            }
                        } else if (packet.messageType === "E") {
                            reject(`${getDateAsText()} -> [${this.streamId}] [ERR] ${packet.response.message}`)
                            process.exit()
                        }
                    })
                } else {
                    if (this.verbose) {
                        console.log(`${getDateAsText()} -> [MESSAGE] No action taken, a connection attempt is processing`)
                    }
                    resolve(null)
                }
            } else {
                if (this.verbose) {
                    console.log(`${getDateAsText()} -> [${this.streamId}] [MESSAGE] No action taken, the socket is already connected`)
                }
                resolve(null)
            }
        })
        this.connectionPromise = connectionAttempt
        return connectionAttempt
    }

    async getTicks({
        json = false,
        attachSessionId = false
    } = {
            json: false,
            attachSessionId: false
        }) {

        if ((typeof json === "boolean" || json instanceof Boolean) && (typeof attachSessionId === "boolean" || attachSessionId instanceof Boolean)) {
            if (await this.connectionPromise === null || this.connected) {
                if (arguments[arguments.length - 1] && typeof arguments[arguments.length - 1] === "function") {
                    this.socket.on("message", packet => {
                        packet = JSON.parse(packet)
                        if (packet.messageType === "A") {
                            if (attachSessionId) {
                                packet.data.push(this.streamId)
                            }
                            if (json) {
                                arguments[arguments.length - 1](packet.data)
                            } else {
                                arguments[arguments.length - 1](JSON.stringify(packet.data))
                            }
                        }
                    })
                    this.on("reconnectionAttempt", () => {
                        this.socket.removeAllListeners("message")
                    })
                    this.on("reconnectionSuccess", () => {
                        this.socket.on("message", packet => {
                            packet = JSON.parse(packet)
                            if (packet.messageType === "A") {
                                if (attachSessionId) {
                                    packet.data.push(this.streamId)
                                }
                                if (json) {
                                    arguments[arguments.length - 1](packet.data)
                                } else {
                                    arguments[arguments.length - 1](JSON.stringify(packet.data))
                                }
                            }
                        })
                    })
                }
            }
        } else {
            throw new Error("Additional parameters must be valid boolean values")
        }
    }

    async close() {
        if (await this.connectionPromise === null || this.connected) {
            this.connected = false
            this.socket.close()
        }
    }

    isConnected() {
        return this.connected

    }

    _initHealthCheck(id) {
        let initId = id
        this.socket.on("message", packet => {
            packet = JSON.parse(packet)
            if (packet.messageType === "H") {
                if (initId === this.streamId) {
                    if (this.verbose) {
                        console.log(`${getDateAsText()} -> [${this.streamId}] [MESSAGE] Heartbeat received`)
                    }
                    if (this.lastHeartbeat === 0) {
                        this.lastHeartbeat = new Date().getTime()
                        this._checkHealth(initId)
                    } else {
                        this.lastHeartbeat = new Date().getTime()
                    }
                }
            }
        })
    }

    _checkHealth(id) {
        let initId = id,
            init = this.lastHeartbeat
        setTimeout(() => {
            if (initId === this.streamId) {
                if (init !== this.lastHeartbeat) {
                    if (this.verbose) {
                        console.log(`${getDateAsText()} -> [${this.streamId}] [MESSAGE] Heartbeat updated`)
                    }
                    this._checkHealth(initId)
                } else {
                    if (this.verbose) {
                        console.log(`${getDateAsText()} -> [${this.streamId}] [MESSAGE] Heartbeat stopped`)
                    }
                    this.close()
                }
            }
        }, 120000 + parseInt(120000 * (Math.random() * (0.25 - 0.1) + 0.1)))
    }

    async _reconnect() {
        if (!this.connected && this.reconnect) {
            if (this.reconnectionAttempts > 0) {
                if (this.verbose) {
                    console.log(`${getDateAsText()} -> [${this.streamId}] [MESSAGE] Reconnection request has been placed`)
                }
                if (this.socket.readyState !== this.socket.CLOSED) {
                    this.close()
                    this.emit("reconnectionAttempt")
                }
                this.lastHeartbeat = 0
                let tmp = this.reconnectionAttempts
                while (this.reconnectionAttempts > 0) {
                    this.reconnectionAttempts--
                    let err = await this.connect()
                    if (err) {
                        if (this.verbose) {
                            console.log(`${getDateAsText()} -> [${this.streamId}] [MESSAGE] Reconnection failed; reconnection attemps left ${this.reconnectionAttempts}`)
                        }
                        setTimeout(() => {
                            this._reconnect()
                        }, this.minimumReconnectionDelay + parseInt(this.minimumReconnectionDelay * (Math.random() * (0.2 - 0.1) + 0.1)))
                    } else {
                        this.emit("reconnectionSuccess")
                        this.reconnectionAttempts = tmp
                        break;
                    }
                }
                if (this.reconnectionAttempts === 0) {
                    if (this.verbose) {
                        console.log(`${getDateAsText()} -> [${this.streamId}] [MESSAGE] No reconnect reconnection attemps left`)
                    }
                    process.exit()
                }
            } else {
                if (this.verbose) {
                    console.log(`${getDateAsText()} -> [${this.streamId}] [MESSAGE] No reconnect reconnection attemps left`)
                }
                process.exit()
            }
        }
    }

    async _onError() {
        if (await this.connectionPromise === null || this.connected) {
            this.socket.on('error', payload => {
                this.connected = false
                if (this.verbose) {
                    console.log(`${getDateAsText()} -> [${this.streamId}] [ERR] ${payload}`)
                }
                this.close()
                this._reconnect()
            })
        }
    }

    async _onClose() {
        if (await this.connectionPromise === null || this.connected) {
            this.socket.on('close', payload => {
                this.connected = false
                if (this.verbose) {
                    console.log(`${getDateAsText()} -> [${this.streamId}] [CLOSE] Socket closed`)
                }
                this._reconnect()
            })
        }
    }
}

/**
 * Module exports:
 */
module.exports = TiingoStream