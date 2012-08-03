/*
  MongoConnection(<options>, <callback>):
    options:
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
    callback:

  MongoConnection.open(<callback>)
  MongoConnection.close(<callback>)
  MongoConnection.collection(collectionName, <options>, <callback>)
  MongoConnection.tailedCursor(collectionName, filter, <sort>, callback)
  MongoConnection.insert(intoCollection, document, <options>, <callback>)
  MongoConnection.remove(fromCollection, <selector>, <options>, <callback>)
  MongoConnection.createCollection(collectionName, <options>, <callback>)
  MongoConnection.dropCollection(collectionName, <callback>)
  MongoConnection.ensureIndex(collectionName, index, <options>, <callback>)
  MongoConnection.findAndModify(inCollection, query, sort, doc, options, callback)
*/

var mongodb = require("mongodb");

var Connection = mongodb.Connection;
var Server = mongodb.Server;
var Db = mongodb.Db;

var errors = {
      E_CONNCLOSED: 'No active server connection!',
      E_NODB: 'No database name provided!',
      E_INVALIDFILTER: 'Invalid or no filter provided!',
      E_NOCALLBACK: 'No callback provided, callback is required!',
      E_INVALIDINDEX: 'Invalid or no index provided!',
      E_INVALIDCURSORCOLLECTION: 'Supplied collection is not capped, tailed cursors only work on capped collections!'
    };
var defaults = {
      CollectionOptions: {safe: false},
      ServerHost: 'localhost',
      ServerOptions: {auto_reconnect: false},
      CappedCollectionSize: 104857600
    }

var MongoConnection = exports.MongoConnection = function(options, callback){
  var self = this;
  options = options || {};
  if(typeof(options)=='string'){
    options = {database: options};
  }
  if(options.servers){
    var l = options.servers.length, server, serverConfig;
    self.servers = [];
    for(var i = 0; i<l; i++){
      serverConfig = self.servers[i];
      if(typeof(serverConfig)=='string'){
        serverConfig = {host: serverConfig, port: mongodb.Connection.DEFAULT_PORT};
      }else if(typeof(serverConfig) === 'number' && isFinite(serverConfig)){
        serverConfig = {host: defaults.ServerHost, port: serverConfig};
      }
      server = {
          host: serverConfig.host || defaults.ServerHost,
          port: serverConfig.port || options.port || Connection.DEFAULT_PORT
        };
      self.servers.push(server);
    }
  }else{
    self.server = {
        host: options.host || defaults.ServerHost,
        port: options.port || mongodb.Connection.DEFAULT_PORT
      };
  }
  self.options = options;
  self.database = options.database;
  
  self.__defineGetter__('active', function(){
      return (!!this.db)&&(this.db.openCalled);
    });
  
  if(options.autoOpen){
    self.open(callback);
  }else if(typeof(callback)=='function'){
    callback(null, self);
  }
};

MongoConnection.prototype.open = function(callback){
  var self = this, options = self.options;
  var serverConnection;
  
  if(self.active){
    if(typeof(callback)=='function'){
      callback(null, self);
    }
    return;
  }
  
  if(!self.database){
    throw errors.E_NODB;
  }
  
  if(self.servers){
    var server, l = self.servers.length, servers = [];
    for(var i = 0; i<l; i++){
      server = self.servers[i];
      servers.push(new Server(server.host, server.port, options.serverOptions||defaults.ServerOptions));
    }
    serverConnection = ReplSetServers(servers);
  }else{
    serverConnection = new Server(self.server.host, self.server.port, options.serverOptions||defaults.ServerOptions);
  }
  
  var db = new Db(self.database, serverConnection, {native_parser:(options.nativeParser==null?false:options.nativeParser)});
  db.open(function(err, _db){
    self.db = db;
    if(options.username&&options.password){
      if(options.authenticateAgainstDb){
        adminDb.authenticate(options.username, options.password, function(err, result){
          if(typeof(callback)=='function'){
            callback(null, self);
          }
        });
      }else{
        db.admin(function(err, adminDb){
          adminDb.authenticate(options.username, options.password, function(err, result){
            if(typeof(callback)=='function'){
              callback(null, self);
            }
          });
        });
      }
    }else{
      if(typeof(callback)=='function'){
        callback(null, self);
      }
    }
  });
};

MongoConnection.prototype.close = function(callback){
  var self = this;
  if(self.active){
    self.db.close(true, function(err, result){
      self.db = false;
      if(typeof(callback)=='function'){
        callback(err, self);
      }
    });
  }
};

MongoConnection.prototype.collection = function(collectionName, options, callback){
  var self = this;
  if(!self.active){
    throw errors.E_CONNCLOSED;
  }
  if(typeof(options)==='function'){
    callback = options;
    options = defaults.CollectionOptions;
  }
  self.db.collection(collectionName, options||defaults.CollectionOptions, callback);
};

MongoConnection.prototype.tailedCursor = function(collectionName, filter, sort, callback){
  var self = this;
  if(typeof(sort)==='function'){
    callback = sort;
    sort = false;
  }
  if(typeof(filter)!=='object'){
    throw errors.E_INVALIDFILTER;
  }
  if(typeof(callback)!=='function'){
    throw errors.E_NOCALLBACK;
  }
  self.collection(collectionName, function(err, collection){
    if(err){
      callback(err);
    }else{
      collection.isCapped(function(err, capped){
        if(capped){
          var cursorOptions = {tailable: true};
          if(sort) cursorOptions.sort = sort;
          collection.find(filter, cursorOptions, callback);
        }else{
          callback(errors.E_INVALIDCURSORCOLLECTION);
        }
      });
    }
  });
};

MongoConnection.prototype.insert = function(intoCollection, document, options, callback){
  var self = this;
  if(typeof(options)=='function'){
    callback = options;
    options = {};
  }
  self.collection(intoCollection, function(err, collection){
    collection.insert(document, options, callback);
  });
};

MongoConnection.prototype.update = function(inCollection, selector, document, options, callback){
  var self = this;
  if(typeof(options)=='function'){
    callback = options;
    options = {};
  }
  self.collection(inCollection, function(err, collection){
    collection.update(selector, document, options, function(err, updated){
      if(err){
        callback(err);
      }else if(!!updated){
        collection.find(selector, callback);
      }else{
        callback(null, false);
      }
    });
  });
};

//MongoConnection.prototype.find = function(fromCollection, selector, fields, skip, limit, timeout, callback){
MongoConnection.prototype.find = function(){
  var self = this;
  var args = Array.prototype.slice.apply(arguments);
  var fromCollection = args.shift();
  var callback = args.length>0?args[args.length-1]:false;
  self.collection(fromCollection, function(err, collection){
    if(err){
      if(callback){
        callback(err);
      }else{
        throw err;
      }
    }else{
      if(callback){
        //callback(null, collection.find.apply(collection, args));
        collection.find.apply(collection, args);
      }
    }
  });
};

MongoConnection.prototype.ensureCappedCollection = function(collectionName, size, options, callback){
  var self = this;
  if(typeof(size)==='function'){
    callback = size;
    size = false;
    options = {};
  }
  if(typeof(options)==='function'){
    callback = options;
    options = {};
  }
  options = options || {};
  self.collection(collectionName, function(err, collection){
    var collOptions = options;
    if(typeof(collOptions.autoIndexId)=='undefined'){
      collOptions.autoIndexId = true;
    }
    collOptions.capped = true;
    collOptions.size = collOptions.size||size||defaults.CappedCollectionSize;
    if(!collection){
      self.createCollection(collectionName, collOptions, callback);
    }else{
      collection.isCapped(function(err, capped){
        if(!!capped){
          if(typeof(callback)==='function'){
            callback(null, collection);
          }
        }else{
          collection.insert({workaround: 'This works around a bug with capping empty collections.'}, function(){
            self.db.command({"convertToCapped": collectionName, size: collOptions.size}, function(err, result){
              if(typeof(callback)==='function'){
                if(err){
                  callback(err, result);
                }else{
                  self.collection(collectionName, callback);
                }
              }
            });
          });
        }
      });
    }
  });
};

MongoConnection.prototype.findAndModify = function(inCollection, query, sort, doc, options, callback){
  var self = this;
  self.collection(inCollection, function(err, collection){
    collection.findAndModify(query, sort, doc, options, callback);
  });
};

MongoConnection.prototype.remove = function(fromCollection, selector, options, callback){
  var self = this;
  if(typeof(options)=='function'){
    callback = options;
    options = {};
  }
  if(typeof(selector)=='function'){
    callback = callback || selector;
    selector = {};
  }
  self.collection(fromCollection, function(err, collection){
    collection.remove(selector, options, callback);
  });
};

MongoConnection.prototype.createCollection = function(collectionName, options, callback){
  var self = this;
  if(!self.active){
    throw errors.E_CONNCLOSED;
  }
  if(typeof(options)=='function'){
    callback = options;
    options = {};
  }
  callback = callback || function(){};
  self.db.createCollection(collectionName, options, callback);
};

MongoConnection.prototype.dropCollection = function(collectionName, callback){
  var self = this;
  if(!self.active){
    throw errors.E_CONNCLOSED;
  }
  callback = callback || function(){};
  self.db.dropCollection(collectionName, callback);
};

MongoConnection.prototype.ensureIndex = function(collectionName, index, options, callback){
  var self = this;
  if(!self.active){
    throw errors.E_CONNCLOSED;
  }
  if(typeof(options)=='function'){
    callback = options;
    options = {};
  }
  callback = callback || function(){};
  if(typeof(index)!=='object'){
    throw errors.E_INVALIDINDEX;
  }
  self.db.ensureIndex(collectionName, index, options, callback);
};