var Mongo = require('mongodb');
var Mongo = require('mongodb');
var MongoClient = Mongo.MongoClient;
var Options = require('./options');
var GridStore = Mongo.GridStore;
var Eventer = require('./eventer');

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
      ServerOptions: {
        auto_reconnect: false,
        //*
        poolSize: 1,
        socketOptions: {
          connectTimeoutMS: 1000,
          socketTimeoutMS: 1000
        }
        //*/
      },
      CappedCollectionSize: 104857600,
      NativeParser : false,
      logger: null // No logger by default.  If providied, this needs to have the same interface as the MongoDB logger.
      //logger: new require('./logger')()
    };

var ensureMongoConnectionDetails = function(options){
  if(options.connectionString){
    return;
  }else if(options.servers||options.host){
    Options.ensure(options, {port: 27017});
    return;
  }else{
    options.connectionString = 'mongodb://localhost:27017';
  }
};

var MongoConnection = module.exports = function(options, callback){
  var self = this, dbName;
  callback=callback||function(){};
  options = Options.ensure(options||{}, {autoStart: true});
  ensureMongoConnectionDetails(options);
  self.__defineGetter__('options', function(){
    return options;
  });
  self.__defineGetter__('active', function(){
    return (!!this.db)&&(this.db.openCalled);
  });
  self.__defineGetter__('isopen', function(){
    return this._open;
  });
  self.__defineGetter__('databaseName', function(){
    return (this.db||{}).databaseName||'default';
  });
  self.__defineSetter__('databaseName', function(value){
    this.use(value);
  });
  self.emitter = new Eventer(self);
  self.emitter.surface(['error', 'opened', 'closed']);
  self.emitter.registerTo(self);
};

MongoConnection.ERROR_CODES = errors;

var connect = function(self, connection, callback){
  var connected = function(err, database){
      if(self.emitter.checkNoError(err, callback)){
        self.db = database;
        self._open = true;
        if(self.options.username&&self.options.password){
          if(self.options.authenticateAgainstDb){
            database.authenticate(self.options.username, self.options.password, function(err, result){
              if(typeof(callback)=='function'){
                self.emitter.call('opened', err);
                callback(null, self);
              }
            });
          }else{
            database.admin(function(err, adminDb){
              if(self.emitter.checkNoError(err, callback)){
                adminDb.authenticate(self.options.username, self.options.password, function(err, result){
                  if(self.emitter.checkNoError(err, callback)){
                    self.emitter.call('opened', err);
                    callback(null, self);
                  }
                });
              }
            });
          }
        }else{
          self.emitter.call('opened', err);
          callback(null, self);
        }
      }
    };
  if(!connection){
    var connectOptions = {server: Options.ensure(self.options.serverOptions||{}, defaults.ServerOptions)};
    if(self.options.logger||defaults.logger){
      connectOptions.server.logger=self.options.logger||defaults.logger;
      connectOptions.server.logger.log('Logger setup');
    }
    delete connectOptions.server.auto_reconnect;
    if(connectOptions.server.logger===false){
      delete connectOptions.server.logger;
    }
    MongoClient.connect(self.options.connectionString, connectOptions, connected);
  }else{
    self.mongoClient = new MongoClient(connection);
    self.mongoClient.open(connected);
  }
};

var connectReplSet = function(self, options, callback){
  var l = options.servers.length, server, serverConfig, serverConnection;
  var servers = [], serverOptions = Options.ensure(options.serverOptions||{}, defaults.ServerOptions);
  if(serverOptions.logger===false){
    delete serverOptions.logger;
  }
  for(var i = 0; i<l; i++){
    serverConfig = options.servers[i];
    if(typeof(serverConfig)=='string'){
      serverConfig = {host: serverConfig, port: options.port||Mongo.Connection.DEFAULT_PORT};
    }else if(typeof(serverConfig) === 'number' && isFinite(serverConfig)){
      serverConfig = {host: defaults.ServerHost, port: serverConfig};
    }
    server = {
        host: serverConfig.host || defaults.ServerHost,
        port: serverConfig.port || options.port || Mongo.Connection.DEFAULT_PORT
      };
    servers.push(new Mongo.Server(server.host, server.port, serverOptions));
  }
  connect(self, Mongo.ReplSet(servers), callback);
};

var connectHost = function(self, options, callback){
  self.options.connectionString = 'mongodb://'+(options.host||defaults.ServerHost)+':'+(options.port||Mongo.Connection.DEFAULT_PORT);//'mongodb://localhost:27017';
  connect(self, false, callback);
};

MongoConnection.prototype.open = function(callback){
  var self = this, options = self.options;
  var switchToDb = function(err, database){
    if(self.emitter.checkNoError(err, callback)){
      self.use(self.options.databaseName||self.databaseName, callback);
    }
  };
  if(options.connectionString){
    connect(self, false, switchToDb);
  }else if(options.servers){
    connectReplSet(self, options, switchToDb);
  }else if(options.host){
    connectHost(self, options, switchToDb);
  }
};
MongoConnection.prototype.open.description = 'Connects to the MongoDB instance.';

MongoConnection.prototype.close = function(callback){
  var self = this;
  var db = self.db;
  if(self._open){
    self._open = false;
    self.db = false;
    if(self.active){
      db.close(callback);
    }else{
      (callback||function(){})(null, self);
    }
    if(self.mongoClient){
      self.mongoClient.close();
      self.mongoClient = false;
    }
    self.emitter.call('closed');
  }
};
MongoConnection.prototype.close.description = 'Closes the connection to the MongoDB instance.';

MongoConnection.prototype.checkConnection = function(callback){
  var self = this;
  if(self.isopen){
    callback(null, self);
  }else{
    callback(new Error(errors.E_CONNCLOSED));
  }
};
MongoConnection.prototype.checkConnection.description = 'Validates that a connection with MongoDB has been established.';

MongoConnection.prototype.serverStatus = function(callback){
  var self = this;
  self.checkConnection(function(err){
    if(self.emitter.checkNoError(err, callback)){
      self.db.command({serverStatus: 1}, callback);
    }
  });
};
MongoConnection.prototype.serverStatus.description = 'Returns the MongoDB serverStatus().';

MongoConnection.prototype.use = function(databaseName, callback){
  var self = this;
  if(self.databaseName !== databaseName){
    self.checkConnection(function(err){
      if(self.emitter.checkNoError(err, callback)){
        if(self.db){
          self.db.close();
        }
        self.db = self.db.db(databaseName);
        if(self.options.databaseName){
          self.options.databaseName = databaseName;
        }
        callback(null, self);
      }
    });
  }else{
    callback(null, self);
  }
};
MongoConnection.prototype.use.description = 'Switches to the provided database.';

MongoConnection.prototype.collection = function(collectionName, callback){
  var self = this;
  self.checkConnection(function(err){
    if(self.emitter.checkNoError(err, callback)){
      self.db.collection(collectionName, callback);
    }
  });
};
MongoConnection.prototype.collection.description = 'Returns the requested collection.';

MongoConnection.prototype.createCollection = function(collectionName, options, callback){
  var self = this;
  self.checkConnection(function(err){
    if(self.emitter.checkNoError(err, callback)){
      if(typeof(options)=='function'){
        callback = options;
        options = {};
      }
      callback = callback || function(){};
      self.db.createCollection(collectionName, options, callback);
    }
  });
};
MongoConnection.prototype.createCollection.description = 'Creates a new collection.';

MongoConnection.prototype.ensureCapped = function(collectionName, size, options, callback){
  var self = this;
  self.checkConnection(function(err){
    if(self.emitter.checkNoError(err, callback)){
      if(typeof(size)==='function'){
        callback = size;
        size = false;
        options = {};
      }
      if(typeof(options)==='function'){
        callback = options;
        options = {};
      }
      var collOptions = options || {};
      self.collection(collectionName, function(err, collection){
        if(self.emitter.checkNoError(err, callback)){
          if(typeof(collOptions.autoIndexId)=='undefined'){
            collOptions.autoIndexId = true;
          }
          collOptions.capped = true;
          collOptions.size = collOptions.size||size||defaults.CappedCollectionSize;
          if(!collection){
            self.createCollection(collectionName, collOptions, callback);
          }else{
            collection.isCapped(function(err, capped){
              if(self.emitter.checkNoError(err, callback)){
                if(!!capped){
                  if(typeof(callback)==='function'){
                    callback(null, collection);
                  }
                }else{
                  collection.insert({workaround: 'This works around a bug with capping empty collections.'}, {safe:true},  function(){
                    self.db.command({"convertToCapped": collectionName, size: collOptions.size}, function(err, result){
                      if(self.emitter.checkNoError(err, callback)){
                        if(typeof(callback)==='function'){
                          if(self.emitter.checkNoError(err, callback)){
                            if (result.ok===0){
                              self.emitter.checkNoError(result.errmsg, callback);
                            }else{
                              self.collection(collectionName, callback);
                            }
                          }
                        }
                      }
                    });
                  });
                }
              }
            });
          }
        }
      });
    }
  });
};
MongoConnection.prototype.ensureCapped.description = 'Ensures that the provided collection is capped.';

MongoConnection.prototype.tailedCursorStreamable = function(collectionName, filter, sort, callback){
  var self = this;
  self.checkConnection(function(err){
    if(self.emitter.checkNoError(err, callback)){
      if(typeof(sort)==='function'){
        callback = sort;
        sort = false;
      }
      if(typeof(callback)!=='function'){
        throw new Error(errors.E_NOCALLBACK);
      }else if(typeof(filter)!=='object'){
        return callback(new Error(errors.E_INVALIDFILTER));
      }else{
        self.collection(collectionName, function(err, collection){
          if(self.emitter.checkNoError(err, callback)){
            collection.isCapped(function(err, capped){
              if(self.emitter.checkNoError(err, callback)){
                if(capped){
                  var cursorOptions = {tailable: true};
                  if(sort) cursorOptions.sort = sort;
                  callback(null, collection.find(filter, cursorOptions));
                }else{
                  self.emitter.checkNoError(errors.E_INVALIDCURSORCOLLECTION, callback);
                }
              }
            });
          }
        });
      }
    }
  });
};
MongoConnection.prototype.tailedCursorStreamable.description = 'Returns a tailed cursor that can be used to create a stream that can be used to monitor the provided collection.';

MongoConnection.prototype.tailedCursorStream = function(collectionName, filter, sort, callback){
  var self = this;
  self.checkConnection(function(err){
    if(self.emitter.checkNoError(err, callback)){
      if(typeof(sort)==='function'){
        callback = sort;
        sort = false;
      }
      if(typeof(callback)!=='function'){
        self.emitter.checkNoError(errors.E_NOCALLBACK);
      }else if(typeof(filter)!=='object'){
        self.emitter.checkNoError(new Error(errors.E_INVALIDFILTER), callback);
      }else{
        self.collection(collectionName, function(err, collection){
          if(self.emitter.checkNoError(err, callback)){
            collection.isCapped(function(err, capped){
              if(self.emitter.checkNoError(err, callback)){
                if(capped){
                  var cursorOptions = {tailable: true};
                  if(sort) cursorOptions.sort = sort;
                  callback(null, collection.find(filter, cursorOptions).stream());
                }else{
                  self.emitter.checkNoError(errors.E_INVALIDCURSORCOLLECTION, callback);
                }
              }
            });
          }
        });
      }
    }
  });
};
MongoConnection.prototype.tailedCursorStream.description = 'Returns a tailed stream that can be used to monitor the provided collection.';

MongoConnection.prototype.tailedCursor = function(collectionName, filter, sort, callback){
  var self = this;
  self.checkConnection(function(err){
    if(self.emitter.checkNoError(err, callback)){
      if(typeof(sort)==='function'){
        callback = sort;
        sort = false;
      }
      if(typeof(callback)!=='function'){
        self.emitter.checkNoError(errors.E_NOCALLBACK);
      }else if(typeof(filter)!=='object'){
        self.emitter.checkNoError(errors.E_INVALIDFILTER, callback);
      }else{
        self.collection(collectionName, function(err, collection){
          if(self.emitter.checkNoError(err, callback)){
            collection.isCapped(function(err, capped){
              if(self.emitter.checkNoError(err, callback)){
                if(capped){
                  var cursorOptions = {tailable: true};
                  if(sort) cursorOptions.sort = sort;
                  collection.find(filter, cursorOptions, callback);
                }else{
                  self.emitter.checkNoError(errors.E_INVALIDCURSORCOLLECTION, callback);
                }
              }
            });
          }
        });
      }
    }
  });
};
MongoConnection.prototype.tailedCursor.description = 'Returns cursor that can be used with nextObject to monitor a collection.';

MongoConnection.prototype.writeGridFS = function(fileName, data, options, callback){
  var self = this;
  if(typeof(options)==='function'){
    callback = options;
    options = {};
  }
  self.checkConnection(function(err){
    if(self.emitter.checkNoError(err, callback)){
    }
  });
};

MongoConnection.prototype.readGridFS = function(fileName, options, callback){
  var self = this;
  if(typeof(options)==='function'){
    callback = options;
    options = {};
  }
  self.checkConnection(function(err){
    if(self.emitter.checkNoError(err, callback)){
      GridStore.exist(self.db, fileName, function(err, exists){
        if(self.emitter.checkNoError(err, callback)){
          if(exists===false){
            callback(null, false);
          }else{
            var gridStore = new GridStore(self.db, fileName, 'r');
            gridStore.open(function(err, gridStore) {
              if(self.emitter.checkNoError(err, callback)){
                gridStore.read(function(err){
                  if(self.emitter.checkNoError(err, callback)){
                    callback.apply(self, arguments);
                    gridStore.close(function(){});
                  }
                });
              }
            });
          }
        }
      });
    }
  });
};
MongoConnection.prototype.readGridFS.description = 'Retrieves the requested file from GridFS.';

MongoConnection.prototype.streamGridFS = function(fileName, callback){
  var self = this;
  self.checkConnection(function(err){
    if(self.emitter.checkNoError(err, callback)){
      GridStore.exist(self.db, fileName, function(err, exists){
        if(self.emitter.checkNoError(err, callback)){
          if(!exists){
            callback(null, false);
          }else{
            var gridStore = new GridStore(self.db, fileName, 'r');
            var doput = function(done){
              return function(data){
                if(data){
                  callback(null, data.toString());
                }
                if(done){
                  callback(null, null);
                }
              };
            };
            var doerror = function(done){
              return function(err){
                self.emitter.checkNoError(err, callback);
              };
            };
            gridStore.open(function(err, gridStore) {
              var stream = gridStore.stream(true);
              stream.on('data', doput(false));
              stream.on('error', doerror(true));
              stream.on('end', doput(true));
            });
          }
        }
      });
    }
  });
};
MongoConnection.prototype.streamGridFS.description = 'Retrieves the requested file from GridFS using streams to lower overhead.';
