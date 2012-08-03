var MongoMQ = require('../../../lib/MongoMQ').MongoMQ;
var MongoConnection = require('../../../lib/MongoMQ').MongoConnection;
var util = require('util');
var ObjectId = require('mongodb').ObjectID;

var DAO = function(options){
  var self = this;
  MongoMQ.call(self, options);
  self.on('dao::load', function(){
    self.doLoad.apply(self, arguments);
  });
  self.on('dao::store', function(){
    self.doStore.apply(self, arguments);
  });
  self.store = new MongoConnection({database: 'invitify'});
  self.store.open();
};

util.inherits(DAO, MongoMQ);

DAO.prototype.doLoad = function(err, data, next){
  var self = this;
  console.log('load: ', data);
  self.store.find('items', {$or: [{_id: ObjectId(data)}, {name: data}]}, function(err, cursor){
    if(err){
      next({error: err}, true);
    }else{
      cursor.nextObject(function(err, record){
        if(record&&record.id&&!record.id){
          record.id = _id;
        }
        next(err||record, true);
      });
    }
  });
};

DAO.prototype.doStore = function(err, data, next){
  var self = this;
  console.log('store: ', data);
  if(data._id){
    var sel = {_id: data._id}, rec = data;
    delete rec._id;
    self.store.update('items', sel, data, function(err, updated){
      if(err){
        next({error: err}, true);
      }else{
        next(updated, true);
      }
    });
  }else{
    self.store.insert('items', data, function(err, record){
      if(err){
        next({error: err}, true);
      }else{
        record = record[0]||false;
        if(record&&!record.id){
          record.id = record._id;
        }
        next(record, true);
      }
    });
  }
};

var dao = new DAO();
dao.start();