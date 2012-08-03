// For this demo, using an in-memory store. Could easily switch to persistent storage with Mongo or similar.
var uuid = require('node-uuid'),
    items = [];

var MongoMQ = require('../../../lib/MongoMQ').MongoMQ;
var emitter = new MongoMQ();

emitter.start();

exports.load = function(id, callback) {
  console.log('load called: ', id);
  if(emitter.listening){
    emitter.emit('dao::load', id, function(err, data, next){
      if(typeof(callback)=='function'){
        callback(err, data);
      }
      next();
    });
  }
  //return items[id] ? JSON.parse(items[id]) : null;
};

exports.save = function(item, callback) {
  console.log('save called: ', item);
  if(emitter.listening) emitter.emit('dao::store', item, function(err, data, next){
    console.log('got an answer: ', err||data);
    if(typeof(callback)==='function'){
      callback(err, data);
    }
    next();
  });
/*
  if(!item.id) {
    item.id = uuid.v4().replace(/\-/g, '').substring(0, 8);
  }
  items[item.id] = JSON.stringify(item);
*/
};