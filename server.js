"use strict";

var express = require('express'),
    apiApp  = require('./')

var app = module.exports = express();

// Make dev easier
app.use(express.logger('dev'));
app.use(express.errorHandler());
app.use(express.favicon());

// Use vhost to route to the correct app
app.use( '/api', apiApp );

// Handle everything else as a 404
app.use(function (req, res) {
  res.send(
    'page not found - try <a href="/api">/api</a>',
    404
  );
});

app.listen(3000);
console.log('listening on http://0.0.0.0:3000');
