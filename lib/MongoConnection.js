var mongodb = require('mongodb');
var key;

for(key in mongodb){
  if(hasOwnProperty.call(mongodb, key)){
    //console.log('Importing: ', key);
    global[key] = exports[key] = mongodb[key];
  }
}

exports.ObjectId = exports.ObjectID;

var MongoConnection = exports.MongoConnection = function(options, callback){
  options = options||{};
  var self = this;
  if(options.servers instanceof Array){
    var servers = [], host, port, serverOptions, l = options.servers.length;
    for(var i = 0; i<l; i++){
      if(typeof(options.servers[i])=='string'){
        host = options.servers[i];
        port = Connection.DEFAULT_PORT;
        serverOptions = options.serverOptions||{auto_reconnect: true};
      }else{
        host = options.servers[i].host||options.host||'localhost';
        port = options.servers[i].port||options.port||Connection.DEFAULT_PORT;
        serverOptions = options.servers[i].serverOptions||options.serverOptions||{auto_reconnect: true};
      }
      servers.push(new Server(host, port, options));
    }
    self.server = new ReplSetServers(servers);
  }else self.server = new Server(options.host||'localhost', options.port||Connection.DEFAULT_PORT, options.serverOptions||{auto_reconnect: true});
  
  var server = self.server;
  var db = self.dbConnection = new Db(options.db, server, {native_parser:(options.nativeParser==null?false:options.nativeParser)});
  db.open(function(err, _db){
    self._db = _db;
    if(options.username&&options.password){
      db.admin(function(err, adminDb){
        adminDb.authenticate(options.username, options.password, function(err, result){
          if(typeof(callback)=='function') callback(null, self);
        });
      });
    }else{
      if(typeof(callback)=='function') callback(null, self);
    }
  });
};

MongoConnection.prototype.Close = function(){
  var self = this;
  self._db.close();
};

MongoConnection.prototype.Collection = function(collectionName, pkFactory, options){
  var self = this;
  return self.dbConnection.collection(collectionName, pkFactory, options);
};

MongoConnection.prototype.find = function(inCollection, selector, fields, skip, limit, timeout, callback){
  var self = this;
  var args = Array.prototype.slice.apply(arguments);
  var collection = self.Collection(args.shift());
  var cb = args.pop();
  if(typeof(cb)!=='function'){
    args.push(cb);
    cb = function(){};
  }
  collection.find.apply(collection, args).toArray(cb);
};

MongoConnection.prototype.insert = function(inCollection, selector, fields, skip, limit, timeout, callback){
  var self = this;
  var args = Array.prototype.slice.apply(arguments);
  var collection = self.Collection(args.shift());
  var cb = args.pop();
  if(typeof(cb)!=='function'){
    args.push(cb);
    cb = function(){};
  }
  args.push(cb);
  collection.insert.apply(collection, args);
};

MongoConnection.prototype.update = function(inCollection, selector, fields, skip, limit, timeout, callback){
  var self = this;
  var args = Array.prototype.slice.apply(arguments);
  var collection = self.Collection(args.shift());
  var cb = args.pop();
  if(typeof(cb)!=='function'){
    args.push(cb);
    cb = function(){};
  }
  args.push(cb);
  collection.update.apply(collection, args);
};