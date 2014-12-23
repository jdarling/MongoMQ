var UUID = require('node-uuid');

var QueueMonitor = module.exports = function(mq, event, options, callback){
  var self = this;
  if(typeof(options)==='function'){
    callback = options;
    options = {};
  }
  self.__defineGetter__('running', function(){
    return !!(this.cursor||this.cursorStream);
  });
  self.__defineGetter__('stopCallback', function(){
    return this.options.stopCallback||function(){};
  });
  self.__defineSetter__('stopCallback', function(callback){
    this.options.stopCallback = callback;
  });
  self.__defineGetter__('startCallback', function(){
    return this.options.startCallback||function(){};
  });
  self.__defineSetter__('startCallback', function(callback){
    this.options.startCallback = callback;
  });
  self.__defineGetter__('errorCallback', function(){
    return this.options.errorCallback||function(){};
  });
  self.__defineSetter__('errorCallback', function(callback){
    this.options.errorCallback = callback;
  });
  options.writeConcern = (options.writeConcern||'').toLowerCase()==='full'?false:(options.writeConcern||'majority');
  self.event = event;
  self.mq = mq;
  self.callback = callback;
  self.options = options||{};
  self.start();
};

QueueMonitor.prototype.buildSelector = function(cursorFixId){
  var self = this, event = self.event, dt = new Date(), afterDt = new Date(dt-self.mq.serverTimeOffset), $or, i, l;
  if(event!=='*'){
    $or = [{handled: false, event: event}, {handled: {$exists: false}, event: event}, {fix: cursorFixId}];
  }else{
    $or = [{handled: false}, {handled: {$exists: false}, fix: {$exists: false}}, {fix: cursorFixId}];
  }
  if(self.options.hereOnOut){
    l = $or.length;
    for(i=0; i<l; i++){
      if($or[i].fix!==cursorFixId){
        $or[i].globalTime = {$gt: afterDt};
      }
    }
  }
  return {$or: $or};
};
QueueMonitor.prototype.buildSelector.description = 'Used internally by start_usingNextObject and start_usingStreams to build the message selector.';

QueueMonitor.prototype.start_usingNextObject = function(startupCallback){
  // call out to setup the tailed cursor for us
  var self = this, cursorFixId = self.cursorFixId = UUID.v4(), mq = self.mq, callback = self.callback, event = self.event;
  // this is a work around so we don't get runaway handles when there is no records for us to process
  mq.collection(mq.options.queueCollection, function(err, collection){
    collection.insert({fix: cursorFixId}, {w: 1}, function(){
      mq.tailedCursor(mq.options.queueCollection, self.buildSelector(cursorFixId), {$natural: 1}, function(err, cursor){
        if(err){
          self.errorCallback(err);
          startupCallback(err);
        }else{
          // start the listener loop
          self.cursor = cursor;
          self.next();
          startupCallback(null, self);
        }
      });
    });
  });
};
QueueMonitor.prototype.start_usingNextObject.description = 'Starts the Queue Monitor in nextObject mode, internal use only.';

QueueMonitor.prototype.start_usingStreams = function(startupCallback){
  var self = this, cursorFixId = self.cursorFixId = UUID.v4(), mq = self.mq, callback = self.callback, event = self.event;
  // this is a work around so we don't get runaway handles when there is no records for us to process
  mq.collection(mq.options.queueCollection, function(err, collection){
    if(collection){
      collection.insert({fix: cursorFixId}, {w: 1}, function(){
        mq.tailedCursorStream(mq.options.queueCollection, self.buildSelector(cursorFixId), {$natural: 1}, function(err, stream){
          if(!stream){
            self.start_usingStreams(startupCallback);
          }else{
            self.cursorStream = stream;
            stream.on("data", function(data){
              self.handleResponse(null, data);
            });
            stream.on("error", function(err){
              self.errorCallback(err);
              self.handleResponse(err);
            });
            stream.on("close", function(data){
              self.stop();
            });
            startupCallback(null, self);
          }
        });
      });
    }else{
      self.start_usingStreams(startupCallback);
    }
  });
};
QueueMonitor.prototype.start_usingStreams.description = 'Starts the Queue Monitor in streaming mode, internal use only.';

QueueMonitor.prototype.start = function(callback){
  var self = this, options = self.options;
  var started = function(err, response){
    if(err){
      self.errorCallback(err);
    }else{
      self.startCallback(err, response);
    }
    (callback||function(){})(err, response);
  };
  if(!self.running){
    switch((options.listenerType||'').toLowerCase()){
      case('responselistener'):
      case('streams'):
        self.start_usingStreams(started);
        break;
      case('nextobject'):
      default:
        self.start_usingNextObject(started);
    }
  }else{
    (callback||function(){})(null, self);
  }
};
QueueMonitor.prototype.start.description = 'Starts the Queue Monitor based on the listenerType option provided when created.';

QueueMonitor.prototype.restart = function(callback){
  var self = this;
  self.stop(function(){
    self.start(callback);
  });
};
QueueMonitor.prototype.restart.description = 'Stops and restarts the Queue Monitor.';

QueueMonitor.prototype.handleResponse = function(err, record, doNext){
  var self = this, cursorFixId = self.cursorFixId, mq = self.mq, callback = self.callback;
  next = function(data){
    if(((record||{}).response_id)&&(typeof(data)!=='undefined')){
      mq.emit(record.response_id, data);
    }
    if(typeof(doNext)==='function'){
      doNext();
    }
  };
  if(err||(!record)){
    if(err){
      // The remote server may have went away,
      // restart the connection just to be sure we
      // get our messages.
      self.errorCallback(err);
      self.restart();
    }else{
      next();
    }
    return;
  }else if(record.handled||record.fix===cursorFixId){
    // If we have a handled record, or the fix record, then skip it
    return next();
  }else{
    if(typeof(record.handled)==='undefined'){
      if(record.fix===cursorFixId){
        // Don't report back the fix record
        next();
      }else{
        // This is to catch broadcast events, actually this breaks things as is
        // so will need to fix that eventually with some type of server time
        // solution
        callback(null, (record||{}).data, next);
      }
    }else{
      mq.collection(mq.options.queueCollection, function(err, collection){
        if(err){
          self.errorCallback(err);
          callback(err, null, next);
        }else{
          // Lock the record so that we can work with it and no one else can
          var set = {$set: {handled: true}};
          if(record.pickedTime){
            var dt = new Date();
            set.$set.pickedTime = new Date(dt-mq.serverTimeOffset)
          }
          if(self.options.passive||mq.options.passive){
            mq.emitter.emit('recieved', record);
            callback(err, (record||{}).data, next);
          }else{
            collection.findAndModify(record, {$natural: -1}, set, {w: ((mq.db||{}).serverConfig||{}).replicaSet?self.options.writeConcern||mq.options.writeConcern||mq.db.serverConfig.servers.length:1}, function(err, data){
              if(data||err){
                if(err){
                  self.errorCallback(err);
                }
                mq.emitter.emit('recieved', data);
                callback(err, (data||{}).data, next);
              }else{
                // We didn't get the lock on the record
                next();
              }
            });
          }
        }
      });
    }
  }
};
QueueMonitor.prototype.handleResponse.description = 'Handles a message when it appears in the queue.';

QueueMonitor.prototype.next = function(){
  var self = this, cursor = self.cursor, cursorFixId = self.cursorFixId, mq = self.mq, callback = self.callback;
  var next = function(){
    self.next();
  };

  cursor.nextObject(function(err, record){
    if(err){
      self.errorCallback(err);
    }
    self.handleResponse(err, record, next);
  });
};
QueueMonitor.prototype.restart.description = 'Sets the monitor up for the next message.';

QueueMonitor.prototype.stop = function(callback){
  var self = this, cursor;
  if(self.cursor||self.cursorStream){
    if(self.cursor){
      self.cursor.close();
      self.cursor = false;
    }
    if(self.cursorStream){
      self.cursorStream.destroy();
      self.cursorStream = false;
    }
    self.stopCallback(null, self);
    (callback||function(){})(null, self);
  }else{
    (callback||function(){})(null, self);
  }
};
QueueMonitor.prototype.restart.description = 'Stops the Queue Monitor.';
