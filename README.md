# Tiingo-Stream

## Description
This package has made possible:
* Easily connecting to any Tiingo Websocket endpoint
* Reconnecting (both after server-side restarts or client-side network problems)
* Get feedback from the Websocket session with the endpoint (using the _verbose_ parameter)

## Installation
```bash
npm i tiingo-stream
```

## Getting started

```javascript
/**
 * Dependencies:
 */
const TiingoStream = require('../tiingo-stream')

/**
 * Config:
 */
const TIINGO_ENDPOINT = "tiingo_websocket_endpoint"
const TIINGO_TOKEN = "your_token"
const THRESHOLD = 2 // different values for each endpoint
const SYMBOLS = ["*"] // all

const feed = new TiingoStream(TIINGO_ENDPOINT, TIINGO_TOKEN, THRESHOLD, SYMBOLS, {
    verbose: true
})

feed.connect()

feed.getTicks(data => {
    console.log(data)
})
```