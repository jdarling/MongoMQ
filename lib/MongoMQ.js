var MC = require("./MongoConnection").MongoConnection;

var MongoMQ = exports.MongoMQ = function(options){
  var self = this;
  options = options || {};
  self.mqCollectionName = options.mqCollectionName||'queue';
  self.mqDB = options.mqDB||options.db||'MongoMQ';
  options.db = self.mqDB;
  self.collectionSize = options.collectionSize||100000000;
  self.handlers = [];
  var server = self.server = new MC(options, function(err, conn){
      if(err){
        console.log(err);
      }else{
        self.db = conn._db;
        self.start();
      }
    });
};

MongoMQ.prototype.start = function(){
  var self = this;
  self.db.collection(self.mqCollectionName, {safe: true}, function(err, collection){
    var okToStart = true;
    if(err){
      if(collection){
        okToStart = false;
      }else{
        self.createCollection();
      }
    }else{
      self.startListening(collection);
    }
  });
};

MongoMQ.prototype.close = function(){
  var self = this;
  self.db.close();
};

MongoMQ.prototype.createCollection = function(){
  var self = this;
  self.db.dropCollection(self.mqCollectionName, function(){
    self.db.createCollection(self.mqCollectionName, {
        capped: true,
        size: self.collectionSize
      }, function(err, collection){
        self.startListening(collection);
      });
  });
};

MongoMQ.prototype.startListening = function(collection){
  var self = this;
  collection = collection||self.db.collection(self.mqCollectionName, {safe: true});
  if(!collection) self.createCollection();
  else{
    collection.isCapped(function(err, isCapped){
      if(!isCapped) self.createCollection();
      else{
        self.collection = collection;
        if(self.handlers.length>0){
          var l = self.handlers.length;
          for(var i = 0; i<l; i++){
            if(self.handlers[i].msgType) self.nextMessage(self.handlers[i].msgType, self.handlers[i].passive, self.handlers[i].callback);
            else self.onAny(self.handlers[i].callback);
          }
        }
        self.listening = true;
      }
    });
  }
};

MongoMQ.prototype.getCursor = function(forMsg, passive, callback, cursor){
  var self = this;
  var doCallback = function(err, msg){
      var next = function(){
        self.getCursor(forMsg, passive, callback, cursor);
      };
      if(typeof(callback)=='function') callback(err, msg?msg.pkt:false, next);
    };
  if(typeof(passive)=='function'){
    callback = passive;
    passive = false;
  }
  self.collection = self.collection||self.db.collection(self.mqCollectionName, {safe: true});
  if(passive){
    cursor = cursor || self.collection.find({$and: [{msg: forMsg}, {$or: [{handled: false}, {handled: {$exists: false}}]}]}, {tailable: true});
    cursor.nextObject(function(err, msg){
      if(typeof(callback)=='function') doCallback(err, (msg&&msg.length)>0?msg[0]:msg);
    });
  }else{
    cursor = cursor || self.collection.find({$and: [{msg: forMsg}, {$or: [{handled: false}, {handled: {$exists: false}}]}]}, {tailable: true});
    cursor.nextObject(function(err, msg){
      self.collection.findAndModify((msg&&msg.length)>0?msg[0]:msg, {emitted: -1}, {$set: {handled: true}}, {tailable: true},
        function(err, data){
          if(err||(!data)) self.getCursor(forMsg, passive, callback); // someone else picked it up
          else doCallback(err, data);
        });
    });
  }
};

MongoMQ.prototype.nextMessage = function(msgType, passive, callback){
  var self = this;
  self.getCursor(msgType, passive, callback);
};

MongoMQ.prototype.emit = function(msg, pkt){
  var self = this;
  self.collection = self.collection||self.db.collection(self.mqCollectionName, {safe: true});
  msg = {
    msg: msg,
    pkt: pkt,
    handled: false,
    emitted: new Date()
  };
  self.collection.insert(msg, function(){});
};

MongoMQ.prototype.on = function(msg, passive, callback){
  var self = this;
  if(typeof(passive)=='function'){
    callback = passive;
    passive = false;
  }
  if(self.listening) self.nextMessage(msg, passive, callback);
  else self.handlers.push({msgType: msg, passive: !!passive, handler: callback});
};

MongoMQ.prototype.onAny = function(callback, cursor){
  var self = this;
  if(!self.listening) self.handlers.push({msgType: msg, passive: !!passive, handler: callback});
  else{
    var doCallback = function(err, msg){
        var next = function(){
          self.onAny(callback, cursor);
        };
        if(typeof(callback)=='function') callback(err, msg?msg.pkt:false, next);
      };
    self.collection = self.collection||self.db.collection(self.mqCollectionName, {safe: true});
    var clause = [{emitted: {$gte: new Date()}}];
    cursor = cursor || self.collection.find({$and: clause}, {tailable: true});
    cursor.nextObject(function(err, msg){
      if(typeof(callback)=='function') doCallback(err, (msg&&msg.length)>0?msg[0]:msg);
    });
  }
};