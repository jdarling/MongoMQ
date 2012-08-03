/*
  MongoMQ(<options>, <callback>):
    options:
      <mongoConnection>:
      <collectionName>:
      <servers[]>:
        <host>:
        <port>:
      <host>:
      <port>:
      <serverOptions>:
      <nativeParser>:
      <username>:
      <password>:
      <authenticateAgainstDb>:
      <collectionSize>:

  MongoMQ.start(callback):
  MongoMQ.stop(callback):
  MongoMQ.emit(msgType, data, partialCallback, completeCallback):
  MongoMQ.once(msgType, options, handler):
  MongoMQ.on(msgType, options, handler):
  MongoMQ.onAny(handler):
  MongoMQ.indexOfListener(event, handler):
  MongoMQ.getListenerFor(event, handler):
  MongoMQ.removeListener(event, handler):
  MongoMQ.removeListeners(event, handler):
  MongoMQ.removeAllListeners():
*/

var MC = require('./MongoConnection').MongoConnection;
var UUID = require('node-uuid');
var QueueListener = require('./QueueListener').QueueListener;
var hostName = require('os').hostname();

exports.MongoConnection = MC;

var defaults = {
      collectionName: 'queue',
      db: 'mongomq',
      collectionSize: 104857600,
      onOptions: {
          passive: false
        }
    };
var errors = {
      E_NOTLISTENING: 'Queue interface not started!',
      E_INVALIDHANDLER: 'Must provide a valid function as handler!',
      E_INVALIDEVENTTYPE: 'Must provide an event type!'
    };

var validateListenerArguments = function(msgType, options, handler){
  if(typeof(msgType)!=='string'&&(!(msgType instanceof RegExp))){
    throw errors.E_INVALIDEVENTTYPE;
  }
  if(typeof(options)==='function'){
    handler = options;
    options = {};
    var key;
    for(key in defaults.onOptions){
      options[key] = defaults.onOptions[key];
    }
  }else if(typeof(options)==='boolean'){
    options = {passive: options};
  }
  if(options.hereOnOut){
    options.after = new Date();
  }
  var selector = {};
  if(msgType!=='*'){
    selector.event = msgType;
  }else{
    options.after = options.after||new Date();
    options.passive = true;
  }
  if(options.after){
    selector.emitted = {$gte: options.after};
  }
  if(options.partialOnly){
    selector.partial = true;
  }
  if(options.completeOnly){
    selector.partial = false;
  }
  if(options.passive){
    selector.emitted = {$gte: options.after||new Date()};
  }else if(msgType!=='*'){
    selector.handled = false;
  }
  if(typeof(handler)!=='function'){
    throw E_INVALIDHANDLER;
  }
  return {options: options, handler: handler, selector: selector};
};

var MongoMQ = exports.MongoMQ = function(options, callback){
  var self = this;//, listening = false;
  if(typeof(options)==='function'){
    callback = options;
    options = {};
  }else{
    options = options || {};
  }
  var listeners = [], mongoConnection = options.mongoConnection;
  options.database = options.database||options.db||options.mqDB||defaults.db;
  options.collectionName = options.collectionName||options.mqCollectionName||defaults.collectionName;
  options.collectionSize = options.collectionSize||defaults.collectionSize;
  self.__defineGetter__('options', function(){
    return options;
  });
  self.__defineGetter__('listeners', function(){
    return listeners;
  });
  self.__defineGetter__('listening', function(){
    return mongoConnection.active;//&&listening;
  });
  self.__defineGetter__('mongoConnection', function(){
    return mongoConnection;
  });
  if(!mongoConnection){
    mongoConnection = new MC(options, callback);
  }
};

MongoMQ.prototype.start = function(callback){
  var self = this;
  var startListeners = function(err, collection){
        self.collection = collection;
        var l = self.listeners.length;
        for(var i = 0; i<l; i++){
          self.listeners[i].start();
        }
        if(typeof(callback)==='function'){
          callback(err, self);
        }
      };
  var ensureIndexes = function(err, collection){
        collection.ensureIndex({event: 1, handled: -1, emitted: 1, partial: -1}, {safe: true}, function(err, indexName){
          startListeners(err, collection);
        });
      };
  self.mongoConnection.open(function(err){
    if(!err){
      self.mongoConnection.ensureCappedCollection(self.options.collectionName, self.options.collectionSize, ensureIndexes);
    }else{
      if(typeof(callback)==='function'){
        callback(err);
      }else{
        throw err;
      }
    }
  });
};

MongoMQ.prototype.stop = function(callback){
  var self = this;
  var closeServer = function(){
    if(self.mongoConnection.active){
      self.mongoConnection.db.close(callback);
    }else{
      if(typeof(callback)==='function') callback();
    }
  }
  if(self.listening){
    var l = self.listeners.length;
    for(var i = 0; i<l; i++){
      self.listeners[i].stop();
    }
  }
  if(self.collection&&(typeof(self.collection.close)==='function')){
    self.collection.close(closeServer);
  }else{
    closeServer();
  }
};

MongoMQ.prototype.emit = function(msgType, data, partialCallback, completeCallback){
  var self = this;
  if(!self.listening){
    throw errors.E_NOTLISTENING;
  }else{
    if(typeof(msgType)!=='string'){
      throw errors.E_INVALIDEVENTTYPE;
    }
    var msgPkt = {
          event: msgType,
          data: data,
          handled: false,
          emitted: new Date(),
          partial: false,
          host: hostName
        };
    if(typeof(partialCallback)==='function'){
      (function(partialCallback, completeCallback){
        var results = false;
        var conversationId = msgPkt.conversationId = UUID.v4();
        var completeFilter = {event: conversationId, handled: false, partial: true, emitted: {$gte: msgPkt.emitted}};
        var completeTest = function(call_err, data, next){
              self.collection.find(completeFilter).count(function(err, count){
                  if(count>0){
                    process.nextTick(function(){
                      completeTest(call_err, data, next);
                    });
                  }else{
                    partialListener.stop();
                    completeCallback(call_err, data, next);
                  }
                });
              };
        var doComplete = function(err, data, next){
              completeTest(err, data, next);
            };
        if(typeof(completeCallback)!=='function'){
          completeCallback = partialCallback;
          results = [], errors = [];
          partialCallback = function(err, data, next){
            if(err) errors.push(err);
            results.push(data);
            next();
          };
          doComplete = function(err, data, next){
            if(err) errors.push(err);
            if(results.length>0){
              results.push(data);
            }else{
              results = data;
            }
            completeTest(errors.length>0?errors:null, results, next);
          };
        }
        var tmpOptions = validateListenerArguments(conversationId, {partialOnly: true, hereOnOut: true}, partialCallback);
        var partialListener = new QueueListener({
              event: conversationId,
              autoStart: true,
              mongoConnection: self.mongoConnection,
              collectionName: self.options.collectionName,
              handler: partialCallback,
              selector: tmpOptions.selector,
              passive: tmpOptions.options.passive
            });
        tmpOptions = validateListenerArguments(conversationId, {completeOnly: true, hereOnOut: true}, completeCallback);
        var completeListener = new QueueListener({
              event: conversationId,
              autoStart: true,
              mongoConnection: self.mongoConnection,
              collectionName: self.options.collectionName,
              handler: doComplete,
              selector: tmpOptions.selector,
              passive: tmpOptions.options.passive
            });
      })(partialCallback, completeCallback);
    }
    self.collection.insert(msgPkt, function(){});
  }
};

MongoMQ.prototype.once = function(msgType, options, handler){
  var self = this, tmpOptions = validateListenerArguments(msgType, options, handler);
  var idx = self.indexOfListener(msgType, handler), listener;
  listener = new QueueListener({
      event: msgType,
      autoStart: true,
      mongoConnection: self.mongoConnection,
      collectionName: self.options.collectionName,
      handler: function(err, data, next){
          tmpOptions.handler(err, data, function(){
            next(true);
          });
        },
      selector: tmpOptions.selector,
      passive: tmpOptions.options.passive
    });
  return listener;
};

MongoMQ.prototype.on = function(msgType, options, handler){
  var self = this, tmpOptions = validateListenerArguments(msgType, options, handler);
  if(typeof(options)=='function'){
    handler = options;
    options = {};
  }
  var idx = self.indexOfListener(msgType, handler), listener;
  if(idx===-1){
    listener = new QueueListener({
        event: msgType,
        autoStart: true,
        mongoConnection: self.mongoConnection,
        collectionName: self.options.collectionName,
        handler: tmpOptions.handler,
        selector: tmpOptions.selector,
        passive: tmpOptions.options.passive
      }, function(err, listener){
        self.listeners.push(listener);
      });
  }else{
    listener = self.listeners[idx];
    listener.start();
  }
  return listener;
};

MongoMQ.prototype.onAny = function(handler){
  return this.on('*', handler);
};

MongoMQ.prototype.indexOfListener = function(event, handler){
  var self = this, l = self.listeners.length;
  if(typeof(event)==='function'){
    handler = event;
    event = false;
  }
  if(!(event||handler)){
    return false;
  }
  var found = false, listener;
  for(var i = 0; i<l; i++){
    found = false;
    listener = self.listeners[i];
    if(event) found = (event===listener.event)||(listener.event==='*');
    if(handler) found = found && listener.handler === handler;
    if(found) return i;
  }
  return -1;
};

MongoMQ.prototype.getListenerFor = function(event, handler){
  var self = this, idx = self.indexOfListener(event, handler);
  if(idx&&idx>-1){
    return self.listeners[idx];
  }
  return false;
};

MongoMQ.prototype.removeListener = function(event, handler){
  var self = this, idx = self.indexOfListener(event, handler);
  var listenerStopped = function(err, listener){
    var idx = self.listeners.indexOf(listener);
    if((idx!==false)&&(idx>-1)){
      self.listeners.splice(idx, 1);
    }
  };
  if((idx!==false)&&(idx>-1)){
    self.listeners[i].stop(listenerStopped);
    return true;
  }
  return false;
};

MongoMQ.prototype.removeListeners = function(event, handler){
  var self = this, l = self.listeners.length, numRemoved = 0;
  var listenerStopped = function(err, listener){
    var idx = self.listeners.indexOf(listener);
    if((idx!==false)&&(idx>-1)){
      self.listeners.splice(idx, 1);
    }
  };
  if(typeof(event)=='function'){
    handler = event;
    event = false;
  }
  if(!(event||handler)) return false;
  var found = false, listener;
  for(var i = l; i>-1; i--){
    found = false;
    listener = self.listeners[i];
    if(event) found = (event==listener.event)||(listener.event=='*');
    if(handler) found = found && listener.handler == handler;
    if(found){
      listener.stop(listenerStopped);
      numRemoved++;
    }
  }
  return numRemoved;
};

MongoMQ.prototype.removeAllListeners = function(){
  try{
    var self = this, l = self.listeners.length;
    var listenerStopped = function(err, listener){
      var idx = self.listeners.indexOf(listener);
      if((idx!==false)&&(idx>-1)){
        self.listeners.splice(idx, 1);
      }
    };
    for(var i = l-1; i>-1; i--){
      self.listeners[i].stop(listenerStopped);
    }
    return true;
  }catch(e){
    return false;
  }
};
