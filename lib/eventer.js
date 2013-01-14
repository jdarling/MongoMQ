var util = require('util');
var EventEmitter = require('events').EventEmitter;

var defaultError = function () {};

var Eventer = module.exports = function(hosting){
  var self = this;
  self.hosting = hosting;
  self.on('error', defaultError);
};

util.inherits(Eventer, EventEmitter);

Eventer.description = 'A wrapper around EventEmitter to provide some high level functionality and eased useage pattern within MongoMQ.';

Eventer.prototype.call = function(eventName, err, response){
  var self = this;
  self.emit(eventName, err, response||self.hosting);
};
Eventer.prototype.call.description = 'Calls an event.';

Eventer.prototype.registerTo = function(what){
  var self = this, keys = Object.keys(self), i, l=keys.length, key, value;
  for(i=0; i<l; i++){
    key = keys[i];
    value = self[key];
    if(typeof(value)==='function'){
      what[key]=(function(f){
        return function(){
          f.apply(self, arguments);
        }
      })(value);
    }
  }
};
Eventer.prototype.call.description = 'Adds the Eventer methods to the provided object through closures so they can be used directly.';

Eventer.prototype.checkNoError = function(err, callback, noThrow){
  var self = this, handlers = self.listeners('error'), handlerCount = handlers.length, hasCallback = typeof(callback)==='function';
  if(!err){
    return true;
  }
  if(!(err instanceof Error)){
    err = new Error(err);
  }
  if(handlerCount>0){
    self.emit('error', err, self.hosting);
  }
  if(hasCallback){
    callback(err);
  }
  if((handlerCount===0)&&(!noThrow)&&(!hasCallback)){
    throw err.toString();
  }
  return false;
};
Eventer.prototype.checkNoError.description = 'Checks to see if there is an error, and if their is handles it appropriatly.';

Eventer.prototype.surface = function(what){
  what = what instanceof Array?what:[what];
  var self = this, i,  l = what.length, event;
  for(i=0; i<l; i++){
    event = what[i];
    self.hosting[event] = (function(eventName){
      return function(callback){
        self.on(eventName, callback);
      };
    })(event);
  }
};
Eventer.prototype.surface.description = 'Used to surface a specific set of event wrappers to the hosted object.';
