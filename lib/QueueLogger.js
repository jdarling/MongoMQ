var MongoConnection = require('./MongoConnection');
var MongoMQ = require('./MongoMQ');
var Logger = require('logger');
var util = require('util');
var Options = require('options');
var hostName = require('os').hostname();
var appName = process.argv[1];

var defaults = {
  loggingCollection: 'mongomq_log',
};

var QueueLogger = module.exports = function(bindTo, options){
  var self = this;
  self.options = Options.ensure(options||{}, defaults);
  self.bindTo = bindTo;
  Logger.call(self, self.options);
};

QueueLogger.prototype.init = function(){
  options = Options.ensure(self.options, self.bindTo.options);
  if(options.logger){
    options.logger = false;
  }
  new MongoConnection(options, function(err, db){
    if(err){
      throw err;
    }else{
      self.db = db;
      self.bindTo.eventer.on('recieved', function(){
        self.messageRecieved.apply(self, arguments);
      });
      self.bindTo.eventer.on('sent', function(){
        self.messageSent.apply(self, arguments);
      });
    }
  });
};

QueueLogger.prototype.stop = function(){
  if(self.db){
    self.db.close();
    self.db = false;
  }
};

Logger.prototype.write = function(force){
  var self = this;
  var startAt = 1, args = Array.prototype.slice.apply(arguments), i, l = args.length, msg = '';
  if(typeof(force)!=='boolean'){
    startAt--;
    force = false;
  }
  args = args.splice(startAt, args.length);
  if(self.db){
    self.db.collection(self.options.loggingCollection, function(err, collection){
      if(collection){
        collection.insert({
          message: args
        }, {w: 0});
      }
    });
  }
};

QueueLogger.prototype.messageRecieved = function(msg){
  if(self.db){
    self.db.collection(self.options.loggingCollection, function(err, collection){
      if(collection){
        collection.insert({
          got: msg.event,
          host: hostName,
          app: appName,
          from: msg.host,
          msg_id: msg._id,
          message: msg
        }, {w: 0});
      }
    });
  }
};
QueueLogger.prototype.messageRecieved.description = 'Used to record when a message gets recieved.';

QueueLogger.prototype.messageSent = function(msg){
  if(self.db){
    self.db.collection(self.options.loggingCollection, function(err, collection){
      if(collection){
        collection.insert({
          sending: msg.event,
          host: hostName,
          app: appName,
          msg_id: msg._id,
          message: msg
        }, {w: 0});
      }
    });
  }
};
QueueLogger.prototype.messageSent.description = 'Used to record when a message gets sent.';
