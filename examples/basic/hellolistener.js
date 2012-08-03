var MongoMQ = require('../../lib/MongoMQ').MongoMQ;
var util = require('util');

var HelloListener = exports.HelloListener = function(options){ // Create a new MongoMQ listener
  var self = this;
  MongoMQ.call(self, options); // Call the MongoMQ constructor
  self.on('hello', self.helloHandler); // Setup a listener
};

util.inherits(HelloListener, MongoMQ); // Make sure we inherit from MongoMQ

HelloListener.prototype.helloHandler = function(err, data, next){ // The actual handler
  var self = this;
  data = data||{};
  var name = data.name||'world';
  next('Hello '+name+'!', true); // Write the response and end the conversation
};