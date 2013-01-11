var MC = require('../../lib/lib').MongoConnection;
var MQ = require('../../lib/lib').MongoMQ;

var options = {databaseName: 'tests', queueCollection: 'capped_collection', autoStart: false};
//var options = {servers: ['ndcsrvcdep601', 'ndcsrvcdep602'], databaseName: 'tests', queueCollection: 'capped_collection', autoStart: false};

//options.listenerType = 'streams';
//options.listenerType = 'nextObject';

//Streams are great for broadcast event listeners, they are BAD for things that require processing and response
// as they can allow for node saturation and they are greedy.  The default listenerType is 'nextObject', you
// can also set the listener type on the listener itself using:
//   MQ.on('event', {listenerType: ''}, callback) or
//   MQ.once('event', {listenerType: ''}, callback)

var mq = module.exports = new MQ(options);

var log;

var handleRecord = function(err, data, next){
  var w = Math.floor(Math.random()*100);
  if(!err){
    console.log('data: ', data, 'wait: ', w);
    log.insert({handled: data}, {w:0});
  }else{
    console.log('err: ', err, 'wait: ', w);
  }
  next();
};

mq.on('test', handleRecord);

(function(){
  var logger = new MC(options);
  logger.open(function(err, mc){
    if(err){
      console.log('ERROR: ', err);
    }else{
      mc.collection('log', function(err, loggingCollection){
        log = loggingCollection;
        mq.start(function(err){
          if(err){
            console.log(err);
          }
        });
      });
    }
  });
})();
