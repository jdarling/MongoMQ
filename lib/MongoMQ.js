var mongodb = require('mongodb');

var E_NOTLISTENING = 'Queue interface not started!';
var E_INVALIDHANDLER = 'Must provide a valid function as handler!';

var startListener = function(passive, collection, filter, handler, endHandler){
  if(typeof(handler)!=='function') throw E_INVALIDHANDLER;
  var cursor = collection.find(filter, {tailable: true}), 
      _cursor = {
          stop: function(){
            cursor.close(function(callback){
              if(endHandler) endHandler(_cursor, callback);
            });
          },
          start: function(){},
          raw: function(){
            return cursor;
          }
        };
  _cursor.__defineGetter__('handler', function(){
    return handler;
  });
  if(filter.event){
    _cursor.__defineGetter__('event', function(){
      return filter.event;
    });
  }else{
    _cursor.__defineGetter__('event', function(){
      return '*';
    });
  }
  _cursor.__defineGetter__('active', function(){
    return true;
  });
  var next,
      callHandler = function(err, msg){
        handler(err, msg?msg.data:false, next);
      };
  if(passive){
    next = function(closeCursor){
      closeCursor = closeCursor || (!collection.db.openCalled);
      if(!closeCursor){
        cursor.nextObject(callHandler);
      }else{
        cursor.close(function(){
          if(endHandler) endHandler(_cursor);
        });
      }
    };
  }else{
    next = function(closeCursor){
      closeCursor = closeCursor || (!collection.db.openCalled);
      if(!closeCursor){
        cursor.nextObject(function(err, msg){
          if(msg){
            collection.findAndModify((msg&&msg.length>0)?msg[0]:msg, {emitted: -1}, {$set: {handled: true}}, {},
              function(err, data){
                if(!data) next();
                else callHandler(err, data);
              });
          }else next();
        });
      }else{
        cursor.close(function(){
          if(endHandler) endHandler(_cursor);
        });
      }
    };
  }
  next();
  return _cursor;
};

var createCollection = function(db, collectionName, collectionSize, callback){
  db.dropCollection(collectionName, function(){
    db.createCollection(collectionName, {
      capped : true,
      autoIndexId : true,
      size : collectionSize
    }, function(err, collection){
      if(collection) collection.insert({ignore: 'This works around the bug in mongo-native where capped collections must have at least 1 record before you can setup a tailed cursor.'});
      callback(err, collection);
    });
  });
};

var openQueue = function(db, collectionName, collectionSize, callback){
  var checkDoCreate = function(createColl, collection){
    if(createColl) createCollection(db, collectionName, collectionSize, callback);
    else callback(null, collection);
  };
  db.collection(collectionName, {safe: true}, function(err, collection){
    if(err&&collection) throw err;
    if(collection){
      collection.isCapped(function(err, isCapped){
        checkDoCreate(!isCapped, collection);
      });
    }else{
      createCollection(db, collectionName, collectionSize, callback);
    }
  });
};

var MongoMQ = exports.MongoMQ = function(options, callback){
  var self = this, listeners = [];
  options = options || {};
  self.mqCollectionName = options.mqCollectionName||'queue';
  self.mqDB = options.mqDB||options.db||'MongoMQ';
  self.__defineGetter__('listeners', function(){
    return listeners;
  });
  if(!(options.host||options.servers)) options.host = 'localhost';
  options.db = self.mqDB;
  self.collectionSize = options.collectionSize||100000000;
  self.listening = false;
  self.options = options;
  if(options.autoStart||(typeof(options.autoStart)=='undefined')) self.start(callback);
  else if(typeof(callback)=='function') callback(null, self);
};

MongoMQ.prototype.start = function(callback){
  var self = this;
  var defaultServerOptions = {auto_reconnect: true};
  
  if(self.listening){
    if(typeof(callback)=='function') callback(null, self);
  }else{  
    var open = function(p_db, mqDB, collectionSize){
      openQueue(p_db, mqDB, collectionSize, function(err, collection){
        self.collection = collection;
        self.listening = true;
        if(self.listeners.length){
          var l = self.listeners.length;
          for(i = 0; i<l; i++){
            self.listeners[i].start();
          }
        }
        if(typeof(callback)=='function') callback(null, self);
      });
    };
    
    options = self.options;
    if(options.servers instanceof Array){
      var servers = [], host, port, serverOptions, l = options.servers.length;
      for(var i = 0; i<l; i++){
        if(typeof(options.servers[i])=='string'){
          host = options.servers[i];
          port = mongodb.Connection.DEFAULT_PORT;
          serverOptions = options.serverOptions||defaultServerOptions;
        }else{
          host = options.servers[i].host||options.host||'localhost';
          port = options.servers[i].port||options.port||mongodb.Connection.DEFAULT_PORT;
          serverOptions = options.servers[i].serverOptions||options.serverOptions||defaultServerOptions;
        }
        servers.push(new mongodb.Server(host, port, options));
      }
      self.server = new mongodb.ReplSetServers(servers);
    }else self.server = new mongodb.Server(options.host||'localhost', options.port||mongodb.Connection.DEFAULT_PORT, options.serverOptions||defaultServerOptions);
    var db = self.dbConnection = new mongodb.Db(options.db, self.server, options.dbOptions||{native_parser:(options.nativeParser==null?false:options.nativeParser)});
    db.open(function(err, p_db){
      self.p_db = p_db;
      if(options.username&&options.password){
        db.admin(function(err, adminDb){
          adminDb.authenticate(options.username, options.password, function(err, result){
            if(result){
              open(p_db, self.mqDB, self.collectionSize);
            }else{
              self.p_db.close();
              delete self.p_db;
              self.listening = false;
            }
          });
        });
      }else{
        open(p_db, self.mqDB, self.collectionSize);
      }
    });
  }
};

MongoMQ.prototype.stop = function(callback){
  var self = this;
  if(self.listening){
    self.p_db.close(true, function(){
      delete self.p_db;
      self.listening = false;
      var l = self.listeners.length;
      for(var i = l-1; i>-1; i--){
        if(self.listeners[i].active){
          self.listeners[i].stop();
        }
      }
      if(typeof(callback)=='function') callback(null, self);
    });
  }else{
    if(typeof(callback)=='function') callback(null, self);
  }
};

MongoMQ.prototype.emit = function(msgType, data, partialCallback, completeCallback){
  var self = this;
  if(!self.listening) throw E_NOTLISTENING;
  var msgPkt = {
      event: msgType,
      data: data,
      handled: false,
      emitted: new Date()
    };
  self.collection.insert(msgPkt, function(){});
};

var getEventPlaceholder = function(self, msgType, options, handler){
  var placeholder = {
        stop: function(callback){
          if(typeof(callback)=='function') callback(self.indexOfListener(msgType, handler));
        }
      };
  if(msgType=='*'){
    placeholder.start=function(){
      self.onAny(handler);
    };
  }else{
    placeholder.start=function(){
      self.on(msgType, options, handler);
    };
  }
  placeholder.__defineGetter__('options', function(){
    return options;
  });
  placeholder.__defineGetter__('handler', function(){
    return handler;
  });
  placeholder.__defineGetter__('event', function(){
    return msgType;
  });
  placeholder.__defineGetter__('active', function(){
    return false;
  });
  return placeholder;
};

MongoMQ.prototype.on = function(msgType, options, handler){
  var self = this;
  if(self.listening){
    var filter = {event: msgType, handled: false};
    if(typeof(options)=='function'){
      handler = options;
      options = {passive: false};
    }
    if(typeof(options)=='boolean') options = {passive: options};
    if(options.hereOnOut) filter.emitted = {$gte: new Date()};
    var listener = startListener(options.passive, self.collection, filter, handler, function(listener, callback){
      var idx;
      if((idx = self.indexOfListener(msgType, handler))>-1){
        self.listeners[idx] = getEventPlaceholder(self, msgType, handler);
      }
      if(typeof(callback)=='function') callback(idx);
    });
  }else{
    var listener = getEventPlaceholder(self, msgType, options, handler);
  }
  var idx;
  if((idx = self.indexOfListener(msgType, handler)) == -1) self.listeners.push(listener);
  else self.listeners[idx] = listener;
};

MongoMQ.prototype.onAny = function(handler){
  var self = this;
  if(self.listening){
    var filter = {emitted: {$gte: new Date()}};
    var listener = startListener(true, self.collection, filter, handler, function(listener){
      var idx;
      if((idx = self.indexOfListener('*', handler))>-1){
        self.listeners[idx] = getEventPlaceholder(self, '*', handler);
      }
      if(typeof(callback)=='function') callback(idx);
    });
  }else{
    var listener = getEventPlaceholder(self, '*', {}, handler);
  }
  var idx;
  if((idx = self.indexOfListener('*', handler)) == -1) self.listeners.push(listener);
  else self.listeners[idx] = listener;
};

MongoMQ.prototype.indexOfListener = function(event, handler){
  var self = this, l = self.listeners.length;
  if(typeof(event)=='function'){
    handler = event;
    event = false;
  }
  if(!(event||handler)) return false;
  var found = false, listener;
  for(var i = 0; i<l; i++){
    found = false;
    listener = self.listeners[i];
    if(event) found = (event==listener.event)||(listener.event=='*');
    if(handler) found = found && listener.handler == handler;
    if(found) return i;
  }
  return -1;
};

MongoMQ.prototype.getListenerFor = function(event, handler){
  var self = this, idx = self.indexOfListener(event, handler);
  if(idx){
    return self.listeners[idx];
  }
  return false;
};

MongoMQ.prototype.removeListener = function(event, handler){
  var self = this, idx = self.indexOfListener(event, handler);
  if((idx!==false)&&idx>-1){
    if(self.listeners[idx].active){
      self.listeners[idx].stop(function(idx){
        if(idx>-1) self.listeners.splice(idx, 1);
      });
    }else{
      self.listeners.splice(idx, 1);
    }
    return true;
  }
  return false;
};

MongoMQ.prototype.removeListeners = function(event){
  var self = this, l = self.listeners.length, numRemoved = 0;
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
      self.listeners[i].stop(function(idx){
          if(idx>-1) self.listeners.splice(idx, 1);
        });
      numRemoved++;
    }
  }
  return numRemoved;
};

MongoMQ.prototype.removeAllListeners = function(){
  var self = this, l = self.listeners.length;
  for(var i = l-1; i>-1; i--){
    self.listeners[i].stop(function(idx){
        if(idx>-1) self.listeners.splice(idx, 1);
      });
  }
  return true;
};

