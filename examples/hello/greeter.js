var MC = require('../../lib/lib').MongoConnection;
var MQ = require('../../lib/lib').MongoMQ;

var options = {host: 'localhost', databaseName: 'tests', queueCollection: 'capped_collection', autoStart: true,
    serverOptions: {
      socketOptions: {
        connectTimeoutMS: 15000,
        socketTimeoutMS: 15000
      }
    }
};

var mq = module.exports = new MQ(options);

var log;

var handleRecord = function(err, data, next){
  if(!err){
    log.insert({handled: data}, {w:0});
    next('Hello '+(data||'world')+'!');
  }else{
    console.log('err: ', err);
    next();
  }
};

mq.on('greet', handleRecord);

(function(){
  var logger = new MC(options);
  logger.open(function(err, mc){
    if(err){
      console.log('ERROR: ', err);
    }else{
      mc.collection('log', function(err, loggingCollection){
        log = loggingCollection;
        if(!options.autoStart){
          mq.start(function(err){
            if(err){
              console.log(err);
            }
          });
        }
      });
    }
  });
})();
