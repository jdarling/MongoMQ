var MC = require('./MongoConnection');
var UUID = require('node-uuid');
var util = require('util');
var Options = require('./options');
var hostName = require('os').hostname();
var QueueMonitor = require('./QueueMonitor');

var defaults = {
  autoStart: true,
  queueCollection: 'queue'
};

var MongoMQ = module.exports = function(options, callback){
  var self = this, mcOptions;
  if(typeof(options)==='function'){
    callback = options;
    options = {};
  }
  callback=callback||function(){};
  options = options||{};
  options.databaseName=options.databaseName||options.database;
  options.queueCollection=options.queueCollection||options.collectionName;
  options = Options.ensure(options, defaults);

  mcOptions = Options.ensure(mcOptions, options);
  mcOptions.autoStart = false;
  
  MC.call(self, options);

  self.monitors={};
  self.emitter.surface(['ready', 'stopped']);
  
  if(options.autoStart){
    self.start(callback);
  }else{
    callback(null, self);
  }
};

util.inherits(MongoMQ, MC);

MongoMQ.options = defaults;

MongoMQ.prototype.checkConnection = function(callback){
  var self = this;
  var waitForStarted = function(){
    process.nextTick(function(){
      setTimeout(function(){
        if(self.isopen){
          callback(null, self);
        }else{
          waitForStarted();
        }
      }, 100);
    });
  };
  if(self.isopen){
    callback(null, self);
  }else if(self.options.autoStart){
    waitForStarted();
  }else{
    callback(new Error(errors.E_CONNCLOSED));
  }
};
MongoMQ.prototype.checkConnection.description = 'Checks to see if MongoMQ is connected to a server or not.';

MongoMQ.prototype.start = function(callback){
  var self = this;
  if(self.isopen){
    (callback||function(){})(null, self);
  }else{
    self.open(function(err){
      if(err){
        self.close();
        self._open = false;
        (callback||function(){})(err);
        self.emitter.call('error', err);
      }else{
        self.ensureCapped(self.options.queueCollection, function(err, collection){
          if(!self.emitter.checkNoError(err, callback)){
            self.close();
            self._open = false;
          }else{
            self.startListeners(function(){
              var startTime = new Date();
              self.serverStatus(function(err, status){
                if(self.emitter.checkNoError(err, callback)){
                  self.serverTimeOffset = status.localTime - startTime;
                  (callback||function(){})(err, self);
                  self.emitter.call('ready', err);
                }
              });
            });
          }
        });
      }
    });
  }
};
MongoMQ.prototype.start.description = 'Starts the Mongo Queue system.';

MongoMQ.prototype.stop = function(callback){
  var self = this;
  if(self.isopen){
    self.stopListeners(function(){
      self.close(function(){
        self.emitter.call('stopped');
        self._open = false;
        (callback||function(){})(null, self);
      });
    });
  }else{
    (callback||function(){})(null, self);
    self.emitter.call('stopped');
  }
};
MongoMQ.prototype.start.description = 'Stops the Mongo Queue system.';

MongoMQ.prototype.emit = function(event, message, callback){
  var self = this, hasCallback = typeof(callback)==='function';
  self.checkConnection(function(err){
    if(err){
      self.emitter.call('error', err);
      if(typeof(callback)==='function'){
        return callback(err);
      }else{
        throw err;
      }
    }
    self.collection(self.options.queueCollection, function(err, collection){
      var dt = new Date(), 
          pkt = {
            pkt_ver: 3,
            event: event,
            data: message,
            handled: false,
            localTime: dt,
            globalTime: new Date(dt-self.serverTimeOffset),
            pickedTime: new Date(dt-self.serverTimeOffset),
            host: hostName
          };
      if(hasCallback){
        pkt.response_id = UUID.v4(); // new way
        if(self.options.support_v2){
          pkt.conversationId = UUID.v4(); // old way
        }
      }
      collection.insert(pkt, {w: 1}, function(err, details){
        self.emitter.call('sent', details);
        if(!err){
          if(hasCallback){
            self.once(pkt.response_id, {listenerType: 'responseListener'}, callback);
          }
        }else{
          //err = err instanceof Error?err:new Error(err);
          self.emitter.call('error', err);
          if(hasCallback){
            callback(err);
          }else{
            throw err;
          }
        }
      });
    });
  });
};
MongoMQ.prototype.emit.description = 'Puts a message on the queue.';

MongoMQ.prototype.broadcast = function(event, message){
  var self = this;
  self.checkConnection(function(err){
    if(err){
      self.emitter.call('error', err);
      throw err;
    }
    self.collection(self.options.queueCollection, function(err, collection){
      var pkt = {
        event: event,
        data: message,
        localTime: new Date(),
        host: hostName
      };
      collection.insert(pkt, {w: 0});
    });
  });
};
MongoMQ.prototype.broadcast.description = 'Broadcasts a message out across all subscribed listeners.';

MongoMQ.prototype.status = function(callback){
  var self = this;
  if(self.isopen){
    self.checkConnection(function(err){
      if(err){
        self.emitter.call('error', err);
        if(typeof(callback)==='function'){
          return callback(err);
        }else{
          throw err;
        }
      }
      var map = function(){
        emit(this.event, 1); 
      };
      var reduce = function(key, values){
        var reduced = 0;
        values.forEach(function(val){
          reduced += val;
        });
        return reduced;
      };
      self.collection(self.options.queueCollection, function(err, collection){
        if(err){
          self.emitter.call('error', err);
          callback(err);
        }else{
          collection.mapReduce(map, reduce, {
            query : { "handled" : false },
            out : { inline : 1 }
          }, callback);
        }
      });
    });
  }else{
    callback(null, false);
  }
};
MongoMQ.prototype.status.description = 'Retrieves the MongoMQ queue stati and their depth.';

MongoMQ.prototype.startListeners = function(callback){
  var self = this, eventNames = Object.keys(self.monitors), i, l=eventNames.length, detailItems, j, k;
  for(i=0; i<l; i++){
    detailItems = self.monitors[eventNames[i]];
    k = detailItems.length;
    for(j=0; j<k; j++){
      self.on(eventNames[i], detailItems[j].options, detailItems[j].callback);
    }
  }
  callback(null, self);
};
MongoMQ.prototype.startListeners.description = 'Starts the queue listeners that have not yet been started.';

MongoMQ.prototype.stopListeners = function(callback){
  var self = this, eventNames = Object.keys(self.monitors), i, l=eventNames.length, detailItems, j, k, toStop=0;
  var checkStopped = function(){
    if(toStop<=0){
      callback(null, self);
    }else{
      process.nextTick(checkStopped);
    }
  };
  
  for(i=0; i<l; i++){
    detailItems = self.monitors[eventNames[i]];
    k = detailItems.length;
    toStop = k;
    for(j=0; j<k; j++){
      if(detailItems[j].monitor){
        detailItems[j].monitor.stop(function(){
          toStop--;
        });
      }else{
        toStop--;
      }
    }
  }
  checkStopped();
};
MongoMQ.prototype.stopListeners.description = 'Stops the queue listeners that have not yet been stopped.';

MongoMQ.prototype.on = MongoMQ.prototype.addListener = function(event, options, callback){
  var self = this;
  var list = self.monitors[event]=self.monitors[event]||[], i, l=list.length, index=false;
  if(typeof(options)==='function'){
    callback = options;
    options = {};
  }
  options=options||{};
  for(i=0; (i<l)&&(index===false); i++){
    if(list[i].callback === callback){
      index = i;
    }
  }
  if(index===false){
    index = list.length;
    list.push({options: options, callback: callback});
  }
  if(self.isopen){
    if(!list[index].monitor){
      list[index].monitor = new QueueMonitor(self, event, options, callback);
    }else{
      list[index].monitor.start();
    }
  }
};
MongoMQ.prototype.on.description = 'Adds a listener for a specific event.';

MongoMQ.prototype.once = function(event, options, callback){
  var self = this;
  if(typeof(options)==='function'){
    callback = options;
    options = {};
  }
  options=options||{};
  var monitor = new QueueMonitor(self, event, options, function(err, response, next){
    if(err){
      self.emitter.call('error', err);
    }
    (callback||function(){})(err, response);
    monitor.stop();
    if(next){
      next();
    }
  });
};
MongoMQ.prototype.once.description = 'Adds a one time listener for a specific event.';

MongoMQ.prototype.removeListener = function(event, callback){
  var self = this;
  var list = self.monitors[event]=self.monitors[event]||[], i, l=list.length, listener;
  for(i=0; i<l; i++){
    if(list[i].callback === callback){
      listener = list.splice(i, 1);
      listener.stop();
      return listener;
    }
  }
  return false;
};
MongoMQ.prototype.removeListener.description = 'Stops and removes a specific listener from the event.';

MongoMQ.prototype.removeAllListeners = function(event){
  var self = this;
  var list = self.monitors[event]=self.monitors[event]||[], i, l=list.length, listener;
  for(i=l; i>-1; i--){
    listener = list[i].stop();
  }
  self.monitors[event]=[];
};
MongoMQ.prototype.removeAllListeners.description = 'Stops and removes all listeners for a specific event.';

MongoMQ.prototype.setMaxListeners = false;

MongoMQ.prototype.listeners = function(event){
  var self = this;
  var list = self.monitors[event]=self.monitors[event]||[];
  return list;
};
MongoMQ.prototype.listeners.description = 'Returns a listing of listeners and their options for a given event.';
