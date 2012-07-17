var MC = require("./MongoConnection").MongoConnection;

var MongoMQ = exports.MongoMQ = function(options){
  var self = this;
  options = options || {};
  self.mqCollectionName = options.mqCollectionName||'queue';
  self.mqDB = options.mqDB||options.db||'MongoMQ';
  options.db = self.mqDB;
  self.collectionSize = options.collectionSize||100000000;
  self.handlers = [];
  self.listening = false;
  self.options = options;
  if(options.autoStart||(typeof(options.autoStart)=='undefined')) self.start();
};

MongoMQ.prototype.start = function(){
  var self = this;
  if(self.listening) return;
  var server = self.server = new MC(self.options, function(err, conn){
      if(err){
        console.log(err);
      }else{
        self.db = conn._db;
        self.db.collection(self.mqCollectionName, {safe: true}, function(err, collection){
          if(err){
            if(collection){
              throw err;
            }else{
              self.createCollection();
            }
          }else{
            self.startListening(collection);
          }
        });
      }
    });
};

MongoMQ.prototype.close = function(force, callback){
  var self = this;
  if(!self.listening) return;
  self.db.close(typeof(force)!=='undefined'?force:true, callback||function(){});
  self.collection = false;
  self.listening = false;
};

MongoMQ.prototype.createCollection = function(){
  var self = this;
  self.db.dropCollection(self.mqCollectionName, function(){
    self.db.createCollection(self.mqCollectionName, {
        capped: true,
        autoIndexId: true,
        size: self.collectionSize
      }, function(err, collection){
        self.startListening(collection);
      });
  });
};

MongoMQ.prototype.startListening = function(collection){
  var self = this;
  if(self.listening) return;
  collection = collection||self.db.collection(self.mqCollectionName, {safe: true});
  if(!collection) self.createCollection();
  else{
    collection.isCapped(function(err, isCapped){
      if(!isCapped) self.createCollection();
      else{
        self.collection = collection;
        self.listening = true;
        if(self.handlers.length>0){
          setTimeout(function(){
            var l = self.handlers.length, handler;
            for(var i = 0; i<l; i++){
              handler = self.handlers[i];
              if(handler.msgType){
                //self.nextMessage(self.handlers[i].msgType, self.handlers[i].passive, self.handlers[i].fromDT, self.handlers[i].callback);
                self.nextMessage(handler.msgType, handler.passive, handler.fromDT, handler.callback);
              }else{
                //startListener(self, {$and: [{emitted: {$gte: self.handlers[i].fromDT}}]}, true, self.handlers[i].callback);
                self.onAny(handler.callback);
              }
            }
          }, 5000);
        }
      }
    });
  }
};

var startListener = function(self, filter, isPassive, callback){
  console.log(filter);
  self.collection = self.collection||self.db.collection(self.mqCollectionName, {safe: true});
  callback = callback||function(){};
  var cursor = self.collection.find(filter, {tailable: true}), next;
  var doCallback = function(err, msg){
      callback(err, msg?msg.pkt:false, next);
    };
  if(isPassive){
    next = function(){
      if(self.listening) cursor.nextObject(doCallback);
    };
  }else{
    next = function(){
      cursor.nextObject(function(err, msg){
        if(self.collection) self.collection.findAndModify((msg&&msg.length)>0?msg[0]:msg, {emitted: -1}, {$set: {handled: true}}, {},
          function(err, data){
            if(err||(!data)){
              if(self.listening) next(); // someone else picked it up
            }else doCallback(err, data);
          });
      });
    };
  }
  next();
  return next;
};

MongoMQ.prototype.nextMessage = function(msgType, passive, fromDT, callback){
  var self = this, filter = {$and: [{msg: msgType}, {$or: [{handled: false}, {handled: {$exists: false}}]}]};
  if(fromDT) filter.$and.push({emitted: {$gte: fromDT}});
  startListener(self, filter, passive||false, callback);
};

MongoMQ.prototype.emit = function(msg, pkt){
  var self = this;
  if(!self.listening) throw "Queue Listener not started!";
  self.collection = self.collection||self.db.collection(self.mqCollectionName, {safe: true});
  msg = {
    msg: msg,
    pkt: pkt,
    handled: false,
    emitted: new Date()
  };
  self.collection.insert(msg, function(){});
};

MongoMQ.prototype.addHandler = function(info){
  var self = this, l = self.handlers.length, matches, key, handler;
  for(var i = 0; i<l; i++){
    matches = true;
    handler = self.handlers[i];
    for(key in info){
      matches = matches && (key in handler);
      if(matches) return;
    }
  }
  self.handlers.push(info);
};

MongoMQ.prototype.on = function(msg, options, callback){
  var self = this, passive = false, hereOnOut = false;
  if(typeof(options)=='function'){
    callback = options;
    options = {passive: false};
  }
  passive = options.passive || passive;
  hereOnOut = (options.hereOnOut || hereOnOut)?new Date():false;
  if(self.listening) self.nextMessage(msg, passive, hereOnOut, callback);
  self.addHandler({msgType: msg, passive: passive, handler: callback, fromDT: hereOnOut});
};

MongoMQ.prototype.onAny = function(callback){
  var self = this, fromDT = new Date();
  if(self.listening) startListener(self, {$and: [{emitted: {$gte: fromDT}}]}, true, callback);
  self.addHandler({msgType: false, passive: true, handler: callback, fromDT: fromDT});
};

MongoMQ.prototype.forget = function(callback){
  var self = this, l = self.handlers.length;
  if(self.listening) throw "Can't forget while listening";
  for(var i = l; i>-1; i--){
    if(self.handlers[i].handler===callback) self.handlers.splice(i, 1);
  }
};

MongoMQ.prototype.clearListeners = function(){
  var self = this;
  if(self.listening) throw "Can't clear while listening";
  self.handlers = [];
};